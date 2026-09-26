// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type EfacturaLogOperation = 'validate' | 'upload' | 'status' | 'import'
export type EfacturaLogOutcome =
  | 'ok'            // accepted by ANAF / imported
  | 'rejected'      // ANAF refused the invoice (final until corrected)
  | 'invalid'       // stopped before sending: ANAF's validator found errors
  | 'missing_data'  // stopped before sending: data missing in Facturo
  | 'processing'    // ANAF has it, still processing
  | 'unavailable'   // ANAF did not answer; retried automatically
  | 'error'         // anything else (token, storage, unexpected answer)
  | 'skipped'       // already imported / nothing to do

export type EfacturaLogInput = {
  userId: string
  companyId?: string | null
  invoiceId?: string | null
  direction: 'out' | 'in'
  operation: EfacturaLogOperation
  outcome: EfacturaLogOutcome
  trigger?: 'user' | 'job'
  invoiceRef?: string | null
  indexIncarcare?: string | null
  messageId?: string | null
  attempt?: number | null
  code?: string | null
  message?: string | null
  durationMs?: number | null
}

export type EfacturaLogRow = {
  invoice_id?: string | null
  direction: 'out' | 'in'
  operation: EfacturaLogOperation
  outcome: EfacturaLogOutcome
  message_id?: string | null
  invoice_ref?: string | null
  message?: string | null
  code?: string | null
  created_at: string
}

/** When the table is missing (migration not applied yet), stop trying for a while instead of failing every call. */
let disabledUntil = 0

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || '')
  return error?.code === '42P01' || error?.code === 'PGRST205' || /efactura_log/.test(message) && /(does not exist|schema cache|not find)/i.test(message)
}

/** Writes one journal line. Never throws: the journal must not break sending or importing. */
export async function logEfactura(db: Db, input: EfacturaLogInput) {
  if (!input.userId || Date.now() < disabledUntil) return
  try {
    const { error } = await db.from('efactura_log').insert({
      user_id: input.userId,
      company_id: input.companyId || null,
      invoice_id: input.invoiceId || null,
      direction: input.direction,
      operation: input.operation,
      outcome: input.outcome,
      trigger: input.trigger || 'user',
      invoice_ref: input.invoiceRef || null,
      index_incarcare: input.indexIncarcare || null,
      message_id: input.messageId || null,
      attempt: input.attempt ?? null,
      code: input.code || null,
      message: input.message ? String(input.message).slice(0, 1000) : null,
      duration_ms: input.durationMs ?? null
    })
    if (error) {
      if (isMissingTable(error)) disabledUntil = Date.now() + 5 * 60_000
      else console.warn('efactura_log:', error.message)
    }
  } catch (error) {
    console.warn('efactura_log:', error instanceof Error ? error.message : error)
  }
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)

export type EfacturaStats = {
  out: {
    /** Invoices ANAF gave a final answer for, or that are still on their way. */
    sent: number
    accepted: number
    rejected: number
    pending: number
    /** Accepted at the first upload, with no outage in between. */
    acceptedFirstTry: number
    /** Accepted after at least one automatic retry (ANAF was down). */
    recoveredAfterOutage: number
    /** Stopped before sending (missing data / validator errors), never reached ANAF. */
    blockedBeforeSend: number
    /** accepted / (accepted + rejected) */
    acceptanceRate: number | null
  }
  in: {
    messages: number
    imported: number
    alreadyKnown: number
    failed: number
    /** imported / (imported + failed) */
    importRate: number | null
  }
  /** Both directions: documents transferred / documents with a final answer. */
  transferRate: number | null
  outages: number
  topErrors: Array<{ message: string; count: number }>
}

/**
 * Turns journal lines into rates. Each invoice / SPV message counts once, by its latest answer:
 * an invoice rejected, corrected and accepted counts as accepted.
 */
export function summarizeEfacturaLog(rows: EfacturaLogRow[]): EfacturaStats {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))

  const outByInvoice = new Map<string, EfacturaLogRow[]>()
  const inByMessage = new Map<string, EfacturaLogRow>()
  const errorCounts = new Map<string, number>()
  let outages = 0

  for (const row of sorted) {
    if (row.outcome === 'unavailable') outages += 1
    if (row.outcome === 'rejected' || row.outcome === 'invalid' || row.outcome === 'missing_data' || row.outcome === 'error') {
      const key = String(row.message || row.code || row.outcome).replace(/^Factura nu a fost trimisă:\s*/, '').slice(0, 160)
      errorCounts.set(key, (errorCounts.get(key) || 0) + 1)
    }
    if (row.direction === 'out') {
      const key = row.invoice_id || row.invoice_ref
      if (!key) continue
      outByInvoice.set(key, [...(outByInvoice.get(key) || []), row])
    } else if (row.operation === 'import') {
      const key = row.message_id || row.invoice_ref
      if (key) inByMessage.set(key, row)
    }
  }

  const out = { sent: 0, accepted: 0, rejected: 0, pending: 0, acceptedFirstTry: 0, recoveredAfterOutage: 0, blockedBeforeSend: 0, acceptanceRate: null as number | null }
  for (const history of outByInvoice.values()) {
    const transport = history.filter(r => r.operation === 'upload' || r.operation === 'status')
    const last = transport[transport.length - 1]
    if (!last) {
      if (history.some(r => r.outcome === 'invalid' || r.outcome === 'missing_data')) out.blockedBeforeSend += 1
      continue
    }
    out.sent += 1
    if (last.outcome === 'ok') {
      out.accepted += 1
      const hadOutage = transport.some(r => r.outcome === 'unavailable')
      const uploads = transport.filter(r => r.operation === 'upload' && r.outcome !== 'unavailable').length
      if (hadOutage) out.recoveredAfterOutage += 1
      else if (uploads <= 1 && !transport.some(r => r.outcome === 'rejected')) out.acceptedFirstTry += 1
    } else if (last.outcome === 'rejected') {
      out.rejected += 1
    } else {
      out.pending += 1
    }
  }
  out.acceptanceRate = pct(out.accepted, out.accepted + out.rejected)

  const inStats = { messages: 0, imported: 0, alreadyKnown: 0, failed: 0, importRate: null as number | null }
  for (const row of inByMessage.values()) {
    inStats.messages += 1
    if (row.outcome === 'ok') inStats.imported += 1
    else if (row.outcome === 'skipped') inStats.alreadyKnown += 1
    else inStats.failed += 1
  }
  inStats.importRate = pct(inStats.imported + inStats.alreadyKnown, inStats.imported + inStats.alreadyKnown + inStats.failed)

  const done = out.accepted + inStats.imported + inStats.alreadyKnown
  return {
    out,
    in: inStats,
    transferRate: pct(done, done + out.rejected + inStats.failed),
    outages,
    topErrors: [...errorCounts.entries()]
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }
}
