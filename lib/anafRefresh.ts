import type { SupabaseClient } from '@supabase/supabase-js'
import { anafStatusColumns, cleanCui, fetchAnafCompanies } from '@/lib/anafCompany'
import { calendarDateInBucharest } from '@/lib/dates'
import { OPEN_INVOICE_STATUSES } from '@/lib/invoiceStatus'

/** Re-check a client at most this often. */
export const ANAF_REFRESH_DAYS = 7
/** Upper bound per job run (≈ 1 ANAF request per 100 clients, 1/s). */
const MAX_CLIENTS_PER_RUN = 500

type ClientRef = { id: string; cui?: string | null }

/** Looks the clients up at ANAF and stores the status columns. Throws if ANAF is unreachable. */
export async function refreshClientsAnafStatus(admin: SupabaseClient, clients: ClientRef[]) {
  const withCui = clients.filter(c => cleanCui(c.cui).length >= 2)
  if (!withCui.length) return { checked: 0, updated: 0, inactive: [] as string[] }
  const found = await fetchAnafCompanies(withCui.map(c => String(c.cui)), calendarDateInBucharest(0))
  const checkedAt = new Date().toISOString()
  let updated = 0
  const inactive: string[] = []
  for (const client of withCui) {
    const company = found.get(cleanCui(client.cui)) || null
    const { error } = await admin.from('clients').update(anafStatusColumns(company, checkedAt)).eq('id', client.id)
    if (error) throw new Error(error.message)
    updated++
    if (company?.inactive || company?.deregistered_on) inactive.push(client.id)
  }
  return { checked: withCui.length, updated, inactive }
}

/** Nightly: clients with open invoices whose ANAF status is missing or older than ANAF_REFRESH_DAYS. */
export async function runAnafRefresh(admin: SupabaseClient) {
  const { data: open, error } = await admin
    .from('invoices')
    .select('client_id')
    .in('status', [...OPEN_INVOICE_STATUSES])
    .not('client_id', 'is', null)
  if (error) throw new Error(error.message)
  const ids = [...new Set((open || []).map(row => row.client_id as string))]
  const stale = new Date(Date.now() - ANAF_REFRESH_DAYS * 86400000).toISOString()
  const due: ClientRef[] = []
  for (let i = 0; i < ids.length && due.length < MAX_CLIENTS_PER_RUN; i += 200) {
    const { data, error: clientsError } = await admin
      .from('clients')
      .select('id, cui, anaf_checked_at')
      .in('id', ids.slice(i, i + 200))
      .or(`anaf_checked_at.is.null,anaf_checked_at.lt.${stale}`)
    if (clientsError) throw new Error(clientsError.message)
    due.push(...((data || []) as ClientRef[]))
  }
  return refreshClientsAnafStatus(admin, due.slice(0, MAX_CLIENTS_PER_RUN))
}
