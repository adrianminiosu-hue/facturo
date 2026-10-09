import type { SupabaseClient } from '@supabase/supabase-js'
import { addDaysIso, DEFAULT_DUE_DAYS, defaultDueDate } from '@/lib/dates'
import { computeInvoiceTotals } from '@/lib/invoiceMath'
import { insertInvoiceRow, persistInvoiceConvertedAmounts } from '@/lib/invoicePersist'
import { paymentTermsFor } from '@/lib/partnerRoles'
import {
  advanceAfter,
  billingPeriod,
  fillPlaceholders,
  nextOccurrenceAfter,
  templateLinesFor,
  withinEnd,
  type RecurringRow,
  type RecurringStatus
} from '@/lib/recurring'

/** BNR EUR rate for an invoice date; null when BNR cannot be reached. */
export type FxLookup = (date: string) => Promise<{ rate: number; publishedOn?: string | null } | null>

export type PauseReason = 'manual' | 'client_missing' | 'client_inactive' | 'no_lines' | 'error'

export type GenerateOutcome =
  | { outcome: 'created'; invoiceId: string; date: string; next: Partial<RecurringRow> }
  | { outcome: 'exists'; date: string; next: Partial<RecurringRow> }
  | { outcome: 'paused'; reason: PauseReason; error?: string }
  | { outcome: 'skipped'; reason: string }

export const RECURRING_COLUMNS = '*, clients(company_name)'

export function isMissingRecurringTable(error?: { code?: string; message?: string } | null) {
  const msg = (error?.message || '').toLowerCase()
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === '42703'
    || (msg.includes('recurring_') && (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')))
}

export async function pauseRecurring(db: SupabaseClient, id: string, reason: PauseReason, error?: string) {
  await db.from('recurring_invoices').update({
    status: 'paused',
    pause_reason: reason,
    paused_at: new Date().toISOString(),
    last_error: error || null,
    updated_at: new Date().toISOString()
  }).eq('id', id)
}

/** Resumes a paused series from the next date on or after today; dates missed while paused are skipped. */
export function resumeState(row: RecurringRow, today: string) {
  const next = nextOccurrenceAfter(row, addDaysIso(today, -1))
  const index = Math.max(next.index, row.next_index)
  const ended = !withinEnd(row, row.generated_count, next.date)
  return {
    status: (ended ? 'ended' : 'active') as RecurringStatus,
    next_index: index,
    next_run_date: ended ? null : next.date,
    pause_reason: null,
    paused_at: null,
    last_error: null,
    updated_at: new Date().toISOString()
  }
}

async function advance(db: SupabaseClient, row: RecurringRow, occurrence: string) {
  const next = { ...advanceAfter(row, row.next_index), last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }
  // Only if nobody advanced it meanwhile (job and "Generate now" at the same moment).
  await db.from('recurring_invoices').update(next).eq('id', row.id).eq('next_run_date', occurrence)
  return next
}

/**
 * Creates the draft for the series' next scheduled date. The draft has no number (allocated at issue).
 * `issueDate` overrides the invoice date ("Generate now"); the billed period still follows the scheduled date.
 */
export async function generateNext(
  db: SupabaseClient,
  row: RecurringRow,
  opts: { issueDate?: string; fx?: FxLookup } = {}
): Promise<GenerateOutcome> {
  if (row.status !== 'active' || !row.next_run_date) return { outcome: 'skipped', reason: 'not_active' }
  const occurrence = row.next_run_date
  const issueDate = opts.issueDate || occurrence
  const template = row.template || { lines: [] }

  const { data: client } = row.client_id
    ? await db.from('clients').select('*').eq('id', row.client_id).maybeSingle()
    : { data: null }
  if (!client) {
    await pauseRecurring(db, row.id, 'client_missing')
    return { outcome: 'paused', reason: 'client_missing' }
  }
  if (client.anaf_inactive || client.anaf_deregistered_on) {
    await pauseRecurring(db, row.id, 'client_inactive')
    return { outcome: 'paused', reason: 'client_inactive' }
  }

  const lines = templateLinesFor(template, occurrence, row.frequency)
  if (!lines.length) {
    await pauseRecurring(db, row.id, 'no_lines')
    return { outcome: 'paused', reason: 'no_lines' }
  }

  let fx: { exchange_rate: number | null; exchange_rate_source: string | null; exchange_rate_date: string | null } = {
    exchange_rate: null, exchange_rate_source: null, exchange_rate_date: null
  }
  if (template.fx_eur) {
    const found = opts.fx ? await opts.fx(issueDate).catch(() => null) : null
    fx = found?.rate
      ? { exchange_rate: found.rate, exchange_rate_source: 'BNR', exchange_rate_date: found.publishedOn || null }
      // BNR unreachable: last known rate, without a source, so the draft shows it must be checked.
      : { exchange_rate: Number(template.fx_rate) || null, exchange_rate_source: null, exchange_rate_date: null }
  }

  const totals = computeInvoiceTotals(lines, {
    discount_percent: Number(template.discount_percent || 0),
    exchange_rate: fx.exchange_rate || 0
  })
  const period = billingPeriod(occurrence, row.frequency)
  const terms = template.payment_terms_days ?? paymentTermsFor(client, DEFAULT_DUE_DAYS)

  const inserted = await insertInvoiceRow(db, {
    user_id: row.user_id,
    created_by: row.created_by || row.user_id,
    company_id: row.company_id || null,
    client_id: row.client_id,
    series: template.series || 'FCT',
    invoice_number: '',
    issue_date: issueDate,
    due_date: defaultDueDate(issueDate, terms),
    status: 'draft',
    subtotal: totals.subtotal,
    tva_rate: lines[0]?.tva_rate ?? 21,
    tva_amount: totals.tvaAmount,
    total: totals.total,
    notes: fillPlaceholders(template.notes, occurrence, row.frequency),
    invoice_type_code: template.invoice_type_code || '380',
    currency: 'RON',
    payment_means_code: template.payment_means_code || '42',
    tax_point_date: issueDate,
    delivery_date: issueDate,
    buyer_reference: template.buyer_reference || null,
    order_reference: template.order_reference || null,
    period_start: period.start,
    period_end: period.end,
    discount_percent: Number(template.discount_percent || 0),
    prepaid_amount: 0,
    ...fx,
    recurring_invoice_id: row.id,
    recurring_occurrence_date: occurrence
  })

  if (inserted.error) {
    // Already generated for this date (a retry): just move the schedule on.
    if (inserted.error.code === '23505') {
      const next = await advance(db, row, occurrence)
      return { outcome: 'exists', date: occurrence, next }
    }
    await pauseRecurring(db, row.id, 'error', inserted.error.message)
    return { outcome: 'paused', reason: 'error', error: inserted.error.message }
  }

  const invoiceId = inserted.data.id as string
  const { error: itemsError } = await db.from('invoice_items').insert(lines.map((line, index) => ({
    invoice_id: invoiceId,
    ...line,
    total: totals.lines[index]?.total ?? 0
  })))
  if (itemsError) {
    await db.from('invoices').delete().eq('id', invoiceId)
    await pauseRecurring(db, row.id, 'error', itemsError.message)
    return { outcome: 'paused', reason: 'error', error: itemsError.message }
  }
  await persistInvoiceConvertedAmounts(db, invoiceId, {
    subtotal: totals.subtotal,
    tva_amount: totals.tvaAmount,
    total: totals.total,
    ...fx
  })

  const next = await advance(db, row, occurrence)
  return { outcome: 'created', invoiceId, date: occurrence, next }
}

/** Dates caught up per series in one run, when the job was down for a while. */
export const MAX_CATCH_UP = 3

/** Daily job: every active series whose next date has come gets its draft(s). */
export async function runRecurringInvoices(db: SupabaseClient, opts: { today: string; fx?: FxLookup; budgetMs?: number; limit?: number }) {
  const started = Date.now()
  const report = { checked: 0, created: 0, paused: 0, partial: false, skipped: undefined as string | undefined }
  const { data, error } = await db
    .from('recurring_invoices')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_date', opts.today)
    .order('next_run_date', { ascending: true })
    .limit(opts.limit ?? 200)
  if (error) {
    if (isMissingRecurringTable(error)) return { ...report, skipped: 'migration 20261001_recurring_invoices not applied' }
    throw new Error(error.message)
  }
  for (const original of (data || []) as RecurringRow[]) {
    if (opts.budgetMs && Date.now() - started > opts.budgetMs) { report.partial = true; break }
    report.checked++
    let row = original
    for (let i = 0; i < MAX_CATCH_UP && row.status === 'active' && row.next_run_date && row.next_run_date <= opts.today; i++) {
      const result = await generateNext(db, row, { fx: opts.fx })
      if (result.outcome === 'created') report.created++
      if (result.outcome === 'paused') { report.paused++; break }
      if (result.outcome === 'skipped') break
      row = { ...row, ...result.next } as RecurringRow
    }
  }
  return report
}
