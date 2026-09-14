import type { SupabaseClient } from '@supabase/supabase-js'

export async function nextInvoiceNumber(
  client: SupabaseClient,
  opts: { series: string; companyId?: string | null; userId: string; startNumber?: number }
) {
  let query = client
    .from('invoices')
    .select('invoice_number')
    .eq('series', opts.series)
    .order('created_at', { ascending: false })
    .limit(1)
  query = opts.companyId ? query.eq('company_id', opts.companyId) : query.eq('user_id', opts.userId)
  const { data } = await query
  const last = data?.[0]?.invoice_number
  const parsed = last ? parseInt(String(last).replace(/\D/g, ''), 10) : NaN
  const nextNum = Number.isFinite(parsed) ? parsed + 1 : (opts.startNumber || 1)
  return String(nextNum).padStart(4, '0')
}
