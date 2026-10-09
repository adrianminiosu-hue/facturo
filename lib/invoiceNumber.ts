import type { SupabaseClient } from '@supabase/supabase-js'

export type InvoiceNumberOpts = {
  series: string
  companyId?: string | null
  userId: string
  startNumber?: number | null
}

/** Numeric part of an invoice number ("0031" → 31); NaN when there is none. */
export function invoiceNumberValue(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits ? parseInt(digits, 10) : NaN
}

/** The number after the highest one already issued, or the company's start number for an empty series. */
export function nextNumberAfter(issued: Array<string | null | undefined>, startNumber?: number | null) {
  let max = 0
  for (const value of issued) {
    const parsed = invoiceNumberValue(value)
    if (Number.isFinite(parsed) && parsed > max) max = parsed
  }
  const next = max > 0 ? max + 1 : (startNumber && startNumber > 0 ? startNumber : 1)
  return String(next).padStart(4, '0')
}

/**
 * Next free number in a series. Only issued invoices count: a draft has no number and gets
 * one when it is issued, so deleted or abandoned drafts never leave gaps in the series.
 */
export async function nextInvoiceNumber(client: SupabaseClient, opts: InvoiceNumberOpts) {
  let query = client
    .from('invoices')
    .select('invoice_number')
    .eq('series', opts.series)
    .neq('status', 'draft')
    .or('direction.is.null,direction.neq.purchase')
    .order('created_at', { ascending: false })
    .limit(2000)
  query = opts.companyId ? query.eq('company_id', opts.companyId) : query.eq('user_id', opts.userId)
  const { data } = await query
  return nextNumberAfter((data || []).map((row: { invoice_number?: string | null }) => row.invoice_number), opts.startNumber)
}

type DbResult = { data?: unknown; error?: { code?: string; message?: string } | null }

export function isDuplicateNumberError(error?: { code?: string; message?: string } | null) {
  return error?.code === '23505'
}

/**
 * Issues with a freshly allocated number. Two people issuing at the same moment can pick the same
 * number; the unique index refuses the second, which then retries with the next one.
 */
export async function withFreshInvoiceNumber<T extends DbResult>(
  client: SupabaseClient,
  opts: InvoiceNumberOpts,
  attempt: (invoiceNumber: string) => Promise<T>
): Promise<T & { invoiceNumber: string }> {
  let last: (T & { invoiceNumber: string }) | null = null
  for (let i = 0; i < 4; i++) {
    const invoiceNumber = await nextInvoiceNumber(client, opts)
    const result = await attempt(invoiceNumber)
    last = { ...result, invoiceNumber }
    if (!isDuplicateNumberError(result.error)) return last
  }
  return last as T & { invoiceNumber: string }
}
