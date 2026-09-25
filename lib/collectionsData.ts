import { RECEIVABLE_LIST_STATUSES, isPurchaseInvoice } from '@/lib/invoiceStatus'
import { billedTotal, remainingOf } from '@/lib/invoiceMath'
import { ensureConvertedInvoiceAmounts } from '@/lib/invoicePersist'
import type { CollectionInvoice } from '@/lib/clientCollections'

export type CollectionClient = {
  id: string
  company_name: string
  cui?: string | null
  email?: string | null
  city?: string | null
  /** Set when ANAF lists the client as inactive or struck off (migration 20260926). */
  anaf_flag?: 'inactive' | 'deregistered' | null
}

export type CollectionPayment = {
  invoice_id: string
  amount: number
  paid_on: string
  bank_transaction_id?: string | null
}

export type CollectionData = {
  invoices: (CollectionInvoice & { total: number; amount_paid?: number | null; prepaid_amount?: number | null; company_id?: string | null })[]
  clients: Record<string, CollectionClient>
  payments: CollectionPayment[]
}

const FULL_COLUMNS = 'id, user_id, company_id, client_id, series, invoice_number, issue_date, due_date, total, status, reminder_sent_at, promised_pay_date, amount_paid, prepaid_amount, invoice_type_code, notes, exchange_rate, subtotal, invoice_items(quantity, unit_price, tva_rate, total), clients(id, company_name, cui, email, city)'
const NO_FX_COLUMNS = FULL_COLUMNS.replace(', exchange_rate, subtotal', '')
const CORE_COLUMNS = 'id, user_id, company_id, client_id, series, invoice_number, issue_date, due_date, total, status, amount_paid, prepaid_amount, notes, clients(id, company_name, cui, email, city)'

type Scope = { companyId?: string | null; ownerUserId: string; clientId?: string }

// Supabase client is untyped in this codebase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadCollectionData(supabase: any, scope: Scope): Promise<CollectionData> {
  const run = (columns: string) => {
    let query = supabase
      .from('invoices')
      .select(columns)
      .in('status', [...RECEIVABLE_LIST_STATUSES])
      .order('due_date', { ascending: true })
    query = scope.companyId ? query.eq('company_id', scope.companyId) : query.eq('user_id', scope.ownerUserId)
    if (scope.clientId) query = query.eq('client_id', scope.clientId)
    return query
  }
  let { data, error } = await run(FULL_COLUMNS)
  // Databases without the latest migrations (exchange rate, reminders) fall back to the core columns.
  if (error) ({ data, error } = await run(NO_FX_COLUMNS))
  if (error) ({ data, error } = await run(CORE_COLUMNS))
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const issued = ((data || []) as any[]).filter(row => row.client_id && row.invoice_type_code !== '381' && !isPurchaseInvoice(row))
  const converted = await Promise.all(issued.map(row => ensureConvertedInvoiceAmounts(supabase, row)))

  const ids = converted.map(row => row.id)
  const payments: CollectionPayment[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const res = await supabase
      .from('invoice_payments')
      .select('invoice_id, amount, paid_on, bank_transaction_id')
      .in('invoice_id', chunk)
    if (!res.error) payments.push(...((res.data || []) as CollectionPayment[]))
  }
  const lastPaid: Record<string, string> = {}
  for (const p of payments) {
    if (!lastPaid[p.invoice_id] || p.paid_on > lastPaid[p.invoice_id]) lastPaid[p.invoice_id] = p.paid_on
  }

  const clients: Record<string, CollectionClient> = {}
  const invoices = converted.map(row => {
    if (row.clients) clients[row.client_id] = { id: row.client_id, ...row.clients }
    const rest = remainingOf(row)
    const settled = row.status === 'paid' || rest < 0.009
    return {
      id: row.id,
      client_id: row.client_id,
      company_id: row.company_id,
      series: row.series,
      invoice_number: row.invoice_number,
      issue_date: row.issue_date,
      due_date: row.due_date || row.issue_date,
      billed: billedTotal(row),
      total: Number(row.total || 0),
      amount_paid: row.amount_paid,
      prepaid_amount: row.prepaid_amount,
      rest: settled ? 0 : rest,
      status: settled ? 'paid' : row.status,
      reminder_sent_at: row.reminder_sent_at ? String(row.reminder_sent_at).slice(0, 10) : null,
      promised_pay_date: row.promised_pay_date,
      settled_on: settled ? lastPaid[row.id] || null : null
    }
  })
  // ANAF status lives in columns that older databases may not have: separate query, failures ignored.
  const clientIds = Object.keys(clients)
  for (let i = 0; i < clientIds.length; i += 200) {
    const res = await supabase
      .from('clients')
      .select('id, anaf_inactive, anaf_deregistered_on')
      .in('id', clientIds.slice(i, i + 200))
    if (res.error) break
    for (const row of res.data || []) {
      if (!clients[row.id]) continue
      clients[row.id].anaf_flag = row.anaf_deregistered_on ? 'deregistered' : row.anaf_inactive ? 'inactive' : null
    }
  }
  return { invoices, clients, payments }
}

const BILLED_COLUMNS = 'client_id, issue_date, total, notes, invoice_type_code, exchange_rate, subtotal, invoice_items(quantity, unit_price, tva_rate, total)'
const BILLED_CORE_COLUMNS = 'client_id, issue_date, total, notes'

/** Billed amount (RON) per client since `fromDate`, for ranking a client in the portfolio. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadBilledByClient(supabase: any, scope: Omit<Scope, 'clientId'>, fromDate: string): Promise<Record<string, number>> {
  const run = (columns: string) => {
    const query = supabase
      .from('invoices')
      .select(columns)
      .in('status', [...RECEIVABLE_LIST_STATUSES])
      .gte('issue_date', fromDate)
    return scope.companyId ? query.eq('company_id', scope.companyId) : query.eq('user_id', scope.ownerUserId)
  }
  let { data, error } = await run(BILLED_COLUMNS)
  if (error) ({ data, error } = await run(BILLED_CORE_COLUMNS))
  if (error) return {}
  const totals: Record<string, number> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data || []) as any[]) {
    if (!row.client_id || row.invoice_type_code === '381' || isPurchaseInvoice(row)) continue
    totals[row.client_id] = (totals[row.client_id] || 0) + billedTotal(row)
  }
  return totals
}

export type ReminderData = {
  /** false when the reminder tables are not migrated yet. */
  available: boolean
  settings: { client_id: string; enabled: boolean; offsets: number[]; recipient_email?: string | null } | null
  log: { invoice_id: string; offset_days: number | null; kind: 'auto' | 'manual'; sent_at: string }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadReminderData(supabase: any, clientId: string, invoiceIds: string[]): Promise<ReminderData> {
  const settingsRes = await supabase
    .from('client_reminder_settings')
    .select('client_id, enabled, offsets, recipient_email')
    .eq('client_id', clientId)
    .maybeSingle()
  if (settingsRes.error) return { available: false, settings: null, log: [] }
  const log: ReminderData['log'] = []
  for (let i = 0; i < invoiceIds.length; i += 200) {
    const res = await supabase
      .from('invoice_reminder_log')
      .select('invoice_id, offset_days, kind, sent_at')
      .in('invoice_id', invoiceIds.slice(i, i + 200))
      .order('sent_at', { ascending: false })
    if (!res.error) log.push(...(res.data || []))
  }
  return { available: true, settings: settingsRes.data || null, log }
}
