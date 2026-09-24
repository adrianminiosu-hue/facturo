import { describe, expect, it } from 'vitest'
import { invoiceOpenStatus } from '@/lib/bank/invoiceOpenStatus'

describe('invoiceOpenStatus', () => {
  it('never leaves draft', () => {
    expect(invoiceOpenStatus({ status: 'draft', due_date: '2020-01-01' })).toBe('draft')
  })

  it('restores spv from e-Factura fields', () => {
    expect(invoiceOpenStatus({ status: 'paid', efactura_status: 'accepted' })).toBe('spv')
    expect(invoiceOpenStatus({ status: 'paid', notes: 'ok\n[[FACTURO_SPV]]' })).toBe('spv')
  })

  it('restores overdue or sent', () => {
    expect(invoiceOpenStatus({ status: 'paid', due_date: '2020-01-01' }, '2026-09-24')).toBe('overdue')
    expect(invoiceOpenStatus({ status: 'paid', due_date: '2026-12-01' }, '2026-09-24')).toBe('sent')
  })
})
