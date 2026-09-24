import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.log('SKIP: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY not set')
  process.exit(0)
}

const supabase = createClient(url, key)
const [{ data: invoices, error: invError }, { data: payments, error: payError }] = await Promise.all([
  supabase.from('invoices').select('id, series, invoice_number, company_id, amount_paid, total, status'),
  supabase.from('invoice_payments').select('invoice_id, amount').not('invoice_id', 'is', null)
])

if (invError || payError) {
  console.error(invError?.message || payError?.message)
  process.exit(1)
}

const paid = new Map()
for (const row of payments || []) {
  paid.set(row.invoice_id, Number((paid.get(row.invoice_id) || 0) + Number(row.amount || 0)))
}

const diffs = (invoices || [])
  .map(row => ({
    id: row.id,
    series: row.series,
    invoice_number: row.invoice_number,
    status: row.status,
    stored: Number(row.amount_paid || 0),
    recomputed: Number(paid.get(row.id) || 0)
  }))
  .filter(row => Math.abs(row.stored - row.recomputed) > 0.009)

console.log(JSON.stringify({
  invoices: (invoices || []).length,
  payments: (payments || []).length,
  driftCount: diffs.length,
  diffs
}, null, 2))
