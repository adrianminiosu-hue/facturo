import { snapshotParty, type PartySnapshot } from '@/lib/partySnapshot'
import {
  invoiceConvertedHeader,
  invoiceLinesOf,
  type InvoiceMoneyRow
} from '@/lib/invoiceMath'

const OPTIONAL_INVOICE_KEYS = [
  'discount_percent',
  'discount_amount',
  'prepaid_amount',
  'seller_snapshot',
  'buyer_snapshot',
  'tax_point_date',
  'created_by',
  'direction',
  'exchange_rate',
  'exchange_rate_source',
  'exchange_rate_date'
] as const

function isMissingColumnError(message?: string) {
  const text = (message || '').toLowerCase()
  return OPTIONAL_INVOICE_KEYS.some(key => text.includes(key)) || text.includes('schema cache')
}

function keysToDrop(message?: string) {
  const text = (message || '').toLowerCase()
  const named = OPTIONAL_INVOICE_KEYS.filter(key => text.includes(key))
  return named.length ? named : OPTIONAL_INVOICE_KEYS
}

export function invoicePartySnapshots(opts: {
  status: string
  seller?: Record<string, unknown> | null
  buyer?: Record<string, unknown> | null
}): { seller_snapshot?: PartySnapshot; buyer_snapshot?: PartySnapshot } {
  if (opts.status === 'draft') return {}
  return {
    seller_snapshot: snapshotParty(opts.seller || undefined),
    buyer_snapshot: snapshotParty(opts.buyer || undefined)
  }
}

export async function insertInvoiceRow(
  supabase: { from: (table: string) => any },
  row: Record<string, unknown>
) {
  const first = await supabase.from('invoices').insert(row).select().single()
  if (!first.error || !isMissingColumnError(first.error.message)) return first
  const fallback = { ...row }
  for (const key of keysToDrop(first.error.message)) delete fallback[key]
  return supabase.from('invoices').insert(fallback).select().single()
}

export async function ensureConvertedInvoiceAmounts<T extends InvoiceMoneyRow & { id?: string }>(
  supabase: { from: (table: string) => any },
  invoice: T,
  items?: InvoiceMoneyRow['invoice_items']
): Promise<T> {
  let lines = items || invoiceLinesOf(invoice)
  if (!lines.length && invoice.id) {
    const loaded = await supabase
      .from('invoice_items')
      .select('quantity, unit_price, tva_rate, total')
      .eq('invoice_id', invoice.id)
    lines = loaded.data || []
  }
  // No lines (not loaded, or a header-only invoice): keep the stored amounts instead of recomputing 0.
  if (!lines.length) return invoice
  const converted = invoiceConvertedHeader(lines, invoice)
  const next = {
    ...invoice,
    invoice_items: lines,
    subtotal: converted.totals.subtotal,
    tva_amount: converted.totals.tvaAmount,
    total: converted.totals.taxInclusive,
    exchange_rate: converted.exchange_rate || invoice.exchange_rate || null,
    // A rate inferred from line totals has no known source: never label it BNR.
    exchange_rate_source: invoice.exchange_rate_source || null
  }
  if (converted.needsPersist && invoice.id) {
    await persistInvoiceConvertedAmounts(supabase, invoice.id, {
      subtotal: next.subtotal,
      tva_amount: next.tva_amount,
      total: next.total,
      exchange_rate: next.exchange_rate,
      exchange_rate_source: next.exchange_rate_source,
      exchange_rate_date: invoice.exchange_rate_date || null
    })
  }
  return next
}

export async function persistInvoiceConvertedAmounts(
  supabase: { from: (table: string) => any },
  id: string,
  amounts: {
    subtotal: number
    tva_amount: number
    total: number
    exchange_rate?: number | null
    exchange_rate_source?: string | null
    exchange_rate_date?: string | null
  }
) {
  return updateInvoiceRow(supabase, id, amounts)
}

export async function updateInvoiceRow(
  supabase: { from: (table: string) => any },
  id: string,
  row: Record<string, unknown>
) {
  const first = await supabase.from('invoices').update(row).eq('id', id)
  if (!first.error || !isMissingColumnError(first.error.message)) return first
  const fallback = { ...row }
  for (const key of keysToDrop(first.error.message)) delete fallback[key]
  return supabase.from('invoices').update(fallback).eq('id', id)
}
