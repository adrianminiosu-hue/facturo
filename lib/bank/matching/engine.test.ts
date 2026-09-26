import { describe, expect, it } from 'vitest'
import { AUTO_APPLY_THRESHOLD, RULE } from '@/lib/bank/matching/constants'
import { extractInvoiceRefs } from '@/lib/bank/matching/extractRefs'
import { matchBankTransaction } from '@/lib/bank/matching/engine'
import type { EngineInput, MatchInvoice } from '@/lib/bank/matching/types'

function invoice(partial: Partial<MatchInvoice> & Pick<MatchInvoice, 'id' | 'invoice_number' | 'remaining_bani'>): MatchInvoice {
  return {
    series: 'FCT',
    client_id: 'c1',
    client_name: 'Finsquare IT Solutions SRL',
    client_cui: 'RO12345678',
    client_ibans: ['RO49AAAA1B31007593840000'],
    issue_date: '2026-09-01',
    due_date: '2026-09-16',
    currency: 'RON',
    direction: 'issued',
    ...partial
  }
}

function input(over: Partial<EngineInput> & { transaction: EngineInput['transaction']; invoices: MatchInvoice[] }): EngineInput {
  return {
    seriesList: ['FCT'],
    defaultSeries: 'FCT',
    rules: [],
    ...over
  }
}

describe('extractInvoiceRefs', () => {
  it('reads common Romanian reference formats', () => {
    const series = ['FCT']
    expect(extractInvoiceRefs('FCT0026', series, 'FCT')).toEqual([{ series: 'FCT', number: '26' }])
    expect(extractInvoiceRefs('FCT 26', series, 'FCT')).toEqual([{ series: 'FCT', number: '26' }])
    expect(extractInvoiceRefs('fct-0026', series, 'FCT')).toEqual([{ series: 'FCT', number: '26' }])
    expect(extractInvoiceRefs('F.0026', series, 'FCT')).toEqual([{ series: 'FCT', number: '26' }])
    expect(extractInvoiceRefs('factura 26', series, 'FCT')).toEqual([{ series: 'FCT', number: '26', anySeries: true }])
    expect(extractInvoiceRefs('c/v fact FCT26', series, 'FCT')).toEqual([{ series: 'FCT', number: '26' }])
    expect(extractInvoiceRefs('FCT0026 FCT0027', series, 'FCT')).toEqual([
      { series: 'FCT', number: '26' },
      { series: 'FCT', number: '27' }
    ])
  })

  it('reads the forms people actually type on payment orders', () => {
    const series = ['FCT']
    const keys = (text: string) => extractInvoiceRefs(text, series, 'FCT').map(ref => `${ref.series}:${ref.number}`)
    expect(keys('C/V FACTURA NR. 31 DIN 05.09.2026')).toEqual(['FCT:31'])
    expect(keys('plata ff 34')).toEqual(['FCT:34'])
    expect(keys('Contravaloare factură nr 41')).toEqual(['FCT:41'])
    expect(keys('FACTURA FISCALA SERIA FCT NR 12')).toEqual(['FCT:12'])
    expect(keys('PLATA FACTURI FCT18, 19')).toEqual(['FCT:18', 'FCT:19'])
    expect(keys('fact 41 si 42')).toEqual(['FCT:41', 'FCT:42'])
    expect(keys('FCT 7+8')).toEqual(['FCT:7', 'FCT:8'])
    expect(keys('AVANS CONTRACT 12')).toEqual([])
    expect(keys('INVESTITII 5')).toEqual([])
    expect(keys('FCT18, 500 LEI')).toEqual(['FCT:18'])
    expect(keys('factura 12/2026')).toEqual(['FCT:12'])
  })

  it('does not take digits from IBANs, CUIs, dates or amounts', () => {
    const series = ['FCT']
    expect(extractInvoiceRefs('RO49AAAA1B31007593840026', series, 'FCT')).toEqual([])
    expect(extractInvoiceRefs('CUI RO1230026', series, 'FCT')).toEqual([])
    expect(extractInvoiceRefs('plata 20.09.2026 1,234.56', series, 'FCT')).toEqual([])
  })
})

describe('matchBankTransaction', () => {
  const base = invoice({ id: 'inv-26', invoice_number: '0026', remaining_bani: 10000 })

  it('invoice_ref exact unique amount', () => {
    const result = matchBankTransaction(input({
      invoices: [base],
      transaction: { amount_bani: 10000, currency: 'RON', counterparty_name: '', counterparty_iban: '', description: 'plata FCT0026' }
    }))
    expect(result?.rule).toBe(RULE.invoiceRef)
    expect(result?.confidence).toBe(98)
    expect(result?.auto).toBe(true)
  })

  it('invoice_ref_multi when amount equals sum', () => {
    const second = invoice({ id: 'inv-27', invoice_number: '0027', remaining_bani: 5000, issue_date: '2026-09-02' })
    const result = matchBankTransaction(input({
      invoices: [base, second],
      transaction: { amount_bani: 15000, currency: 'RON', counterparty_name: '', counterparty_iban: '', description: 'FCT0026 FCT0027' }
    }))
    expect(result?.rule).toBe(RULE.invoiceRefMulti)
    expect(result?.confidence).toBe(97)
    expect(result?.allocations).toHaveLength(2)
  })

  it('invoice_ref_partial when amount is below remaining', () => {
    const result = matchBankTransaction(input({
      invoices: [base],
      transaction: { amount_bani: 4000, currency: 'RON', counterparty_name: '', counterparty_iban: '', description: 'FCT 26' }
    }))
    expect(result?.rule).toBe(RULE.invoiceRefPartial)
    expect(result?.confidence).toBe(90)
    expect(result?.allocations[0].amount_bani).toBe(4000)
  })

  it('iban_amount when IBAN identifies the client and amount matches one invoice', () => {
    const result = matchBankTransaction(input({
      invoices: [base, invoice({ id: 'other', invoice_number: '99', remaining_bani: 8000, client_id: 'c2', client_ibans: [] })],
      transaction: {
        amount_bani: 10000,
        currency: 'RON',
        counterparty_name: '',
        counterparty_iban: 'RO49AAAA1B31007593840000',
        description: 'transfer'
      }
    }))
    expect(result?.rule).toBe(RULE.ibanAmount)
    expect(result?.confidence).toBe(92)
    expect(result?.auto).toBe(true)
  })

  it('multi_invoice: a unique combination from a known IBAN is applied', () => {
    const a = invoice({ id: 'a', invoice_number: '1', remaining_bani: 3000, issue_date: '2026-01-01' })
    const b = invoice({ id: 'b', invoice_number: '2', remaining_bani: 7000, issue_date: '2026-02-01' })
    const result = matchBankTransaction(input({
      invoices: [b, a],
      transaction: {
        amount_bani: 10000,
        currency: 'RON',
        counterparty_name: '',
        counterparty_iban: 'RO49AAAA1B31007593840000',
        description: ''
      }
    }))
    expect(result?.rule).toBe(RULE.multiInvoice)
    expect(result?.confidence).toBe(90)
    expect(result?.auto).toBe(true)
    expect(result?.allocations.map(item => item.invoiceId)).toEqual(['a', 'b'])
  })

  it('partial_oldest when client is known and amount does not match a combo', () => {
    const result = matchBankTransaction(input({
      invoices: [base],
      transaction: {
        amount_bani: 2500,
        currency: 'RON',
        counterparty_name: '',
        counterparty_iban: 'RO49AAAA1B31007593840000',
        description: ''
      }
    }))
    expect(result?.rule).toBe(RULE.partialOldest)
    expect(result?.confidence).toBe(60)
    expect(result?.allocations[0].amount_bani).toBe(2500)
  })

  it('name_amount: a name that fits one client is a suggestion, never applied alone', () => {
    const result = matchBankTransaction(input({
      invoices: [base],
      transaction: {
        amount_bani: 10000,
        currency: 'RON',
        counterparty_name: 'FINSQUARE IT SOLUTIONS S.R.L.',
        counterparty_iban: '',
        description: ''
      }
    }))
    expect(result?.rule).toBe(RULE.nameAmount)
    expect(result?.confidence).toBe(80)
    expect(result?.auto).toBe(false)
  })

  it('name_amount at 45 when the name fits several clients', () => {
    const other = invoice({ id: 'o', invoice_number: '90', remaining_bani: 5000, client_id: 'c2', client_name: 'Finsquare IT Solutions Holding SRL', client_ibans: [] })
    const result = matchBankTransaction(input({
      invoices: [base, other],
      transaction: { amount_bani: 10000, currency: 'RON', counterparty_name: 'FINSQUARE IT SOLUTIONS', counterparty_iban: '', description: '' }
    }))
    expect(result?.rule).toBe(RULE.nameAmount)
    expect(result?.confidence).toBe(45)
  })

  it('a name alone never books money against the oldest invoice', () => {
    const result = matchBankTransaction(input({
      invoices: [base],
      transaction: { amount_bani: 1234, currency: 'RON', counterparty_name: 'FINSQUARE IT SOLUTIONS SRL', counterparty_iban: '', description: '' }
    }))
    expect(result).toBeNull()
  })

  it('finds a non-consecutive combination of invoices', () => {
    const a = invoice({ id: 'a', invoice_number: '1', remaining_bani: 3000, issue_date: '2026-01-01' })
    const b = invoice({ id: 'b', invoice_number: '2', remaining_bani: 7000, issue_date: '2026-02-01' })
    const c = invoice({ id: 'c', invoice_number: '3', remaining_bani: 1100, issue_date: '2026-03-01' })
    const result = matchBankTransaction(input({
      invoices: [a, b, c],
      transaction: { amount_bani: 4100, currency: 'RON', counterparty_name: '', counterparty_iban: 'RO49AAAA1B31007593840000', description: '' }
    }))
    expect(result?.rule).toBe(RULE.multiInvoice)
    expect(result?.allocations.map(item => item.invoiceId)).toEqual(['a', 'c'])
  })

  it('an ambiguous combination is only a suggestion', () => {
    const a = invoice({ id: 'a', invoice_number: '1', remaining_bani: 3000, issue_date: '2026-01-01' })
    const b = invoice({ id: 'b', invoice_number: '2', remaining_bani: 3000, issue_date: '2026-02-01' })
    const c = invoice({ id: 'c', invoice_number: '3', remaining_bani: 3000, issue_date: '2026-03-01' })
    const result = matchBankTransaction(input({
      invoices: [a, b, c],
      transaction: { amount_bani: 6000, currency: 'RON', counterparty_name: '', counterparty_iban: 'RO49AAAA1B31007593840000', description: '' }
    }))
    expect(result?.auto).toBe(false)
    expect(result?.allocations.map(item => item.invoiceId)).toEqual(['a', 'b'])
  })

  it('a listed number of another client is not trusted', () => {
    const own = invoice({ id: 'own', invoice_number: '18', remaining_bani: 5000 })
    const foreign = invoice({ id: 'foreign', invoice_number: '19', remaining_bani: 5000, client_id: 'c2', client_name: 'Other SRL', client_ibans: [] })
    const result = matchBankTransaction(input({
      invoices: [own, foreign],
      transaction: { amount_bani: 10000, currency: 'RON', counterparty_name: '', counterparty_iban: '', description: 'FCT18, 19' }
    }))
    expect(result?.allocations.map(item => item.invoiceId)).toEqual(['own'])
    expect(result?.auto).toBe(false)
  })

  it('paying double one reference is not auto-applied as an overpayment', () => {
    const result = matchBankTransaction(input({
      invoices: [base],
      transaction: { amount_bani: 20000, currency: 'RON', counterparty_name: '', counterparty_iban: '', description: 'FCT0026' }
    }))
    expect(result?.rule).toBe(RULE.overpayment)
    expect(result?.auto).toBe(false)
  })

  it('a reference plus other invoices of the same client that make up the rest', () => {
    const other = invoice({ id: 'o', invoice_number: '27', remaining_bani: 4000, issue_date: '2026-09-05' })
    const result = matchBankTransaction(input({
      invoices: [base, other],
      transaction: { amount_bani: 14000, currency: 'RON', counterparty_name: '', counterparty_iban: '', description: 'FCT0026' }
    }))
    expect(result?.allocations.map(item => item.invoiceId)).toEqual(['inv-26', 'o'])
    expect(result?.auto).toBe(false)
  })

  it('several references paid only in part go oldest first', () => {
    const later = invoice({ id: 'later', invoice_number: '27', remaining_bani: 4000, issue_date: '2026-09-05' })
    const result = matchBankTransaction(input({
      invoices: [later, base],
      transaction: { amount_bani: 12000, currency: 'RON', counterparty_name: '', counterparty_iban: '', description: 'FCT26 FCT27' }
    }))
    expect(result?.rule).toBe(RULE.invoiceRefPartial)
    expect(result?.allocations).toEqual([
      { invoiceId: 'inv-26', amount_bani: 10000 },
      { invoiceId: 'later', amount_bani: 2000 }
    ])
    expect(result?.auto).toBe(false)
  })

  it('bank fees withheld: a payment a little short of one invoice is proposed', () => {
    const result = matchBankTransaction(input({
      invoices: [invoice({ id: 'big', invoice_number: '40', remaining_bani: 6655000 })],
      transaction: { amount_bani: 6653000, currency: 'RON', counterparty_name: '', counterparty_iban: 'RO49AAAA1B31007593840000', description: '' }
    }))
    expect(result?.rule).toBe(RULE.amountNear)
    expect(result?.auto).toBe(false)
    expect(result?.allocations[0].amount_bani).toBe(6653000)
  })

  it('a CUI inside another number is not a match', () => {
    const result = matchBankTransaction(input({
      invoices: [invoice({ id: 'x', invoice_number: '9', remaining_bani: 5000, client_cui: '1234', client_ibans: [] })],
      transaction: { amount_bani: 5000, currency: 'RON', counterparty_name: '', counterparty_iban: '', description: 'OP 9912345' }
    }))
    expect(result).toBeNull()
  })

  it('caps duplicate invoice numbers below auto-apply', () => {
    const dup = invoice({ id: 'dup', invoice_number: '0026', remaining_bani: 10000, client_id: 'c9' })
    const result = matchBankTransaction(input({
      invoices: [base, dup],
      transaction: { amount_bani: 10000, currency: 'RON', counterparty_name: '', counterparty_iban: '', description: 'FCT0026' }
    }))
    expect(result?.confidence).toBeLessThan(AUTO_APPLY_THRESHOLD)
    expect(result?.auto).toBe(false)
    expect(result?.rule).toBe(RULE.duplicateRef)
  })

  it('overpayment allocates remaining and keeps leftover', () => {
    const result = matchBankTransaction(input({
      invoices: [base],
      transaction: { amount_bani: 15000, currency: 'RON', counterparty_name: '', counterparty_iban: '', description: 'FCT0026' }
    }))
    expect(result?.overpayment_bani).toBe(5000)
    expect(result?.allocations[0].amount_bani).toBe(10000)
  })

  it('rejects different currency', () => {
    const result = matchBankTransaction(input({
      invoices: [base],
      transaction: { amount_bani: 10000, currency: 'EUR', counterparty_name: '', counterparty_iban: '', description: 'FCT0026' }
    }))
    expect(result).toBeNull()
  })

  it('matches outgoing amounts only to purchase invoices', () => {
    const purchase = invoice({
      id: 'pur-1',
      invoice_number: '88',
      remaining_bani: 20000,
      direction: 'purchase',
      client_name: 'Supplier SRL'
    })
    const result = matchBankTransaction(input({
      invoices: [base, purchase],
      transaction: { amount_bani: -20000, currency: 'RON', counterparty_name: '', counterparty_iban: '', description: 'FCT88' }
    }))
    expect(result?.allocations[0].invoiceId).toBe('pur-1')
  })

  it('iban_amount also fires from a learned bank_match_rules IBAN', () => {
    const result = matchBankTransaction(input({
      invoices: [invoice({ id: 'inv-l', invoice_number: '55', remaining_bani: 8000, client_ibans: [] })],
      rules: [{ client_id: 'c1', counterparty_iban: 'RO22CCCC1B31007593841111', counterparty_name_norm: null }],
      transaction: {
        amount_bani: 8000,
        currency: 'RON',
        counterparty_name: '',
        counterparty_iban: 'RO22CCCC1B31007593841111',
        description: 'transfer'
      }
    }))
    expect(result?.rule).toBe(RULE.ibanAmount)
    expect(result?.confidence).toBe(92)
    expect(result?.auto).toBe(true)
  })

  it('uses remaining after prepaid_amount already baked into remaining_bani', () => {
    const prepaid = invoice({ id: 'pre', invoice_number: '10', remaining_bani: 4000 })
    const result = matchBankTransaction(input({
      invoices: [prepaid],
      transaction: { amount_bani: 4000, currency: 'RON', counterparty_name: '', counterparty_iban: '', description: 'FCT10' }
    }))
    expect(result?.rule).toBe(RULE.invoiceRef)
    expect(result?.allocations[0].amount_bani).toBe(4000)
  })
})
