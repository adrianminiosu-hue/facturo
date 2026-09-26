import { describe, expect, it } from 'vitest'
import { paymentReference } from '@/lib/paymentReference'
import { extractInvoiceRefs } from '@/lib/bank/matching/extractRefs'

describe('paymentReference', () => {
  it('is compact', () => {
    expect(paymentReference({ series: 'FCT', invoice_number: '0032' })).toBe('FCT0032')
    expect(paymentReference({ series: 'vy-', invoice_number: '12' })).toBe('VY12')
    expect(paymentReference({ series: '', invoice_number: 7 })).toBe('7')
  })

  it('is read back by the statement matcher, even inside a longer text', () => {
    for (const [series, number] of [['FCT', '0032'], ['VY', '1048'], ['A', '5']]) {
      const ref = paymentReference({ series, invoice_number: number })
      const found = extractInvoiceRefs(`OP 1203 PLATA ${ref} SERVICII`, [series], series)
      expect(found.map(item => `${item.series}:${item.number}`)).toContain(`${series}:${Number(number)}`)
    }
  })
})
