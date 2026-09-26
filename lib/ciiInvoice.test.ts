import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseUblInvoice } from './ublInvoice'
import { purchaseAmounts } from './spvPurchaseImport'

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

describe('CII (CrossIndustryInvoice) import', () => {
  it('reads a CIUS-RO CII invoice into the same shape as UBL', () => {
    const inv = parseUblInvoice(fixture('cii-invoice-eur.xml'))
    expect(inv).toMatchObject({
      typeCode: '380',
      isCreditNote: false,
      id: 'LOG-2026/0917',
      series: 'LOG',
      number: '2026/0917',
      issueDate: '2026-09-22',
      dueDate: '2026-10-22',
      currency: 'EUR',
      fxRate: 5.0851
    })
    expect(inv.supplier).toMatchObject({ name: 'LOGISTIC NORD S.R.L.', cui: '14399840', vatId: 'RO14399840', address: 'Str. Fabricii 7', city: 'Cluj-Napoca', county: 'RO-CJ', country: 'RO' })
    expect(inv.customer).toMatchObject({ name: 'Finsquare IT Solutions', cui: '12312343', vatId: '' })
    expect(inv.lines).toHaveLength(2)
    expect(inv.lines[0]).toMatchObject({ description: 'Transport rutier Cluj - Bucuresti', quantity: 2, unitCode: 'C62', unitPrice: 450, net: 900, vatRate: 21, vatCategory: 'S' })
    // Price given per 10 units (BasisQuantity).
    expect(inv.lines[1]).toMatchObject({ quantity: 10, unitCode: 'H87', unitPrice: 10, net: 100 })
    expect(inv.totals).toEqual({ net: 1000, vat: 210, total: 1210, prepaid: 200, payable: 1010 })
    expect(inv.notes).toEqual(['Transport & manipulare'])
    expect(inv.payeeIbans).toEqual([])
  })

  it('treats TypeCode 381 as a credit note and stores it negative in RON', () => {
    const xml = fixture('cii-invoice-eur.xml').replace('<ram:TypeCode>380</ram:TypeCode>', '<ram:TypeCode>381</ram:TypeCode>')
    const cn = parseUblInvoice(xml)
    expect(cn.isCreditNote).toBe(true)
    const a = purchaseAmounts(cn)
    expect(a).toMatchObject({ converted: true, currency: 'RON', exchangeRate: 5.0851, subtotal: -5085.1, vat: -1067.87, total: -6152.97 })
    expect(a.lines[0]).toMatchObject({ quantity: -2, unit_price: 2288.295 })
  })

  it('falls back to the issue date and the legal id when due date and VAT id are missing', () => {
    const xml = fixture('cii-invoice-eur.xml')
      .replace(/<ram:SpecifiedTradePaymentTerms>[\s\S]*?<\/ram:SpecifiedTradePaymentTerms>/, '')
      .replace('<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">RO14399840</ram:ID></ram:SpecifiedTaxRegistration>', '')
    const inv = parseUblInvoice(xml)
    expect(inv.dueDate).toBe('2026-09-22')
    expect(inv.supplier).toMatchObject({ cui: '14399840', vatId: '' })
  })

  it('reads the supplier IBAN from the payment means', () => {
    const xml = fixture('cii-invoice-eur.xml').replace(
      '<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>',
      '<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode><ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>42</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>RO12BTRL0000000000000001</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>'
    )
    expect(parseUblInvoice(xml).payeeIbans).toEqual(['RO12BTRL0000000000000001'])
  })
})
