import { describe, expect, it } from 'vitest'
import { buildEfacturaDashboard, buyerKind, efacturaStage, type DashboardInvoice } from '@/lib/efacturaDashboard'

const company = { company_name: 'Client SRL', cui: 'RO12345678', country: 'RO' }

function inv(id: string, extra: Partial<DashboardInvoice> = {}): DashboardInvoice {
  return { id, series: 'FCT', invoice_number: id, issue_date: '2026-09-21', status: 'sent', clients: company, ...extra }
}

describe('efactura dashboard', () => {
  it('places every invoice in one stage', () => {
    expect(efacturaStage(inv('1'))).toBe('todo')
    expect(efacturaStage(inv('2', { efactura_status: 'queued' }))).toBe('queued')
    expect(efacturaStage(inv('3', { efactura_status: 'in_processing' }))).toBe('anaf')
    expect(efacturaStage(inv('4', { efactura_status: 'accepted' }))).toBe('accepted')
    expect(efacturaStage(inv('5', { status: 'spv' }))).toBe('accepted')
    expect(efacturaStage(inv('6', { efactura_status: 'rejected', status: 'paid' }))).toBe('rejected')
  })

  it('tells companies, individuals and foreign buyers apart', () => {
    expect(buyerKind(company)).toBe('company')
    expect(buyerKind({ cui: '0000000000000' })).toBe('person')
    expect(buyerKind({ cui: '1850101123456' })).toBe('person')
    expect(buyerKind({ cui: '' })).toBe('person')
    expect(buyerKind({ cui: 'DE123456789', country: 'DE' })).toBe('foreign')
  })

  it('finds what is late, what is due soon, what is rejected or stuck', () => {
    const now = Date.parse('2026-09-28T09:00:00Z')
    const model = buildEfacturaDashboard([
      inv('late', { issue_date: '2026-09-18' }), // deadline Fri 25 Sep
      inv('today', { issue_date: '2026-09-21' }), // deadline Mon 28 Sep
      inv('soon', { issue_date: '2026-09-23' }), // deadline Wed 30 Sep
      inv('later', { issue_date: '2026-09-25' }), // deadline Fri 2 Oct
      inv('rej', { efactura_status: 'rejected', efactura_error: 'BR-RO-110 CountrySubentity' }),
      inv('stuck', { efactura_status: 'in_processing', efactura_uploaded_at: '2026-09-26T08:00:00Z' }),
      inv('fresh', { efactura_status: 'uploaded', efactura_uploaded_at: '2026-09-28T08:00:00Z' }),
      inv('gaveup', { efactura_status: 'queued', efactura_attempts: 14, efactura_next_attempt_at: null }),
      inv('ok', { efactura_status: 'accepted' }),
      inv('old-ok', { efactura_status: 'accepted', issue_date: '2026-01-10' }),
      inv('abroad', { issue_date: '2026-09-01', clients: { company_name: 'GmbH', cui: 'DE1', country: 'DE' } }),
      inv('draft', { status: 'draft' })
    ], { today: '2026-09-28', periodDays: 30, now })

    expect(model.rows).toHaveLength(11)
    expect(model.overdue.map(r => r.invoice.id)).toEqual(['late'])
    expect(model.overdue[0].daysLeft).toBe(-1)
    expect(model.dueSoon.map(r => r.invoice.id)).toEqual(['today', 'gaveup', 'soon'])
    expect(model.rejected.map(r => r.invoice.id)).toEqual(['rej'])
    expect(model.stuck.map(r => r.invoice.id)).toEqual(['stuck'])
    expect(model.queueGaveUp.map(r => r.invoice.id)).toEqual(['gaveup'])
    expect(model.flow).toEqual({ todo: 5, queued: 1, anaf: 2, accepted: 1, rejected: 1 })
    expect(model.calendar.map(d => d.date)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
    expect(model.calendar.map(d => d.count)).toEqual([3, 0, 1, 0, 1])
  })
})
