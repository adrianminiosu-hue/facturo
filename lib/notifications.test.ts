import { describe, expect, it } from 'vitest'
import { buildNotifications, unreadCount, type NotificationInvoice, type NotificationSources } from '@/lib/notifications'

const client = { company_name: 'Siemens S.R.L.', cui: 'RO1234567', country: 'RO' }
const supplier = { company_name: 'Orange Romania', cui: 'RO9010105', country: 'RO' }

function issued(id: string, extra: Partial<NotificationInvoice> = {}): NotificationInvoice {
  return { id, series: 'FCT', invoice_number: id, issue_date: '2026-09-10', due_date: '2026-09-25', total: 1000, amount_paid: 0, status: 'sent', efactura_status: 'accepted', clients: client, ...extra }
}
function purchase(id: string, extra: Partial<NotificationInvoice> = {}): NotificationInvoice {
  return { id, series: 'OR', invoice_number: id, issue_date: '2026-09-10', due_date: '2026-09-30', total: 500, amount_paid: 0, status: 'sent', direction: 'purchase', clients: supplier, ...extra }
}

const today = '2026-09-28'
const now = Date.parse('2026-09-28T10:00:00+03:00')

function build(partial: Partial<NotificationSources>) {
  return buildNotifications({ invoices: [], payments: [], reminders: [], bankImports: [], ...partial }, { today, now })
}

describe('notifications', () => {
  it('says "paid in full" on the payment that settles the invoice, "partial" before', () => {
    const { feed } = build({
      invoices: [issued('30', { amount_paid: 1000 })],
      payments: [
        { id: 'p1', invoice_id: '30', amount: 400, created_at: '2026-09-26T09:00:00Z', source: 'manual' },
        { id: 'p2', invoice_id: '30', amount: 600, created_at: '2026-09-27T09:00:00Z', source: 'camt053' }
      ]
    })
    expect(feed.map(item => item.key)).toEqual(['ntf.paidIn', 'ntf.paidInPartial'])
    expect(feed[0]).toMatchObject({ amount: 600, vars: { source: 'bank' }, day: '2026-09-27', tone: 'good' })
  })

  it('flags invoices the day after their due date while they stay unpaid, both ways', () => {
    const { feed } = build({
      invoices: [
        issued('late', { due_date: '2026-09-25' }),
        issued('paid', { due_date: '2026-09-25', amount_paid: 1000 }),
        issued('old', { due_date: '2026-07-01' }),
        purchase('sup', { due_date: '2026-09-26' })
      ]
    })
    const kinds = feed.map(item => `${item.kind}:${item.refs[0].label}:${item.day}`)
    expect(kinds).toEqual(['overdueOut:ORsup:2026-09-27', 'overdueIn:FCTlate:2026-09-26'])
    expect(feed[0].action).toEqual({ key: 'ntf.act.pay', href: '/facturi-achizitie/sup' })
  })

  it('groups more than two events of one kind on one day, with the total', () => {
    const invoices = ['a', 'b', 'c'].map(id => issued(id, { amount_paid: 1000 }))
    const payments = invoices.map((invoice, index) => ({ id: `p${index}`, invoice_id: invoice.id, amount: 1000, created_at: `2026-09-28T0${index + 6}:00:00Z` }))
    const { feed } = build({ invoices, payments })
    expect(feed).toHaveLength(1)
    expect(feed[0]).toMatchObject({ key: 'ntf.paidIn.many', vars: { count: 3 }, amount: 3000 })
    expect(feed[0].refs.map(ref => ref.label)).toEqual(['FCTa', 'FCTb', 'FCTc'])
  })

  it('lists what comes up: due dates in the next 3 days, grouped per day', () => {
    const { upcoming } = build({
      invoices: [
        purchase('o1', { due_date: '2026-09-29', total: 1240 }),
        purchase('o2', { due_date: '2026-09-29', total: 860 }),
        issued('34', { due_date: '2026-10-01' }),
        issued('far', { due_date: '2026-10-09' })
      ],
      tokenExpiresAt: '2026-10-02T10:00:00+03:00'
    })
    expect(upcoming.map(item => `${item.key}:${item.date}`)).toEqual([
      'ntf.dueOut.many:2026-09-29',
      'ntf.dueIn:2026-10-01',
      'ntf.tokenSoon:2026-10-02'
    ])
    expect(upcoming[0].amount).toBe(2100)
  })

  it('reports rejected e-Factura invoices, sent reminders and statement imports', () => {
    const { feed } = build({
      invoices: [issued('11', { efactura_status: 'rejected', efactura_uploaded_at: '2026-09-27T12:00:00Z', due_date: '2026-10-20' })],
      reminders: [{ id: 'r1', invoice_id: '11', kind: 'auto', sent_at: '2026-09-28T06:00:00Z' }],
      bankImports: [{ id: 'b1', created_at: '2026-09-26T15:00:00Z', payload: { newCount: 5, autoMatched: 3, toConfirm: 2 } }]
    })
    expect(feed.map(item => item.kind)).toEqual(['reminderAuto', 'efacturaRejected', 'bankImport'])
    expect(feed[2]).toMatchObject({ tone: 'warn', vars: { lines: 5, auto: 3, toConfirm: 2 }, action: { href: '/banca' } })
  })

  it('counts what is new since the last visit, whatever the timestamp format', () => {
    const { feed } = build({
      invoices: [issued('late', { due_date: '2026-09-25' })],
      reminders: [{ id: 'r1', invoice_id: 'late', sent_at: '2026-09-28T06:00:00+00:00' }]
    })
    expect(unreadCount(feed, null)).toBe(2)
    expect(unreadCount(feed, '2026-09-27T12:00:00+03:00')).toBe(1)
    expect(unreadCount(feed, '2026-09-28T09:30:00+03:00')).toBe(0)
  })
})
