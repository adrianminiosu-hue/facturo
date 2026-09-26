import { anafEfacturaEnvironment } from '@/lib/anafOAuth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * Retry queue for invoices ANAF could not receive (outage, timeout, 5xx).
 * The invoice waits with efactura_status = 'queued' and is sent again by the e-Factura sync
 * (daily cron + every time someone opens the invoices list), with growing pauses.
 */
export const QUEUE_DELAYS_MIN = [5, 15, 30, 60, 120, 240, 480, 720]
/** ~4 days of retries: the legal deadline is 5 working days from issue. */
export const QUEUE_MAX_ATTEMPTS = 14
/** Without the queue columns (migration not applied), retry anything queued longer than this. */
export const QUEUE_FALLBACK_DELAY_MIN = 15

export function nextAttemptAt(attempts: number, now = Date.now()) {
  if (attempts >= QUEUE_MAX_ATTEMPTS) return null
  const minutes = QUEUE_DELAYS_MIN[Math.min(Math.max(attempts - 1, 0), QUEUE_DELAYS_MIN.length - 1)]
  return new Date(now + minutes * 60_000).toISOString()
}

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' })
}

export function queuedMessage(reason: string, next: string | null) {
  return next
    ? `${reason} Factura este în coadă și se retrimite automat (următoarea încercare după ${hhmm(next)}).`
    : `${reason} Retrimiterea automată s-a oprit după ${QUEUE_MAX_ATTEMPTS} încercări: retrimite manual din pagina facturii.`
}

function isMissingColumn(error: { message?: string } | null | undefined) {
  return /efactura_(attempts|next_attempt_at|queued_at)/.test(String(error?.message || ''))
}

export type QueueableInvoice = {
  id: string
  efactura_attempts?: number | null
  efactura_queued_at?: string | null
}

/** Puts the invoice in the retry queue. Works before and after the queue migration. */
export async function persistQueued(db: Db, invoice: QueueableInvoice, reason: string, now = Date.now()) {
  const attempts = (Number(invoice.efactura_attempts) || 0) + 1
  const next = nextAttemptAt(attempts, now)
  const error = queuedMessage(reason, next)
  const base = {
    efactura_status: 'queued',
    efactura_error: error,
    efactura_uploaded_at: new Date(now).toISOString(),
    efactura_environment: anafEfacturaEnvironment()
  }
  const full = {
    ...base,
    efactura_attempts: attempts,
    efactura_next_attempt_at: next,
    efactura_queued_at: invoice.efactura_queued_at || new Date(now).toISOString()
  }
  let result = await db.from('invoices').update(full).eq('id', invoice.id)
  if (result.error && isMissingColumn(result.error)) result = await db.from('invoices').update(base).eq('id', invoice.id)
  return {
    attempts,
    nextAttemptAt: next,
    patch: { efactura_status: 'queued', efactura_error: error, efactura_index: null as string | null }
  }
}

/** Clears the retry bookkeeping once ANAF has the invoice (or it needs a human). */
export async function clearQueue(db: Db, invoiceId: string) {
  const { error } = await db.from('invoices').update({ efactura_attempts: 0, efactura_next_attempt_at: null, efactura_queued_at: null }).eq('id', invoiceId)
  return !error
}

const PENDING_COLUMNS = '*'

/** Queued invoices whose next attempt is due. */
export async function loadDueQueued(db: Db, opts: { ownerUserIds?: string[]; limit: number; now?: number }) {
  const now = opts.now ?? Date.now()
  const scoped = (q: Db) => (opts.ownerUserIds ? q.in('user_id', opts.ownerUserIds) : q)
  const nowIso = new Date(now).toISOString()
  let res = await scoped(db.from('invoices').select(PENDING_COLUMNS).eq('efactura_status', 'queued'))
    .not('efactura_next_attempt_at', 'is', null)
    .lte('efactura_next_attempt_at', nowIso)
    .order('efactura_next_attempt_at', { ascending: true })
    .limit(opts.limit)
  if (res.error && isMissingColumn(res.error)) {
    res = await scoped(db.from('invoices').select(PENDING_COLUMNS).eq('efactura_status', 'queued'))
      .lte('efactura_uploaded_at', new Date(now - QUEUE_FALLBACK_DELAY_MIN * 60_000).toISOString())
      .order('efactura_uploaded_at', { ascending: true })
      .limit(opts.limit)
  }
  if (res.error) throw new Error(res.error.message)
  return (res.data || []) as Array<Record<string, any>> // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Invoices ANAF has but has not answered for yet. */
export async function loadAwaitingAnaf(db: Db, opts: { ownerUserIds?: string[]; limit: number }) {
  let q = db.from('invoices').select(PENDING_COLUMNS).in('efactura_status', ['uploaded', 'in_processing']).not('efactura_index', 'is', null)
  if (opts.ownerUserIds) q = q.in('user_id', opts.ownerUserIds)
  const res = await q.order('efactura_uploaded_at', { ascending: true }).limit(opts.limit)
  if (res.error) throw new Error(res.error.message)
  return (res.data || []) as Array<Record<string, any>> // eslint-disable-line @typescript-eslint/no-explicit-any
}
