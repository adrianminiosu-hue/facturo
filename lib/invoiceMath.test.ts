import { describe, expect, it } from 'vitest'
import { billedTotal, computeInvoiceTotals, remainingOf } from './invoiceMath'

describe('computeInvoiceTotals', () => {
  it('keeps negative (storno / corrective) lines negative', () => {
    // FCT0010: type 384, -1 x 2300 + 21% VAT
    const t = computeInvoiceTotals([{ quantity: -1, unit_price: 2300, tva_rate: 21 }])
    expect(t.subtotal).toBe(-2300)
    expect(t.tvaAmount).toBe(-483)
    expect(t.taxInclusive).toBe(-2783)
    expect(t.prepaid).toBe(0)
    expect(t.payable).toBe(-2783)
  })

  it('discounts a negative line towards zero, never past it', () => {
    expect(computeInvoiceTotals([{ quantity: -1, unit_price: 1000, tva_rate: 0, discount_percent: 10 }]).taxInclusive).toBe(-900)
    expect(computeInvoiceTotals([{ quantity: -1, unit_price: 1000, tva_rate: 0, discount_amount: 5000 }]).taxInclusive).toBe(0)
    expect(computeInvoiceTotals([{ quantity: -1, unit_price: 1000, tva_rate: 0 }], { discount_amount: 100 }).taxInclusive).toBe(-900)
  })

  it('leaves positive invoices unchanged', () => {
    const t = computeInvoiceTotals(
      [{ quantity: 3, unit_price: 23000, tva_rate: 21 }, { quantity: 1, unit_price: 20998, tva_rate: 21 }],
      { discount_percent: 10, prepaid_amount: 1000 }
    )
    expect(t.subtotal).toBe(80998.2)
    expect(t.taxInclusive).toBe(98007.82)
    expect(t.payable).toBe(97007.82)
    expect(computeInvoiceTotals([{ quantity: 1, unit_price: 1000, tva_rate: 21, discount_amount: 5000 }]).taxInclusive).toBe(0)
  })

  it('billedTotal matches the stored total for a storno invoice; nothing left to collect', () => {
    const storno = { total: -2783, invoice_items: [{ quantity: -1, unit_price: 2300, tva_rate: 21, total: -2783 }] }
    expect(billedTotal(storno)).toBe(-2783)
    expect(remainingOf(storno)).toBe(0)
  })

  it('still infers the EUR rate from converted line totals (FCT0032)', () => {
    const fct0032 = {
      total: 33408.1,
      subtotal: 27610,
      invoice_items: [
        { quantity: 1, unit_price: 3000, tva_rate: 21, total: 18222.6 },
        { quantity: 1, unit_price: 2500, tva_rate: 21, total: 15185.5 }
      ]
    }
    expect(billedTotal(fct0032)).toBe(33408.1)
  })
})
