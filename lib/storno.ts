import { calendarDateInBucharest } from '@/lib/dates'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function applyStornoToOriginal(
  client: SupabaseClient,
  opts: { originalId: string; userId: string; amount: number; creditRef: string }
) {
  const { data: original } = await client
    .from('invoices')
    .select('total, amount_paid, status')
    .eq('id', opts.originalId)
    .single()
  if (!original) return
  const paid = Number(original.amount_paid || 0) + Number(opts.amount)
  const fullyPaid = paid >= Number(original.total) - 0.009
  await client.from('invoice_payments').insert({
    invoice_id: opts.originalId,
    user_id: opts.userId,
    amount: opts.amount,
    paid_on: calendarDateInBucharest(0),
    method: 'compensation',
    notes: `Storno ${opts.creditRef}`
  })
  await client.from('invoices').update({
    amount_paid: paid,
    status: fullyPaid ? 'paid' : original.status
  }).eq('id', opts.originalId)
}
