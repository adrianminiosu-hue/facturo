import { addDaysIso, daysBetween } from '@/lib/dates'
import { roundMoney } from '@/lib/invoiceMath'

/** One issued invoice, reduced to what the collections-by-client view needs. */
export type CollectionInvoice = {
  id: string
  client_id: string
  series: string
  invoice_number: string
  issue_date?: string | null
  due_date: string
  billed: number
  rest: number
  status: string
  reminder_sent_at?: string | null
  promised_pay_date?: string | null
  /** Date of the payment that settled the invoice (latest payment), if known. */
  settled_on?: string | null
}

export type PaymentBehaviour = 'risk' | 'late' | 'promised' | 'on_time' | 'new'
export type DelayTrend = 'worse' | 'better' | 'stable' | null

export type ClientCollectionSummary = {
  clientId: string
  openCount: number
  openAmount: number
  overdueAmount: number
  /** Days past due of the oldest overdue open invoice (0 when nothing is overdue). */
  oldestOverdueDays: number
  /** Average days paid after the due date, over settled invoices of the last 12 months. */
  averageDelay: number | null
  settledSampleSize: number
  trend: DelayTrend
  behaviour: PaymentBehaviour
  nextPromise: string | null
  nextDue: string | null
  lastReminder: string | null
  expectedThisWeek: number
}

export const RISK_OVERDUE_DAYS = 30
export const LATE_AVERAGE_DAYS = 7
export const TREND_THRESHOLD_DAYS = 3

/** Days paid after the due date; paying early or on time counts as 0. */
export function paymentDelay(invoice: Pick<CollectionInvoice, 'due_date' | 'settled_on'>) {
  if (!invoice.settled_on || !invoice.due_date) return null
  return Math.max(0, daysBetween(invoice.due_date, invoice.settled_on))
}

function isOpen(invoice: CollectionInvoice) {
  return invoice.status !== 'paid' && invoice.rest > 0.009
}

function average(values: number[]) {
  if (!values.length) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

/** Settled invoices with a known payment date, oldest first. */
export function settledHistory(invoices: CollectionInvoice[], today: string, lookbackDays = 365) {
  const from = addDaysIso(today, -lookbackDays)
  return invoices
    .filter(inv => !isOpen(inv) && inv.settled_on && inv.settled_on >= from)
    .sort((a, b) => String(a.settled_on).localeCompare(String(b.settled_on)))
}

/** Compares the last 3 settled invoices with the 3 before them. Needs at least 4. */
export function delayTrend(delays: number[]): DelayTrend {
  if (delays.length < 4) return null
  const recent = delays.slice(-3)
  const previous = delays.slice(-6, -3)
  const diff = (average(recent) || 0) - (average(previous) || 0)
  if (diff >= TREND_THRESHOLD_DAYS) return 'worse'
  if (diff <= -TREND_THRESHOLD_DAYS) return 'better'
  return 'stable'
}

/** When an open invoice is expected to be paid: the promise, else due date shifted by the client's usual delay. */
export function expectedPayDate(invoice: CollectionInvoice, averageDelay: number | null, today: string) {
  if (invoice.promised_pay_date && invoice.promised_pay_date >= today) return invoice.promised_pay_date
  const shifted = addDaysIso(invoice.due_date, Math.round(averageDelay || 0))
  return shifted < today ? today : shifted
}

export function summarizeClient(clientId: string, invoices: CollectionInvoice[], today: string): ClientCollectionSummary {
  const open = invoices.filter(isOpen)
  const history = settledHistory(invoices, today)
  const delays = history.map(inv => paymentDelay(inv) ?? 0)
  const averageDelay = average(delays)
  const overdue = open.filter(inv => daysBetween(inv.due_date, today) > 0)
  const oldestOverdueDays = overdue.reduce((max, inv) => Math.max(max, daysBetween(inv.due_date, today)), 0)
  const promises = open
    .map(inv => inv.promised_pay_date)
    .filter((d): d is string => Boolean(d && d >= today))
    .sort()
  const nextDue = open.map(inv => inv.due_date).filter(d => d >= today).sort()[0] || null
  const reminders = invoices.map(inv => inv.reminder_sent_at).filter((d): d is string => Boolean(d)).sort()
  const weekEnd = addDaysIso(today, 7)
  const expectedThisWeek = open
    .filter(inv => expectedPayDate(inv, averageDelay, today) <= weekEnd)
    .reduce((s, inv) => s + inv.rest, 0)

  let behaviour: PaymentBehaviour
  if (oldestOverdueDays > RISK_OVERDUE_DAYS) behaviour = 'risk'
  else if (promises.length && overdue.every(inv => inv.promised_pay_date && inv.promised_pay_date >= today)) behaviour = 'promised'
  else if ((averageDelay ?? 0) > LATE_AVERAGE_DAYS || (overdue.length && history.length === 0)) behaviour = 'late'
  else if (history.length === 0 && !overdue.length) behaviour = 'new'
  else if (overdue.length) behaviour = 'late'
  else behaviour = 'on_time'

  return {
    clientId,
    openCount: open.length,
    openAmount: roundMoney(open.reduce((s, inv) => s + inv.rest, 0)),
    overdueAmount: roundMoney(overdue.reduce((s, inv) => s + inv.rest, 0)),
    oldestOverdueDays,
    averageDelay: averageDelay === null ? null : Math.round(averageDelay * 10) / 10,
    settledSampleSize: history.length,
    trend: delayTrend(delays),
    behaviour,
    nextPromise: promises[0] || null,
    nextDue,
    lastReminder: reminders.length ? reminders[reminders.length - 1] : null,
    expectedThisWeek: roundMoney(expectedThisWeek)
  }
}

const BEHAVIOUR_ORDER: Record<PaymentBehaviour, number> = { risk: 0, late: 1, promised: 2, new: 3, on_time: 4 }

/** Riskiest first, then the most overdue money, then the largest open balance. */
export function sortSummaries(summaries: ClientCollectionSummary[]) {
  return [...summaries].sort((a, b) =>
    BEHAVIOUR_ORDER[a.behaviour] - BEHAVIOUR_ORDER[b.behaviour] ||
    b.overdueAmount - a.overdueAmount ||
    b.openAmount - a.openAmount
  )
}

/** Portfolio-wide average delay, weighting every settled invoice equally. */
export function portfolioAverageDelay(invoices: CollectionInvoice[], today: string) {
  const delays = settledHistory(invoices, today).map(inv => paymentDelay(inv) ?? 0)
  const avg = average(delays)
  return avg === null ? null : Math.round(avg * 10) / 10
}
