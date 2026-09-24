import { calendarDateInBucharest } from '@/lib/dates'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function applyStornoToOriginal(
  client: SupabaseClient,
  opts: { originalId: string; userId: string; amount: number; creditRef: string }
) {
  const { data: original } = await client
    .from('invoices')
    .select('id, user_id, company_id')
    .eq('id', opts.originalId)
    .single()
  if (!original) return
  await client.from('invoice_payments').insert({
    invoice_id: opts.originalId,
    user_id: original.user_id || opts.userId,
    company_id: original.company_id || null,
    created_by: opts.userId,
    amount: opts.amount,
    paid_on: calendarDateInBucharest(0),
    method: 'compensation',
    source: 'manual',
    notes: `Storno ${opts.creditRef}`
  })
}
