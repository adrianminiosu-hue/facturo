'use client'
import { useMemo, useState } from 'react'
import type { MatchRow, OpenInvoice } from '@/lib/paymentMatch'

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
  return `${Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`
}

function remaining(inv: OpenInvoice) {
  return Math.max(0, Number(inv.total) - Number(inv.amount_paid || 0))
}

function invoiceLabel(inv: OpenInvoice) {
  return `${inv.series}${inv.invoice_number} · ${inv.client_name || 'Client'} · rest ${ron(remaining(inv))}`
}

function statusLabel(status: MatchRow['status']) {
  if (status === 'matched') return { text: 'Potrivită', className: 'text-green-700 bg-green-50' }
  if (status === 'suggested') return { text: 'De confirmat', className: 'text-amber-800 bg-amber-50' }
  if (status === 'duplicate') return { text: 'Duplicat', className: 'text-gray-600 bg-gray-100' }
  if (status === 'skipped') return { text: 'Omisă', className: 'text-gray-600 bg-gray-100' }
  return { text: 'Nepereche', className: 'text-[color:var(--color-muted-foreground)] bg-[color:var(--color-muted)]' }
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
      setError('Fișierul este gol.')
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
        setError(data.error || 'Nu am putut citi extrasul.')
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
      setError('Nu am putut citi extrasul. Verifică fișierul XML.')
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
      setError('Nicio linie de importat. Alege facturi sau importă ca nealocate.')
      return
    }
    if (ibanMismatch && !allowIbanMismatch) {
      setError('IBAN-ul extrasului nu coincide cu firma activă. Confirmă explicit mai jos.')
      return
    }
    const missingInvoice = payload.filter(l => l.action === 'import' && !l.invoiceId)
    if (missingInvoice.length) {
      setError('Ai linii „import” fără factură. Alege factura sau trece-le ca nealocate / omise.')
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
        setError(data.error || 'Importul a eșuat.')
        return
      }
      const bits = [
        data.imported ? `${data.imported} potrivite` : '',
        data.unallocated ? `${data.unallocated} nealocate` : '',
        data.duplicates ? `${data.duplicates} duplicate` : '',
        data.errors ? `${data.errors} erori` : ''
      ].filter(Boolean)
      setSummary(`Import finalizat: ${bits.join(', ') || 'nimic salvat'}.`)
      if (data.imported > 0 || data.unallocated > 0) onImported()
    } catch {
      setError('Importul a eșuat. Încearcă din nou.')
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
            <p className="kicker mb-2">Extras bancar</p>
            <h3 className="brand text-2xl">Importă Multicash XML 940</h3>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
              {companyName ? `${companyName} · ` : ''}Încasările se salvează în Facturo. Fișierul nu pleacă la ANAF.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]">
            Închide
          </button>
        </div>

        <label className="block mb-4">
          <span className="block text-sm mb-1 text-[color:var(--color-muted-foreground)]">Fișier extras (.xml)</span>
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
          <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">Citesc extrasul și propun potriviri…</p>
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
            <span>Confirm că import extrasul chiar dacă IBAN-ul nu coincide cu firma activă.</span>
          </label>
        )}

        {skippedDebits > 0 && lines.length > 0 && (
          <p className="text-xs text-[color:var(--color-muted-foreground)] mb-3">
            {skippedDebits} mișcări de debit (plăți ieșite / comisioane) sunt omise — importăm doar credite.
          </p>
        )}

        {lines.length === 0 && !busy && fileName && !error && (
          <div className="card p-8 text-center mb-4">
            <p className="text-[color:var(--color-muted-foreground)]">Nicio tranzacție de încasare în acest extras.</p>
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
                Confirmă {highConfidence.length} potriviri sigure
              </button>
              <p className="text-xs text-[color:var(--color-muted-foreground)] self-center">
                Poți schimba factura, omite linia sau o poți salva nealocată.
              </p>
            </div>

            <div className="overflow-x-auto border border-[color:var(--color-border)] rounded-xl mb-4">
              <table className="min-w-[860px] w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 text-[11px] uppercase tracking-wider text-[color:var(--color-muted-foreground)] text-left">
                    <th className="px-3 py-2 font-medium">Dată / sumă</th>
                    <th className="px-3 py-2 font-medium">Plătitor</th>
                    <th className="px-3 py-2 font-medium">Factură propusă</th>
                    <th className="px-3 py-2 font-medium">Motiv</th>
                    <th className="px-3 py-2 font-medium">Acțiune</th>
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
                            {badge.text}{line.status === 'matched' || line.status === 'suggested' ? ` · ${line.confidence}` : ''}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <p className="truncate max-w-[14rem]">{line.counterpartName || '—'}</p>
                          <p className="text-xs text-[color:var(--color-muted-foreground)] truncate max-w-[14rem]">
                            {line.counterpartIban || 'fără IBAN'}
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
                            <option value="">Fără factură</option>
                            {invoices
                              .filter(inv => inv.id === line.invoiceId || remaining(inv) + 0.009 >= line.amount)
                              .map(inv => (
                              <option key={inv.id} value={inv.id}>{invoiceLabel(inv)}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3 text-xs text-[color:var(--color-muted-foreground)]">
                          {line.skipReason || line.reasons[0] || 'Nicio potrivire automată'}
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
                            <option value="import">Importă pe factură</option>
                            <option value="unallocated">Nealocată</option>
                            <option value="skip">Omite</option>
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
                {busy === 'commit' ? 'Se importă...' : 'Importă liniile alese'}
              </button>
              <button type="button" onClick={onClose} className="btn btn-outline">
                Închide
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
