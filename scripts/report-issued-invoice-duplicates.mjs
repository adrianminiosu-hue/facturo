import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.log('SKIP: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY not set')
  process.exit(0)
}

const supabase = createClient(url, key)
const { data, error } = await supabase
  .from('invoices')
  .select('id, company_id, series, invoice_number, status, direction')
  .or('direction.is.null,direction.eq.issued')
  .neq('status', 'draft')

if (error) {
  console.error(error.message)
  process.exit(1)
}

const groups = new Map()
for (const row of data || []) {
  const key = `${row.company_id}|${row.series}|${row.invoice_number}`
  const list = groups.get(key) || []
  list.push(row)
  groups.set(key, list)
}

const dups = [...groups.entries()].filter(([, rows]) => rows.length > 1)
console.log(JSON.stringify({
  issuedNonDraft: (data || []).length,
  duplicateGroups: dups.map(([key, rows]) => ({ key, count: rows.length, ids: rows.map(row => row.id) }))
}, null, 2))
