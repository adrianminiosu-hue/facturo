import type { SupabaseClient } from '@supabase/supabase-js'
import { billedTotal, remainingOf } from '@/lib/invoiceMath'
import { isOpenReceivable } from '@/lib/invoiceStatus'
import { formatRon } from '@/lib/money'

export const PAYMENT_SOURCE_XML940 = 'xml940'

export type ImportAction = 'import' | 'unallocated' | 'skip'

export type CommitLine = {
  fingerprint: string
  amount: number
  paidOn: string
  currency?: string
  bankTxnId?: string | null
  reference?: string | null
  counterpartIban?: string | null
  counterpartName?: string | null
  details?: string | null
  statementIban?: string | null
  invoiceId?: string | null
  action: ImportAction
}

export type CommitLineResult = {
  fingerprint: string
  outcome: 'imported' | 'unallocated' | 'skipped' | 'duplicate' | 'error'
  invoiceId: string | null
  error?: string
}

function notesFrom(line: CommitLine) {
  const bits = [
    line.counterpartName ? `De la ${line.counterpartName}` : '',
    line.details || ''
  ].filter(Boolean)
  const text = bits.join(' · ').slice(0, 500)
  return text || 'Extras Multicash XML 940'
}

export async function applyImportedPayment(
  client: SupabaseClient,
  opts: {
    userId: string
    companyId: string
    line: CommitLine
    remainingByInvoice: Map<string, number>
    invoiceMeta: Map<string, { total: number; status: string; company_id: string | null }>
  }
): Promise<CommitLineResult> {
  const { userId, companyId, line, remainingByInvoice, invoiceMeta } = opts
  if (line.action === 'skip') {
    return { fingerprint: line.fingerprint, outcome: 'skipped', invoiceId: line.invoiceId || null }
  }
  if (!line.paidOn || !Number.isFinite(line.amount) || line.amount <= 0) {
    return { fingerprint: line.fingerprint, outcome: 'error', invoiceId: null, error: 'Sumă sau dată invalidă.' }
  }
  if (line.currency && line.currency !== 'RON') {
    return { fingerprint: line.fingerprint, outcome: 'error', invoiceId: null, error: 'Doar RON.' }
  }

  const payload: Record<string, unknown> = {
    user_id: userId,
    company_id: companyId,
    amount: line.amount,
    paid_on: line.paidOn,
    method: 'transfer',
    source: PAYMENT_SOURCE_XML940,
    reference: line.bankTxnId || line.reference || null,
    notes: notesFrom(line),
    bank_txn_id: line.bankTxnId || null,
    counterpart_iban: line.counterpartIban || null,
    counterpart_name: line.counterpartName || null,
    fingerprint: line.fingerprint
  }

  if (line.action === 'unallocated' || !line.invoiceId) {
    return {
      fingerprint: line.fingerprint,
      outcome: 'error',
      invoiceId: null,
      error: 'Plățile nealocate se salvează ca bank_transactions, nu ca invoice_payments fără factură.'
    }
  }

  const invoiceId = line.invoiceId
  const meta = invoiceMeta.get(invoiceId)
  if (!meta) {
    return { fingerprint: line.fingerprint, outcome: 'error', invoiceId, error: 'Factura nu a fost găsită.' }
  }
  if (meta.company_id && meta.company_id !== companyId) {
    return { fingerprint: line.fingerprint, outcome: 'error', invoiceId, error: 'Factura nu aparține firmei active.' }
  }
  const rest = remainingByInvoice.get(invoiceId)
  if (rest === undefined) {
    return { fingerprint: line.fingerprint, outcome: 'error', invoiceId, error: 'Factura nu este deschisă pentru încasare.' }
  }
  if (line.amount > rest + 0.009) {
    return {
      fingerprint: line.fingerprint,
      outcome: 'error',
      invoiceId,
      error: `Suma depășește restul de plată (${formatRon(rest)}).`
    }
  }

  payload.invoice_id = invoiceId
  const insert = await client.from('invoice_payments').insert(payload)
  if (insert.error) {
    if (insert.error.message?.toLowerCase().includes('fingerprint') || insert.error.code === '23505') {
      return { fingerprint: line.fingerprint, outcome: 'duplicate', invoiceId }
    }
    return {
      fingerprint: line.fingerprint,
      outcome: 'error',
      invoiceId,
      error: insert.error.message.includes('column') || insert.error.message.includes('schema')
        ? 'Rulează migrarea Multicash (coloane extras XML) în Supabase.'
        : insert.error.message
    }
  }

  remainingByInvoice.set(invoiceId, Math.max(0, rest - line.amount))
  invoiceMeta.set(invoiceId, { ...meta, status: rest - line.amount <= 0.009 ? 'paid' : meta.status })
  return { fingerprint: line.fingerprint, outcome: 'imported', invoiceId }
}

export function remainingMapFromInvoices(
  invoices: Array<{
    id: string
    total: number
    amount_paid?: number | null
    prepaid_amount?: number | null
    status: string
    company_id?: string | null
    invoice_items?: Array<{ quantity?: number | null; unit_price?: number | null; tva_rate?: number | null; total?: number | null }>
    exchange_rate?: number | null
    subtotal?: number | null
  }>
) {
  const remaining = new Map<string, number>()
  const meta = new Map<string, { total: number; status: string; company_id: string | null }>()
  for (const inv of invoices) {
    if (!isOpenReceivable(inv.status)) continue
    remaining.set(inv.id, remainingOf(inv))
    meta.set(inv.id, {
      total: billedTotal(inv),
      status: inv.status,
      company_id: inv.company_id || null
    })
  }
  return { remaining, meta }
}
