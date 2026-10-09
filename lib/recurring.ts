/**
 * Recurring invoices: schedule arithmetic and the template → draft mapping.
 * Pure functions only (no database), so the rules are unit-tested.
 *
 * Rules (validated 29 Sept 2026):
 * - occurrence k falls in (start month + k × step), on anchor_day; 29–31 → last day of shorter months;
 * - the invoice bills the period that STARTS in its own month (in advance): monthly = that month,
 *   quarterly = that month + the next two, yearly = twelve months from that month;
 * - "after N invoices" counts the first invoice too;
 * - each scheduled date produces a draft; the number is allocated only when the draft is issued.
 */

export type RecurringFrequency = 'monthly' | 'quarterly' | 'yearly'
export type RecurringEndMode = 'never' | 'count' | 'until'
export type RecurringStatus = 'active' | 'paused' | 'ended'

export const RECURRING_FREQUENCIES: RecurringFrequency[] = ['monthly', 'quarterly', 'yearly']
export const FREQUENCY_MONTHS: Record<RecurringFrequency, number> = { monthly: 1, quarterly: 3, yearly: 12 }

export type RecurringSchedule = {
  frequency: RecurringFrequency
  anchor_day: number
  start_date: string
  end_mode: RecurringEndMode
  end_count?: number | null
  end_date?: string | null
}

export type RecurringTemplateLine = {
  description: string
  quantity: number
  unit_price: number
  tva_rate: number
  unit_code?: string | null
  vat_category?: string | null
  vat_exemption_reason?: string | null
  discount_percent?: number | null
}

export type RecurringTemplate = {
  series?: string | null
  invoice_type_code?: string | null
  payment_means_code?: string | null
  notes?: string | null
  buyer_reference?: string | null
  order_reference?: string | null
  discount_percent?: number | null
  /** Unit prices are in EUR and converted at the BNR rate of each invoice's date. */
  fx_eur?: boolean
  /** Last known EUR rate, used only when BNR cannot be reached. */
  fx_rate?: number | null
  /** Days until due; null → the client's payment term at generation time. */
  payment_terms_days?: number | null
  lines: RecurringTemplateLine[]
}

export type RecurringRow = RecurringSchedule & {
  id: string
  user_id: string
  company_id?: string | null
  client_id?: string | null
  created_by?: string | null
  source_invoice_id?: string | null
  next_index: number
  next_run_date?: string | null
  generated_count: number
  status: RecurringStatus
  pause_reason?: string | null
  paused_at?: string | null
  last_run_at?: string | null
  last_error?: string | null
  template: RecurringTemplate
  created_at?: string
  clients?: { company_name?: string | null } | null
}

const pad = (n: number) => String(n).padStart(2, '0')

function ymd(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Adds whole months to (year, month), month 1–12. */
function shiftMonth(year: number, month: number, add: number) {
  const index = year * 12 + (month - 1) + add
  return { y: Math.floor(index / 12), m: (index % 12) + 1 }
}

export function clampAnchorDay(day: number) {
  const n = Math.trunc(Number(day))
  return Number.isFinite(n) ? Math.min(31, Math.max(1, n)) : 1
}

/** Date of occurrence `index` (0 = the first invoice). */
export function occurrenceDate(schedule: Pick<RecurringSchedule, 'frequency' | 'anchor_day' | 'start_date'>, index: number) {
  const { y, m } = ymd(schedule.start_date)
  const shifted = shiftMonth(y, m, index * FREQUENCY_MONTHS[schedule.frequency])
  const day = Math.min(clampAnchorDay(schedule.anchor_day), daysInMonth(shifted.y, shifted.m))
  return `${shifted.y}-${pad(shifted.m)}-${pad(day)}`
}

/** First occurrence strictly after `afterIso` (never the first invoice itself). */
export function nextOccurrenceAfter(schedule: Pick<RecurringSchedule, 'frequency' | 'anchor_day' | 'start_date'>, afterIso: string) {
  let index = 1
  while (occurrenceDate(schedule, index) <= afterIso) index++
  return { index, date: occurrenceDate(schedule, index) }
}

/**
 * May the series still produce an invoice on `date`, when it already holds `generatedCount` invoices?
 * "count" includes the first invoice; "until" is inclusive.
 */
export function withinEnd(schedule: Pick<RecurringSchedule, 'end_mode' | 'end_count' | 'end_date'>, generatedCount: number, date: string) {
  if (schedule.end_mode === 'count') return generatedCount < Number(schedule.end_count || 0)
  if (schedule.end_mode === 'until') return !!schedule.end_date && date <= schedule.end_date
  return true
}

/** The next `n` dates the series will produce, starting at occurrence `fromIndex`. */
export function upcomingDates(schedule: RecurringSchedule, fromIndex: number, generatedCount: number, n = 3) {
  const out: string[] = []
  let count = generatedCount
  for (let index = fromIndex; out.length < n && index < fromIndex + 600; index++) {
    const date = occurrenceDate(schedule, index)
    if (!withinEnd(schedule, count, date)) break
    out.push(date)
    count++
  }
  return out
}

/** How many invoices the series will produce in total, when it has an end; null when open-ended. */
export function plannedTotal(schedule: RecurringSchedule) {
  if (schedule.end_mode === 'count') return Number(schedule.end_count || 0) || null
  if (schedule.end_mode === 'until' && schedule.end_date) {
    let total = 0
    while (total < 600 && occurrenceDate(schedule, total) <= schedule.end_date) total++
    return total
  }
  return null
}

/** Billed period, in advance: from the first day of the issue month, `step` months long. */
export function billingPeriod(issueDate: string, frequency: RecurringFrequency) {
  const { y, m } = ymd(issueDate)
  const last = shiftMonth(y, m, FREQUENCY_MONTHS[frequency] - 1)
  return {
    start: `${y}-${pad(m)}-01`,
    end: `${last.y}-${pad(last.m)}-${pad(daysInMonth(last.y, last.m))}`
  }
}

const MONTHS: Record<'ro' | 'en', string[]> = {
  ro: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
}

export const PLACEHOLDERS = ['{luna}', '{an}', '{perioada}'] as const

export function periodLabel(issueDate: string, frequency: RecurringFrequency, locale: 'ro' | 'en' = 'ro') {
  const period = billingPeriod(issueDate, frequency)
  const a = ymd(period.start)
  const b = ymd(period.end)
  const names = MONTHS[locale]
  if (frequency === 'monthly') return `${names[a.m - 1]} ${a.y}`
  if (frequency === 'yearly' && a.m === 1) return String(a.y)
  return a.y === b.y
    ? `${names[a.m - 1]} – ${names[b.m - 1]} ${a.y}`
    : `${names[a.m - 1]} ${a.y} – ${names[b.m - 1]} ${b.y}`
}

/** "Mentenanță {luna} {an}" → "Mentenanță noiembrie 2026". Unknown braces are left alone. */
export function fillPlaceholders(text: string | null | undefined, issueDate: string, frequency: RecurringFrequency, locale: 'ro' | 'en' = 'ro') {
  if (!text) return text || ''
  const { y, m } = ymd(issueDate)
  return text
    .replace(/\{luna\}/gi, MONTHS[locale][m - 1])
    .replace(/\{an\}/gi, String(y))
    .replace(/\{perioada\}/gi, periodLabel(issueDate, frequency, locale))
}

export function hasPlaceholders(text?: string | null) {
  return /\{(luna|an|perioada)\}/i.test(text || '')
}

/** Lines of the invoice produced on `issueDate`. */
export function templateLinesFor(template: RecurringTemplate, issueDate: string, frequency: RecurringFrequency) {
  return (template.lines || []).map(line => ({
    description: fillPlaceholders(line.description, issueDate, frequency),
    quantity: Number(line.quantity) || 0,
    unit_price: Number(line.unit_price) || 0,
    tva_rate: Number(line.tva_rate) || 0,
    unit_code: line.unit_code || 'H87',
    vat_category: line.vat_category || (Number(line.tva_rate) > 0 ? 'S' : 'Z'),
    vat_exemption_reason: line.vat_exemption_reason || null,
    discount_percent: Number(line.discount_percent) || 0
  }))
}

/** Where the series goes after producing occurrence `index`: next date, or ended. */
export function advanceAfter(row: RecurringSchedule & { generated_count: number }, index: number) {
  const generated = row.generated_count + 1
  const nextIndex = index + 1
  const nextDate = occurrenceDate(row, nextIndex)
  const ended = !withinEnd(row, generated, nextDate)
  return {
    generated_count: generated,
    next_index: nextIndex,
    next_run_date: ended ? null : nextDate,
    status: (ended ? 'ended' : 'active') as RecurringStatus
  }
}

/** Initial schedule state for a series whose first invoice is dated `startDate`, created on `today`. */
export function initialState(schedule: RecurringSchedule, today: string) {
  const next = nextOccurrenceAfter(schedule, startMax(schedule.start_date, today))
  const alreadyInSeries = 1
  const ended = !withinEnd(schedule, alreadyInSeries, next.date)
  return {
    next_index: next.index,
    next_run_date: ended ? null : next.date,
    generated_count: alreadyInSeries,
    status: (ended ? 'ended' : 'active') as RecurringStatus
  }
}

function startMax(a: string, b: string) {
  return a > b ? a : b
}

/** Defaults when a series is made from an invoice dated `issueDate`. */
export function defaultSchedule(issueDate: string): RecurringSchedule {
  const { y, m, d } = ymd(issueDate)
  return {
    frequency: 'monthly',
    // Issued on the last day of a month → stays on the last day (30 Sep → 31 Oct → 30 Nov).
    anchor_day: d === daysInMonth(y, m) ? 31 : d,
    start_date: issueDate,
    end_mode: 'never',
    end_count: null,
    end_date: null
  }
}

export function validateSchedule(schedule: RecurringSchedule): string | null {
  if (!RECURRING_FREQUENCIES.includes(schedule.frequency)) return 'recur.err.frequency'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.start_date)) return 'recur.err.start'
  if (schedule.end_mode === 'count' && !(Number(schedule.end_count) >= 2)) return 'recur.err.count'
  if (schedule.end_mode === 'until') {
    if (!schedule.end_date || !/^\d{4}-\d{2}-\d{2}$/.test(schedule.end_date)) return 'recur.err.until'
    if (schedule.end_date < occurrenceDate(schedule, 1)) return 'recur.err.untilEarly'
  }
  return null
}
