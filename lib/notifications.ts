import { addDaysIso } from '@/lib/dates'
import { remainingOf, withConvertedInvoiceAmounts, type InvoiceMoneyRow } from '@/lib/invoiceMath'
import { isCreditNote, isDraftInvoice, isPurchaseInvoice } from '@/lib/invoiceStatus'
import { buildEfacturaDashboard, type DashboardInvoice } from '@/lib/efacturaDashboard'

/**
 * General notifications: a summary of what changed in money and risk, computed from data the app
 * already keeps (payments, due dates, e-Factura state, reminders sent, statement imports).
 * Nothing is stored except when the user last looked (per user).
 */

export type NotificationCategory = 'receivables' | 'suppliers' | 'efactura' | 'bank'
export type NotificationTone = 'good' | 'bad' | 'warn' | 'neutral'

export type NotificationRef = { label: string; href: string; amount?: number; party?: string }

export type NotificationItem = {
  id: string
  category: NotificationCategory
  kind: string
  tone: NotificationTone
  /** When it happened (orders the feed and decides what is unread). */
  at: string
  /** Calendar day (Europe/Bucharest) it is listed under. */
  day: string
  /** Message key, with {count} etc. filled from `vars`. Grouped items use `${kind}.many`. */
  key: string
  vars: Record<string, string | number>
  refs: NotificationRef[]
  amount?: number
  action?: { key: string; href: string }
}

export type UpcomingItem = {
  id: string
  category: NotificationCategory
  kind: string
  tone: NotificationTone
  /** The day it falls on. */
  date: string
  key: string
  vars: Record<string, string | number>
  refs: NotificationRef[]
  amount?: number
  action?: { key: string; href: string }
}

export type NotificationInvoice = InvoiceMoneyRow & DashboardInvoice & {
  id: string
  due_date?: string | null
  created_at?: string | null
  direction?: string | null
  invoice_type_code?: string | null
  clients?: { company_name?: string | null; cui?: string | null; country?: string | null } | null
}

export type NotificationPayment = {
  id: string
  invoice_id: string
  amount: number | string
  paid_on?: string | null
  created_at?: string | null
  source?: string | null
}

export type NotificationReminder = { id: string; invoice_id: string; kind?: string | null; recipient?: string | null; sent_at: string }
export type NotificationBankEvent = { id: string; created_at: string; payload?: Record<string, unknown> | null }

export type NotificationSources = {
  invoices: NotificationInvoice[]
  payments: NotificationPayment[]
  reminders: NotificationReminder[]
  bankImports: NotificationBankEvent[]
  /** ANAF authorisation expiry, when connected. */
  tokenExpiresAt?: string | null
}

/** How far back the feed goes, and how far ahead "coming up" looks. */
export const FEED_DAYS = 30
export const UPCOMING_DAYS = 3
/** More than this many events of one kind on one day are shown as one grouped line. */
export const GROUP_OVER = 2

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function bucharestDay(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
}

/** Midnight at the start of a Bucharest calendar day, as an ISO instant (close enough for ordering). */
function toIso(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function startOfDay(day: string) {
  return `${day}T00:00:00+03:00`
}

function refOf(invoice: NotificationInvoice, amount?: number): NotificationRef {
  const purchase = isPurchaseInvoice(invoice)
  return {
    label: `${invoice.series || ''}${invoice.invoice_number || ''}`,
    href: purchase ? `/facturi-achizitie/${invoice.id}` : `/invoices/${invoice.id}`,
    amount,
    party: String(invoice.clients?.company_name || '')
  }
}

type Raw = Omit<NotificationItem, 'key' | 'vars'> & { vars?: Record<string, string | number> }

/** Same kind, same day, more than GROUP_OVER: one line with the count, the total and all references. */
function groupByDay(raw: Raw[]): NotificationItem[] {
  const buckets = new Map<string, Raw[]>()
  for (const original of raw) {
    // One timestamp format, so ordering and "unread since" compare correctly.
    const item = { ...original, at: toIso(original.at) }
    const key = `${item.kind}|${item.day}`
    buckets.set(key, [...(buckets.get(key) || []), item])
  }
  const out: NotificationItem[] = []
  for (const items of buckets.values()) {
    if (items.length > GROUP_OVER) {
      const latest = items.reduce((a, b) => (a.at > b.at ? a : b))
      const total = round2(items.reduce((sum, item) => sum + (item.amount || 0), 0))
      out.push({
        ...latest,
        id: `${latest.kind}:${latest.day}`,
        key: `ntf.${latest.kind}.many`,
        vars: { count: items.length },
        refs: items.flatMap(item => item.refs),
        amount: total || undefined,
        action: items.every(item => item.action?.href === latest.action?.href) ? latest.action : undefined
      })
    } else {
      for (const item of items) out.push({ ...item, key: `ntf.${item.kind}`, vars: item.vars || {} })
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

export function buildNotifications(sources: NotificationSources, opts: { today: string; now?: number }) {
  const now = opts.now ?? Date.now()
  const since = addDaysIso(opts.today, -FEED_DAYS)
  const until = addDaysIso(opts.today, UPCOMING_DAYS)
  const invoices = sources.invoices.filter(invoice => !isDraftInvoice(invoice.status))
  const byId = new Map(invoices.map(invoice => [invoice.id, invoice]))
  const remaining = new Map(invoices.map(invoice => [invoice.id, remainingOf(withConvertedInvoiceAmounts(invoice))]))
  const raw: Raw[] = []

  // Payments: in (issued invoices) and out (supplier invoices). The last payment that settles an invoice says "paid in full".
  const lastPayment = new Map<string, NotificationPayment>()
  for (const payment of sources.payments) {
    const seen = lastPayment.get(payment.invoice_id)
    if (!seen || String(payment.created_at || payment.paid_on || '') >= String(seen.created_at || seen.paid_on || '')) lastPayment.set(payment.invoice_id, payment)
  }
  for (const payment of sources.payments) {
    const invoice = byId.get(payment.invoice_id)
    if (!invoice) continue
    const at = payment.created_at || (payment.paid_on ? `${payment.paid_on}T12:00:00+03:00` : '')
    if (!at || bucharestDay(at) < since) continue
    const purchase = isPurchaseInvoice(invoice)
    const settled = (remaining.get(invoice.id) || 0) <= 0.01 && lastPayment.get(invoice.id)?.id === payment.id
    const amount = round2(Number(payment.amount) || 0)
    raw.push({
      id: `pay:${payment.id}`,
      category: purchase ? 'suppliers' : 'receivables',
      kind: purchase ? (settled ? 'paidOut' : 'paidOutPartial') : (settled ? 'paidIn' : 'paidInPartial'),
      tone: purchase ? 'neutral' : 'good',
      at,
      day: bucharestDay(at),
      refs: [refOf(invoice, amount)],
      amount,
      vars: { source: payment.source === 'camt053' || payment.source === 'xml940' || payment.source === 'csv' || payment.source === 'bank_api' ? 'bank' : 'manual' }
    })
  }

  // Past due: the day after the due date, while the invoice is still unpaid.
  for (const invoice of invoices) {
    if (!invoice.due_date || isCreditNote(invoice.invoice_type_code)) continue
    const left = remaining.get(invoice.id) || 0
    if (left <= 0.01) continue
    const day = addDaysIso(invoice.due_date, 1)
    if (day < since || day > opts.today) continue
    const purchase = isPurchaseInvoice(invoice)
    raw.push({
      id: `overdue:${invoice.id}`,
      category: purchase ? 'suppliers' : 'receivables',
      kind: purchase ? 'overdueOut' : 'overdueIn',
      tone: 'bad',
      at: startOfDay(day),
      day,
      refs: [refOf(invoice, round2(left))],
      amount: round2(left),
      action: purchase ? { key: 'ntf.act.pay', href: `/facturi-achizitie/${invoice.id}` } : { key: 'ntf.act.remind', href: `/invoices/${invoice.id}` }
    })
  }

  // Reminders the app sent to clients.
  for (const reminder of sources.reminders) {
    const invoice = byId.get(reminder.invoice_id)
    if (!invoice || bucharestDay(reminder.sent_at) < since) continue
    raw.push({
      id: `reminder:${reminder.id}`,
      category: 'receivables',
      kind: reminder.kind === 'manual' ? 'reminderManual' : 'reminderAuto',
      tone: 'neutral',
      at: reminder.sent_at,
      day: bucharestDay(reminder.sent_at),
      refs: [refOf(invoice, remaining.get(invoice.id))]
    })
  }

  // Supplier invoices received through SPV.
  for (const invoice of invoices) {
    if (!isPurchaseInvoice(invoice) || !invoice.efactura_index || !invoice.created_at) continue
    if (bucharestDay(invoice.created_at) < since) continue
    const amount = round2(Number(invoice.total || 0))
    raw.push({
      id: `received:${invoice.id}`,
      category: 'suppliers',
      kind: 'receivedSpv',
      tone: 'neutral',
      at: invoice.created_at,
      day: bucharestDay(invoice.created_at),
      refs: [refOf(invoice, amount)],
      amount
    })
  }

  // e-Factura: rejections and missed deadlines.
  const issued = invoices.filter(invoice => !isPurchaseInvoice(invoice))
  const efactura = buildEfacturaDashboard(issued, { today: opts.today, periodDays: FEED_DAYS, now })
  for (const row of efactura.rejected) {
    const at = row.invoice.efactura_uploaded_at || startOfDay(opts.today)
    if (bucharestDay(at) < since) continue
    raw.push({
      id: `rejected:${row.invoice.id}`,
      category: 'efactura',
      kind: 'efacturaRejected',
      tone: 'bad',
      at,
      day: bucharestDay(at),
      refs: [refOf(row.invoice as NotificationInvoice)],
      action: { key: 'ntf.act.fix', href: `/invoices/${row.invoice.id}` }
    })
  }
  for (const row of efactura.overdue) {
    const day = addDaysIso(row.deadline || opts.today, 1)
    if (day < since || day > opts.today) continue
    raw.push({
      id: `efLate:${row.invoice.id}`,
      category: 'efactura',
      kind: 'efacturaLate',
      tone: 'bad',
      at: startOfDay(day),
      day,
      refs: [refOf(row.invoice as NotificationInvoice)],
      action: { key: 'ntf.act.send', href: '/efactura' }
    })
  }

  // Bank statements imported.
  for (const event of sources.bankImports) {
    if (bucharestDay(event.created_at) < since) continue
    const payload = event.payload || {}
    const lines = Number(payload.newCount || 0)
    if (!lines) continue
    raw.push({
      id: `bank:${event.id}`,
      category: 'bank',
      kind: 'bankImport',
      tone: Number(payload.toConfirm || 0) > 0 ? 'warn' : 'good',
      at: event.created_at,
      day: bucharestDay(event.created_at),
      refs: [],
      vars: { lines, auto: Number(payload.autoMatched || 0), toConfirm: Number(payload.toConfirm || 0) },
      action: Number(payload.toConfirm || 0) > 0 ? { key: 'ntf.act.confirm', href: '/banca' } : undefined
    })
  }

  // Coming up: due dates in the next days, e-Factura deadlines today/tomorrow, the ANAF authorisation.
  const upcomingRaw: Array<UpcomingItem & { amountEach?: number }> = []
  for (const invoice of invoices) {
    if (!invoice.due_date || invoice.due_date < opts.today || invoice.due_date > until || isCreditNote(invoice.invoice_type_code)) continue
    const left = remaining.get(invoice.id) || 0
    if (left <= 0.01) continue
    const purchase = isPurchaseInvoice(invoice)
    upcomingRaw.push({
      id: `due:${invoice.id}`,
      category: purchase ? 'suppliers' : 'receivables',
      kind: purchase ? 'dueOut' : 'dueIn',
      tone: purchase ? 'warn' : 'neutral',
      date: invoice.due_date,
      key: '',
      vars: {},
      refs: [refOf(invoice, round2(left))],
      amount: round2(left),
      action: purchase ? { key: 'ntf.act.pay', href: `/facturi-achizitie/${invoice.id}` } : undefined
    })
  }
  for (const row of efactura.dueSoon) {
    if (row.daysLeft === null || row.daysLeft > 1 || !row.deadline) continue
    upcomingRaw.push({
      id: `efDue:${row.invoice.id}`,
      category: 'efactura',
      kind: 'efacturaDue',
      tone: 'warn',
      date: row.deadline,
      key: '',
      vars: {},
      refs: [refOf(row.invoice as NotificationInvoice)],
      action: { key: 'ntf.act.send', href: '/efactura' }
    })
  }
  const upcoming: UpcomingItem[] = []
  const upBuckets = new Map<string, typeof upcomingRaw>()
  for (const item of upcomingRaw) {
    const key = `${item.kind}|${item.date}`
    upBuckets.set(key, [...(upBuckets.get(key) || []), item])
  }
  for (const items of upBuckets.values()) {
    const first = items[0]
    const total = round2(items.reduce((sum, item) => sum + (item.amount || 0), 0))
    upcoming.push({
      ...first,
      id: items.length === 1 ? first.id : `${first.kind}:${first.date}`,
      key: items.length === 1 ? `ntf.${first.kind}` : `ntf.${first.kind}.many`,
      vars: { count: items.length },
      refs: items.flatMap(item => item.refs),
      amount: total || undefined,
      action: items.length === 1 ? first.action : (first.kind === 'efacturaDue' ? first.action : first.kind === 'dueOut' ? { key: 'ntf.act.seeAll', href: '/facturi-achizitie' } : undefined)
    })
  }
  if (sources.tokenExpiresAt) {
    const days = Math.floor((Date.parse(sources.tokenExpiresAt) - now) / 86_400_000)
    if (Number.isFinite(days) && days <= 7) {
      upcoming.push({
        id: 'token',
        category: 'efactura',
        kind: 'tokenSoon',
        tone: days < 0 ? 'bad' : 'warn',
        date: days < 0 ? opts.today : addDaysIso(opts.today, days),
        key: days < 0 ? 'ntf.tokenExpired' : 'ntf.tokenSoon',
        vars: { days: Math.max(days, 0) },
        refs: [],
        action: { key: 'ntf.act.reconnect', href: '/efactura' }
      })
    }
  }
  const toneRank: Record<NotificationTone, number> = { bad: 0, warn: 1, neutral: 2, good: 3 }
  upcoming.sort((a, b) => a.date.localeCompare(b.date) || toneRank[a.tone] - toneRank[b.tone])

  return { feed: groupByDay(raw), upcoming }
}

export function isUnread(item: NotificationItem, seenAt?: string | null) {
  return !seenAt || item.at > toIso(seenAt)
}

export function unreadCount(feed: NotificationItem[], seenAt?: string | null) {
  if (!seenAt) return feed.length
  const since = toIso(seenAt)
  return feed.filter(item => item.at > since).length
}
