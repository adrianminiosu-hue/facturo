'use client'
import { supabase } from '@/lib/supabase'
import { authHeaders } from '@/lib/authHeaders'
import { calendarDateInBucharest, daysBetween } from '@/lib/dates'
import { computeInvoiceTotals, resolveExchangeRate } from '@/lib/invoiceMath'
import {
  initialState,
  type RecurringRow,
  type RecurringSchedule,
  type RecurringTemplate,
  type RecurringTemplateLine
} from '@/lib/recurring'
import { generateNext, isMissingRecurringTable, pauseRecurring, resumeState, type FxLookup } from '@/lib/recurringRun'

type LineLike = {
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
  tva_rate?: number | null
  unit_code?: string | null
  vat_category?: string | null
  vat_exemption_reason?: string | null
  discount_percent?: number | null
}

function templateLines(items: LineLike[]): RecurringTemplateLine[] {
  return items.map(item => ({
    description: item.description || '',
    quantity: Number(item.quantity) || 0,
    unit_price: Number(item.unit_price) || 0,
    tva_rate: Number(item.tva_rate) || 0,
    unit_code: item.unit_code || 'H87',
    vat_category: item.vat_category || null,
    vat_exemption_reason: item.vat_exemption_reason || null,
    discount_percent: Number(item.discount_percent) || 0
  }))
}

type HeaderLike = {
  series?: string | null
  invoice_type_code?: string | null
  payment_means_code?: string | null
  notes?: string | null
  buyer_reference?: string | null
  order_reference?: string | null
  discount_percent?: number | null
  issue_date?: string | null
  due_date?: string | null
}

/**
 * Template for a series. The payment term follows the client unless the due date was set by hand,
 * in which case that gap (due − issue) is kept for every future invoice.
 */
export function buildTemplate(opts: {
  header: HeaderLike
  items: LineLike[]
  fxRate?: number | null
  dueManual?: boolean
}): RecurringTemplate {
  const { header } = opts
  const credit = header.invoice_type_code === '381'
  const terms = opts.dueManual && header.issue_date && header.due_date ? daysBetween(header.issue_date, header.due_date) : null
  return {
    series: header.series || null,
    invoice_type_code: credit ? '380' : (header.invoice_type_code || '380'),
    payment_means_code: header.payment_means_code || '42',
    notes: header.notes || '',
    buyer_reference: header.buyer_reference || null,
    order_reference: header.order_reference || null,
    discount_percent: Number(header.discount_percent || 0),
    fx_eur: !!(opts.fxRate && opts.fxRate > 0),
    fx_rate: opts.fxRate && opts.fxRate > 0 ? opts.fxRate : null,
    payment_terms_days: terms !== null && terms >= 0 ? terms : null,
    lines: templateLines(opts.items)
  }
}

/** Template from a saved invoice (the "Make it recurring" action). */
export function templateFromInvoice(invoice: HeaderLike & { invoice_items?: LineLike[] | null; exchange_rate?: number | null }) {
  const items = invoice.invoice_items || []
  const rate = resolveExchangeRate(items as never, invoice as never)
  return buildTemplate({ header: invoice, items, fxRate: rate > 0 ? rate : null, dueManual: false })
}

/** Amount of one invoice of the series (lines as they are now, in lei). */
export function templateTotal(template: RecurringTemplate) {
  const totals = computeInvoiceTotals(template.lines || [], {
    discount_percent: Number(template.discount_percent || 0),
    exchange_rate: template.fx_eur ? Number(template.fx_rate || 0) : 0
  })
  return totals.total
}

/** Creates the series; `sourceInvoiceId` is its first invoice (occurrence 0, dated schedule.start_date). */
export async function createRecurring(opts: {
  ownerUserId: string
  actorUserId: string
  companyId?: string | null
  clientId: string
  sourceInvoiceId: string
  schedule: RecurringSchedule
  template: RecurringTemplate
}) {
  const today = calendarDateInBucharest(0)
  const state = initialState(opts.schedule, today)
  const { data, error } = await supabase.from('recurring_invoices').insert({
    user_id: opts.ownerUserId,
    created_by: opts.actorUserId,
    company_id: opts.companyId || null,
    client_id: opts.clientId,
    source_invoice_id: opts.sourceInvoiceId,
    ...opts.schedule,
    ...state,
    template: opts.template
  }).select().single()
  if (error || !data) {
    throw new Error(isMissingRecurringTable(error) ? 'Rulează migrarea 20261001_recurring_invoices.sql în Supabase.' : (error?.message || 'Recurența nu a putut fi salvată.'))
  }
  await supabase.from('invoices').update({
    recurring_invoice_id: data.id,
    recurring_occurrence_date: opts.schedule.start_date
  }).eq('id', opts.sourceInvoiceId)
  return data as RecurringRow
}

export async function loadRecurringList(opts: { companyId?: string | null; ownerUserId: string }) {
  let query = supabase.from('recurring_invoices').select('*, clients(company_name)').order('created_at', { ascending: false })
  query = opts.companyId ? query.eq('company_id', opts.companyId) : query.eq('user_id', opts.ownerUserId)
  const { data, error } = await query
  if (error) {
    if (isMissingRecurringTable(error)) return { rows: [] as RecurringRow[], missing: true }
    throw new Error(error.message)
  }
  return { rows: (data || []) as RecurringRow[], missing: false }
}

export async function loadRecurring(id: string) {
  const { data, error } = await supabase.from('recurring_invoices').select('*, clients(company_name)').eq('id', id).maybeSingle()
  if (error && !isMissingRecurringTable(error)) throw new Error(error.message)
  return (data || null) as RecurringRow | null
}

/** BNR rate through our API (the browser cannot call BNR directly). */
export const clientFx: FxLookup = async date => {
  const res = await fetch(`/api/fx/bnr?date=${encodeURIComponent(date)}&currency=EUR`, { headers: await authHeaders() })
  if (!res.ok) return null
  const body = await res.json()
  return body?.rate ? { rate: Number(body.rate), publishedOn: body.publishedOn || null } : null
}

export async function generateNow(row: RecurringRow) {
  return generateNext(supabase, row, { issueDate: calendarDateInBucharest(0), fx: clientFx })
}

export async function pauseSeries(row: RecurringRow) {
  await pauseRecurring(supabase, row.id, 'manual')
}

export async function resumeSeries(row: RecurringRow) {
  const { error } = await supabase.from('recurring_invoices').update(resumeState(row, calendarDateInBucharest(0))).eq('id', row.id)
  if (error) throw new Error(error.message)
}

export async function stopSeries(row: RecurringRow) {
  const { error } = await supabase.from('recurring_invoices').update({
    status: 'ended',
    next_run_date: null,
    pause_reason: null,
    updated_at: new Date().toISOString()
  }).eq('id', row.id)
  if (error) throw new Error(error.message)
}
