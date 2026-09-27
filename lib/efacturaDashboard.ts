import { addDaysIso } from '@/lib/dates'
import { alreadySentToSpv, isDraftInvoice, isEfacturaProcessing, isEfacturaQueued } from '@/lib/invoiceStatus'
import { efacturaDeadline, isWorkingDay, workingDaysBetween } from '@/lib/workingDays'

/** Where an issued invoice stands in e-Factura. */
export type EfacturaStage = 'todo' | 'queued' | 'anaf' | 'accepted' | 'rejected'
export const EFACTURA_STAGES: EfacturaStage[] = ['todo', 'queued', 'anaf', 'accepted', 'rejected']

/** Company (B2B), individual (B2C, e-Factura since 2025) or foreign buyer (reporting optional). */
export type BuyerKind = 'company' | 'person' | 'foreign'

export type DashboardInvoice = {
  id: string
  series?: string | null
  invoice_number?: string | null
  issue_date?: string | null
  status?: string | null
  notes?: string | null
  invoice_type_code?: string | null
  total?: number | null
  efactura_status?: string | null
  efactura_error?: string | null
  efactura_attempts?: number | null
  efactura_next_attempt_at?: string | null
  efactura_uploaded_at?: string | null
  efactura_index?: string | null
  clients?: { company_name?: string | null; cui?: string | null; country?: string | null } | null
}

export type DashboardRow = {
  invoice: DashboardInvoice
  ref: string
  clientName: string
  buyer: BuyerKind
  stage: EfacturaStage
  /** Legal upload deadline, only while the invoice still has to reach ANAF (and the buyer is Romanian). */
  deadline: string | null
  /** Working days left until the deadline: 0 = today, negative = late. */
  daysLeft: number | null
  /** At ANAF for more than a day without an answer. */
  stuck: boolean
  /** The retry queue gave up: needs a manual resend. */
  queueGaveUp: boolean
}

export function buyerKind(client?: DashboardInvoice['clients']): BuyerKind {
  const country = String(client?.country || 'RO').toUpperCase()
  if (country && country !== 'RO') return 'foreign'
  const digits = String(client?.cui || '').replace(/^RO/i, '').replace(/\D/g, '')
  if (!digits || /^0+$/.test(digits) || digits.length === 13) return 'person'
  return 'company'
}

export function efacturaStage(invoice: DashboardInvoice): EfacturaStage {
  if (invoice.efactura_status === 'rejected') return 'rejected'
  if (alreadySentToSpv(invoice)) return 'accepted'
  if (isEfacturaQueued(invoice)) return 'queued'
  if (isEfacturaProcessing(invoice)) return 'anaf'
  return 'todo'
}

const DAY_MS = 86_400_000

export function dashboardRow(invoice: DashboardInvoice, today: string, now = Date.now()): DashboardRow {
  const stage = efacturaStage(invoice)
  const buyer = buyerKind(invoice.clients)
  const mustReach = stage === 'todo' || stage === 'queued' || stage === 'rejected'
  const deadline = mustReach && buyer !== 'foreign' && invoice.issue_date ? efacturaDeadline(invoice.issue_date) : null
  const uploadedAt = invoice.efactura_uploaded_at ? Date.parse(invoice.efactura_uploaded_at) : NaN
  return {
    invoice,
    ref: `${invoice.series || ''}${invoice.invoice_number || ''}`,
    clientName: String(invoice.clients?.company_name || ''),
    buyer,
    stage,
    deadline,
    daysLeft: deadline ? workingDaysBetween(today, deadline) : null,
    stuck: stage === 'anaf' && Number.isFinite(uploadedAt) && now - uploadedAt > DAY_MS,
    queueGaveUp: stage === 'queued' && !invoice.efactura_next_attempt_at && Number(invoice.efactura_attempts || 0) > 0
  }
}

export type DashboardModel = {
  rows: DashboardRow[]
  /** Open work counts now (all time) and accepted in the period. */
  flow: Record<EfacturaStage, number>
  overdue: DashboardRow[]
  dueSoon: DashboardRow[]
  rejected: DashboardRow[]
  stuck: DashboardRow[]
  queueGaveUp: DashboardRow[]
  /** The next working days (today first when it is one) and how many invoices fall due on each. */
  calendar: Array<{ date: string; count: number }>
}

/** Due within this many working days counts as urgent. */
export const DUE_SOON_WORKING_DAYS = 2

export function buildEfacturaDashboard(
  invoices: DashboardInvoice[],
  opts: { today: string; periodDays: number; now?: number }
): DashboardModel {
  const since = addDaysIso(opts.today, -opts.periodDays)
  const rows = invoices
    .filter(invoice => !isDraftInvoice(invoice.status))
    .map(invoice => dashboardRow(invoice, opts.today, opts.now))
  const flow: Record<EfacturaStage, number> = { todo: 0, queued: 0, anaf: 0, accepted: 0, rejected: 0 }
  for (const row of rows) {
    if (row.stage === 'accepted') {
      if ((row.invoice.issue_date || '') >= since) flow.accepted += 1
    } else flow[row.stage] += 1
  }
  const byDeadline = (a: DashboardRow, b: DashboardRow) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99)
  const pending = rows.filter(row => row.deadline && row.stage !== 'rejected')
  const calendar: Array<{ date: string; count: number }> = []
  let day = opts.today
  while (calendar.length < 5) {
    if (isWorkingDay(day)) calendar.push({ date: day, count: rows.filter(row => row.deadline === day).length })
    day = addDaysIso(day, 1)
  }
  return {
    rows,
    flow,
    overdue: pending.filter(row => (row.daysLeft ?? 0) < 0).sort(byDeadline),
    dueSoon: pending.filter(row => row.daysLeft !== null && row.daysLeft >= 0 && row.daysLeft <= DUE_SOON_WORKING_DAYS).sort(byDeadline),
    rejected: rows.filter(row => row.stage === 'rejected').sort(byDeadline),
    stuck: rows.filter(row => row.stuck),
    queueGaveUp: rows.filter(row => row.queueGaveUp),
    calendar
  }
}
