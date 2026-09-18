import { snapshotParty, type PartySnapshot } from '@/lib/partySnapshot'

const OPTIONAL_INVOICE_KEYS = [
  'discount_percent',
  'discount_amount',
  'prepaid_amount',
  'seller_snapshot',
  'buyer_snapshot',
  'tax_point_date',
  'created_by'
] as const

function isMissingColumnError(message?: string) {
  const text = (message || '').toLowerCase()
  return OPTIONAL_INVOICE_KEYS.some(key => text.includes(key)) || text.includes('schema cache')
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
  for (const key of OPTIONAL_INVOICE_KEYS) delete fallback[key]
  return supabase.from('invoices').insert(fallback).select().single()
}

export async function updateInvoiceRow(
  supabase: { from: (table: string) => any },
  id: string,
  row: Record<string, unknown>
) {
  const first = await supabase.from('invoices').update(row).eq('id', id)
  if (!first.error || !isMissingColumnError(first.error.message)) return first
  const fallback = { ...row }
  for (const key of OPTIONAL_INVOICE_KEYS) delete fallback[key]
  return supabase.from('invoices').update(fallback).eq('id', id)
}
