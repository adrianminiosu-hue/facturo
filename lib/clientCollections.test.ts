import { describe, expect, it } from 'vitest'
import {
  delayTrend,
  expectedPayDate,
  paymentDelay,
  sortSummaries,
  summarizeClient,
  type CollectionInvoice
} from '@/lib/clientCollections'

const today = '2026-09-25'

function inv(partial: Partial<CollectionInvoice>): CollectionInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    client_id: 'c1',
    series: 'FCT',
    invoice_number: '0001',
    due_date: '2026-09-10',
    billed: 1000,
    rest: 0,
    status: 'paid',
    ...partial
  }
}

describe('paymentDelay', () => {
  it('counts days after the due date and treats early payment as 0', () => {
    expect(paymentDelay({ due_date: '2026-09-10', settled_on: '2026-09-22' })).toBe(12)
    expect(paymentDelay({ due_date: '2026-09-10', settled_on: '2026-09-01' })).toBe(0)
    expect(paymentDelay({ due_date: '2026-09-10', settled_on: null })).toBeNull()
  })
})

describe('delayTrend', () => {
  it('needs at least 4 settled invoices', () => {
    expect(delayTrend([1, 2, 3])).toBeNull()
  })
  it('detects worsening and improving payers', () => {
    expect(delayTrend([2, 5, 4, 9, 11, 14])).toBe('worse')
    expect(delayTrend([14, 12, 10, 2, 1, 0])).toBe('better')
    expect(delayTrend([5, 5, 6, 5, 6, 5])).toBe('stable')
  })
})

describe('expectedPayDate', () => {
  it('uses a future promise first, else due date plus usual delay, never before today', () => {
    expect(expectedPayDate(inv({ promised_pay_date: '2026-10-02', status: 'sent', rest: 10 }), 5, today)).toBe('2026-10-02')
    expect(expectedPayDate(inv({ due_date: '2026-09-28', status: 'sent', rest: 10 }), 4, today)).toBe('2026-10-02')
    expect(expectedPayDate(inv({ due_date: '2026-09-01', status: 'sent', rest: 10 }), 2, today)).toBe(today)
  })
})

describe('summarizeClient', () => {
  it('flags a client as risk when an invoice is more than 30 days overdue', () => {
    const s = summarizeClient('c1', [inv({ due_date: '2026-08-20', status: 'sent', rest: 30250, billed: 30250 })], today)
    expect(s.behaviour).toBe('risk')
    expect(s.overdueAmount).toBe(30250)
    expect(s.oldestOverdueDays).toBe(36)
  })

  it('computes average delay from settled invoices and marks frequent late payers', () => {
    const invoices = [
      inv({ due_date: '2026-06-01', settled_on: '2026-06-11' }),
      inv({ due_date: '2026-07-01', settled_on: '2026-07-15' }),
      inv({ due_date: '2026-09-30', status: 'sent', rest: 5000, billed: 5000 })
    ]
    const s = summarizeClient('c1', invoices, today)
    expect(s.averageDelay).toBe(12)
    expect(s.behaviour).toBe('late')
    expect(s.openAmount).toBe(5000)
    expect(s.overdueAmount).toBe(0)
  })

  it('shows a promise when every overdue invoice has a future promised date', () => {
    const s = summarizeClient('c1', [
      inv({ due_date: '2026-09-20', settled_on: null, status: 'sent', rest: 24200, promised_pay_date: '2026-10-02' })
    ], today)
    expect(s.behaviour).toBe('promised')
    expect(s.nextPromise).toBe('2026-10-02')
  })

  it('marks on-time payers and new clients', () => {
    expect(summarizeClient('c1', [
      inv({ due_date: '2026-08-01', settled_on: '2026-08-01' }),
      inv({ due_date: '2026-10-08', status: 'sent', rest: 100, billed: 100 })
    ], today).behaviour).toBe('on_time')
    expect(summarizeClient('c1', [inv({ due_date: '2026-10-08', status: 'sent', rest: 100, billed: 100 })], today).behaviour).toBe('new')
  })

  it('sums what is expected to come in within 7 days', () => {
    const s = summarizeClient('c1', [
      inv({ due_date: '2026-09-28', status: 'sent', rest: 1000, billed: 1000 }),
      inv({ due_date: '2026-10-20', status: 'sent', rest: 2000, billed: 2000 })
    ], today)
    expect(s.expectedThisWeek).toBe(1000)
  })
})

describe('sortSummaries', () => {
  it('puts risk first, then overdue money, then open balance', () => {
    const base = summarizeClient('x', [], today)
    const sorted = sortSummaries([
      { ...base, clientId: 'ok', behaviour: 'on_time', openAmount: 99999 },
      { ...base, clientId: 'late', behaviour: 'late', overdueAmount: 100 },
      { ...base, clientId: 'risk', behaviour: 'risk', overdueAmount: 10 }
    ])
    expect(sorted.map(s => s.clientId)).toEqual(['risk', 'late', 'ok'])
  })
})
