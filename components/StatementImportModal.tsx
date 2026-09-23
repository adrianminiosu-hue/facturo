'use client'
import { useMemo, useState } from 'react'
import type { MatchRow, OpenInvoice } from '@/lib/paymentMatch'
import { remainingOf } from '@/lib/paymentMatch'
import { formatRon } from '@/lib/money'
import { useLocale } from '@/components/LocaleProvider'
import type { MessageKey } from '@/lib/messages'

type ImportAction = 'import' | 'unallocated' | 'skip'

type PreviewResponse = {
  error?: string
  warnings?: string[]
  ibanMismatch?: boolean
  companyIban?: string
  companyName?: string
  statementIbans?: string[]
  rows?: MatchRow[]
  invoices?: OpenInvoice[]
  skippedDebits?: number
}

type DraftLine = MatchRow & { action: ImportAction; invoiceId: string }

function ron(n: number) {
  return formatRon(n)
}

function remaining(inv: OpenInvoice) {
  return remainingOf(inv)
}

function invoiceLabel(t: (key: MessageKey, vars?: Record<string, string | number>) => string, inv: OpenInvoice) {
  return t('imp.invoiceRest', {
    ref: `${inv.series}${inv.invoice_number}`,
    client: inv.client_name || t('common.client'),
    amount: ron(remaining(inv))
  })
}

function statusLabel(status: MatchRow['status']): { key: MessageKey; className: string } {
  if (status === 'matched') return { key: 'imp.status.matched', className: 'text-green-700 bg-green-50' }
  if (status === 'suggested') return { key: 'imp.status.suggested', className: 'text-amber-800 bg-amber-50' }
  if (status === 'duplicate') return { key: 'imp.status.duplicate', className: 'text-gray-600 bg-gray-100' }
  if (status === 'skipped') return { key: 'imp.status.skipped', className: 'text-gray-600 bg-gray-100' }
  return { key: 'imp.status.unmatched', className: 'text-[color:var(--color-muted-foreground)] bg-[color:var(--color-muted)]' }
}

function defaultAction(row: MatchRow): ImportAction {
  if (row.status === 'matched' || row.status === 'suggested') return 'import'
  if (row.status === 'unmatched') return 'skip'
  return 'skip'
}

export default function StatementImportModal({
  userId,
  companyId,
  companyName,
  onClose,
  onImported
}: {
  userId: string
  companyId: string
  companyName?: string
  onClose: () => void
  onImported: () => void
}) {
  const { t } = useLocale()
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [ibanMismatch, setIbanMismatch] = useState(false)
  const [allowIbanMismatch, setAllowIbanMismatch] = useState(false)
  const [skippedDebits, setSkippedDebits] = useState(0)
  const [invoices, setInvoices] = useState<OpenInvoice[]>([])
  const [lines, setLines] = useState<DraftLine[]>([])
  const [summary, setSummary] = useState('')

  const highConfidence = useMemo(
    () => lines.filter(l => l.status === 'matched' && l.confidence >= 70),
    [lines]
  )

  const parseFile = async (file: File) => {
    setError('')
    setSummary('')
    setFileName(file.name)
    const xml = await file.text()
    if (!xml.trim()) {
      setError(t('imp.emptyFile'))
      return
    }
    setBusy('preview')
    try {
      const res = await fetch('/api/payments/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, companyId, xml, filename: file.name })
      })
      const data = await res.json() as PreviewResponse
      if (!res.ok) {
        setError(data.error || t('imp.readFail'))
        setLines([])
        return
      }
      setWarnings(data.warnings || [])
      setIbanMismatch(!!data.ibanMismatch)
      setAllowIbanMismatch(false)
      setSkippedDebits(data.skippedDebits || 0)
      setInvoices(data.invoices || [])
      setLines((data.rows || []).map(row => ({
        ...row,
        action: defaultAction(row),
        invoiceId: row.proposedInvoiceId || ''
      })))
    } catch {
      setError(t('imp.readFailXml'))
    } finally {
      setBusy('')
    }
  }

  const updateLine = (fingerprint: string, patch: Partial<DraftLine>) => {
    setLines(prev => prev.map(line => {
      if (line.fingerprint !== fingerprint) return line
      const next = { ...line, ...patch }
      if (patch.invoiceId !== undefined && patch.invoiceId && next.action === 'skip') {
        next.action = 'import'
      }
      if (next.action === 'import' && !next.invoiceId) next.action = 'unallocated'
      return next
    }))
  }

  const confirmHighConfidence = () => {
    const ids = new Set(highConfidence.map(l => l.fingerprint))
    setLines(prev => prev.map(line => {
      if (!ids.has(line.fingerprint)) return line
      return { ...line, action: 'import', invoiceId: line.invoiceId || line.proposedInvoiceId || '' }
    }))
  }

  const commit = async () => {
    setError('')
    setSummary('')
    const payload = lines.filter(l => l.action !== 'skip')
    if (payload.length === 0) {
      setError(t('imp.noLines'))
      return
    }
    if (ibanMismatch && !allowIbanMismatch) {
      setError(t('imp.ibanConfirmNeeded'))
      return
    }
    const missingInvoice = payload.filter(l => l.action === 'import' && !l.invoiceId)
    if (missingInvoice.length) {
      setError(t('imp.missingInvoice'))
      return
    }
    setBusy('commit')
    try {
      const res = await fetch('/api/payments/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          companyId,
          allowIbanMismatch,
          lines: payload.map(line => ({
            fingerprint: line.fingerprint,
            amount: line.amount,
            paidOn: line.paidOn,
            currency: line.currency,
            bankTxnId: line.bankTxnId,
            reference: line.reference,
            counterpartIban: line.counterpartIban,
            counterpartName: line.counterpartName,
            details: line.details,
            statementIban: line.statementIban,
            invoiceId: line.action === 'import' ? line.invoiceId : null,
            action: line.action
          }))
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('imp.fail'))
        return
      }
      const bits = [
        data.imported ? t('imp.matched', { count: data.imported }) : '',
        data.unallocated ? t('imp.unallocated', { count: data.unallocated }) : '',
        data.duplicates ? t('imp.duplicates', { count: data.duplicates }) : '',
        data.errors ? t('imp.errors', { count: data.errors }) : ''
      ].filter(Boolean)
      setSummary(t('imp.done', { bits: bits.join(', ') || t('imp.nothing') }))
      if (data.imported > 0 || data.unallocated > 0) onImported()
    } catch {
      setError(t('imp.failRetry'))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4 bg-black/40" onClick={onClose}>
      <div
        className="card w-full max-w-5xl max-h-[92vh] overflow-y-auto p-5 sm:p-7 rounded-t-2xl sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="kicker mb-2">{t('imp.kicker')}</p>
            <h3 className="brand text-2xl">{t('imp.title')}</h3>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
              {companyName ? `${companyName} · ` : ''}{t('imp.lead')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]">
            {t('common.close')}
          </button>
        </div>

        <label className="block mb-4">
          <span className="block text-sm mb-1 text-[color:var(--color-muted-foreground)]">{t('imp.file')}</span>
          <input
            type="file"
            accept=".xml,text/xml,application/xml"
            className="input py-2"
            disabled={busy !== ''}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) parseFile(file)
            }}
          />
          {fileName && (
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">{fileName}</p>
          )}
        </label>

        {busy === 'preview' && (
          <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">{t('imp.reading')}</p>
        )}

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        {summary && <p className="text-sm text-green-700 mb-4">{summary}</p>}

        {warnings.map(w => (
          <p key={w} className="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2 mb-2">{w}</p>
        ))}

        {ibanMismatch && (
          <label className="flex items-start gap-2 text-sm mb-4 mt-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={allowIbanMismatch}
              onChange={e => setAllowIbanMismatch(e.target.checked)}
            />
            <span>{t('imp.allowMismatch')}</span>
          </label>
        )}

        {skippedDebits > 0 && lines.length > 0 && (
          <p className="text-xs text-[color:var(--color-muted-foreground)] mb-3">
            {t('imp.skippedDebits', { count: skippedDebits })}
          </p>
        )}

        {lines.length === 0 && !busy && fileName && !error && (
          <div className="card p-8 text-center mb-4">
            <p className="text-[color:var(--color-muted-foreground)]">{t('imp.noCredits')}</p>
          </div>
        )}

        {lines.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                className="btn btn-outline text-xs py-1.5 px-3"
                onClick={confirmHighConfidence}
                disabled={highConfidence.length === 0}
              >
                {t('imp.confirmSafe', { count: highConfidence.length })}
              </button>
              <p className="text-xs text-[color:var(--color-muted-foreground)] self-center">
                {t('imp.hint')}
              </p>
            </div>

            <div className="overflow-x-auto border border-[color:var(--color-border)] rounded-xl mb-4">
              <table className="min-w-[860px] w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 text-[11px] uppercase tracking-wider text-[color:var(--color-muted-foreground)] text-left">
                    <th className="px-3 py-2 font-medium">{t('imp.dateAmount')}</th>
                    <th className="px-3 py-2 font-medium">{t('imp.payer')}</th>
                    <th className="px-3 py-2 font-medium">{t('imp.proposed')}</th>
                    <th className="px-3 py-2 font-medium">{t('imp.reason')}</th>
                    <th className="px-3 py-2 font-medium">{t('imp.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => {
                    const badge = statusLabel(line.status)
                    const locked = line.status === 'duplicate' || line.status === 'skipped'
                    return (
                      <tr key={line.fingerprint} className="border-t border-gray-50 align-top">
                        <td className="px-3 py-3">
                          <p className="font-medium">{ron(line.amount)}</p>
                          <p className="text-xs text-[color:var(--color-muted-foreground)]">{line.paidOn || '—'}</p>
                          <span className={`inline-block mt-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${badge.className}`}>
                            {t(badge.key)}{line.status === 'matched' || line.status === 'suggested' ? ` · ${line.confidence}` : ''}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <p className="truncate max-w-[14rem]">{line.counterpartName || '—'}</p>
                          <p className="text-xs text-[color:var(--color-muted-foreground)] truncate max-w-[14rem]">
                            {line.counterpartIban || t('imp.noIban')}
                          </p>
                          {line.details && (
                            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1 line-clamp-2 max-w-[14rem]">
                              {line.details}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <select
                            className="input py-1.5 px-2 text-xs bg-white"
                            disabled={locked || busy !== ''}
                            value={line.invoiceId}
                            onChange={e => updateLine(line.fingerprint, {
                              invoiceId: e.target.value,
                              action: e.target.value ? 'import' : line.action === 'import' ? 'unallocated' : line.action
                            })}
                          >
                            <option value="">{t('imp.noInvoice')}</option>
                            {invoices
                              .filter(inv => inv.id === line.invoiceId || remaining(inv) + 0.009 >= line.amount)
                              .map(inv => (
                              <option key={inv.id} value={inv.id}>{invoiceLabel(t, inv)}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3 text-xs text-[color:var(--color-muted-foreground)]">
                          {line.skipReason || line.reasons[0] || t('imp.noMatch')}
                          {line.warnings[0] && (
                            <p className="text-amber-800 mt-1">{line.warnings[0]}</p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <select
                            className="input py-1.5 px-2 text-xs bg-white"
                            disabled={locked || busy !== ''}
                            value={locked ? 'skip' : line.action}
                            onChange={e => updateLine(line.fingerprint, { action: e.target.value as ImportAction })}
                          >
                            <option value="import">{t('imp.importOn')}</option>
                            <option value="unallocated">{t('imp.unallocatedOpt')}</option>
                            <option value="skip">{t('imp.skip')}</option>
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={commit}
                disabled={busy !== ''}
                className="btn btn-primary disabled:opacity-50"
              >
                {busy === 'commit' ? t('common.importing') : t('imp.commit')}
              </button>
              <button type="button" onClick={onClose} className="btn btn-outline">
                {t('common.close')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
