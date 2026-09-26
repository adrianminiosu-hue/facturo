import { isAnafUnavailable } from '@/lib/anafEfactura'
import { anafEfacturaMode, anafOAuthConfigured, getValidAccessToken } from '@/lib/anafOAuth'
import { loadAwaitingAnaf, loadDueQueued } from '@/lib/efacturaQueue'
import { checkAnafStatus, invoiceRefOf, sendInvoice, type SendOutcome } from '@/lib/efacturaSend'
import { isPurchaseInvoice } from '@/lib/invoiceStatus'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type EfacturaSyncReport = {
  skipped?: string
  checked: number
  retried: number
  results: Array<{ invoiceId: string; invoiceRef: string; operation: 'status' | 'retry'; outcome: SendOutcome | 'unavailable'; error?: string }>
  /** Owners whose ANAF connection is missing or expired. */
  notConnected: string[]
  /** True when the time budget ran out before everything was processed. */
  partial: boolean
}

/**
 * Brings e-Factura up to date without anyone clicking:
 *  1. asks ANAF for the state of invoices it has but has not answered for (uploaded / in processing);
 *  2. sends again the invoices waiting in the retry queue whose next attempt is due.
 * If ANAF stops answering for an owner, that owner's remaining invoices wait for the next run.
 */
export async function runEfacturaSync(db: Db, opts: {
  ownerUserIds?: string[]
  limit?: number
  budgetMs?: number
} = {}): Promise<EfacturaSyncReport> {
  const report: EfacturaSyncReport = { checked: 0, retried: 0, results: [], notConnected: [], partial: false }
  if (anafEfacturaMode() === 'simulate') return { ...report, skipped: 'Mod simulare: nu se contactează ANAF.' }
  if (!anafOAuthConfigured()) return { ...report, skipped: 'ANAF OAuth nu este configurat.' }

  const started = Date.now()
  const budget = opts.budgetMs ?? 45_000
  const limit = opts.limit ?? 40
  const [awaiting, queued] = await Promise.all([
    loadAwaitingAnaf(db, { ownerUserIds: opts.ownerUserIds, limit }),
    loadDueQueued(db, { ownerUserIds: opts.ownerUserIds, limit })
  ])

  const work = [
    ...awaiting.filter(inv => !isPurchaseInvoice(inv)).map(invoice => ({ invoice, operation: 'status' as const })),
    ...queued.filter(inv => !isPurchaseInvoice(inv)).map(invoice => ({ invoice, operation: 'retry' as const }))
  ]

  const tokens = new Map<string, string | null>()
  const anafDown = new Set<string>()

  for (const { invoice, operation } of work) {
    if (Date.now() - started > budget) { report.partial = true; break }
    const owner = String(invoice.user_id)
    if (anafDown.has(owner)) continue

    if (!tokens.has(owner)) {
      const row = await getValidAccessToken(owner, 'test').catch(() => null)
      tokens.set(owner, row?.access_token || null)
      if (!row?.access_token) report.notConnected.push(owner)
    }
    const accessToken = tokens.get(owner)
    if (!accessToken) continue

    const invoiceRef = invoiceRefOf(invoice as { id: string; user_id: string })
    try {
      const result = operation === 'status'
        ? await checkAnafStatus(db, { invoice: invoice as { id: string; user_id: string }, accessToken, indexIncarcare: String(invoice.efactura_index), trigger: 'job', poll: false })
        : await sendInvoice(db, { invoice: invoice as { id: string; user_id: string }, accessToken, trigger: 'job' })
      if (operation === 'status') report.checked += 1
      else report.retried += 1
      report.results.push({ invoiceId: invoice.id, invoiceRef, operation, outcome: result.outcome, error: result.error })
      // Still queued after a retry = ANAF still down: leave the rest of this owner's invoices for later.
      if (result.outcome === 'queued') anafDown.add(owner)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      report.results.push({ invoiceId: invoice.id, invoiceRef, operation, outcome: isAnafUnavailable(error) ? 'unavailable' : 'error', error: message })
      if (isAnafUnavailable(error) || /token/i.test(message)) anafDown.add(owner)
    }
  }

  return report
}
