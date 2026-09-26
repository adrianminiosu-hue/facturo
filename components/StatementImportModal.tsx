'use client'
import { useEffect, useRef, useState } from 'react'
import type { CsvColumnRole, CsvImportMapping, ImportSummary } from '@/lib/bank/import/types'
import { useLocale } from '@/components/LocaleProvider'
import type { MessageKey } from '@/lib/messages'
import { authHeaders } from '@/lib/authHeaders'

const ROLES: CsvColumnRole[] = ['ignore', 'date', 'amount', 'debit', 'credit', 'name', 'iban', 'details', 'reference']

type CsvPreview = { headers: string[]; rows: string[][]; delimiter: ';' | ',' }

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
  const panel = useRef<HTMLDivElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [format, setFormat] = useState('')
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [mapping, setMapping] = useState<CsvImportMapping | null>(null)
  const [confirmIban, setConfirmIban] = useState('')
  const [allowIban, setAllowIban] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const send = async (nextFile: File, extra?: { csvMapping?: CsvImportMapping; confirmForeignIban?: boolean }) => {
    setBusy(true)
    setError('')
    const body = new FormData()
    body.set('file', nextFile)
    body.set('userId', userId)
    body.set('actorUserId', userId)
    body.set('companyId', companyId)
    if (extra?.csvMapping) body.set('csvMapping', JSON.stringify(extra.csvMapping))
    if (extra?.confirmForeignIban) body.set('confirmForeignIban', 'true')
    try {
      const res = await fetch('/api/bank/import', { method: 'POST', body, headers: await authHeaders() })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('imp.fail'))
        return
      }
      if (data.needsCsvMapping) {
        setFormat('csv')
        setPreview(data.preview || null)
        setMapping({
          delimiter: data.preview?.delimiter || ';',
          encoding: 'utf-8',
          header: true,
          columns: (data.preview?.headers || []).map(() => 'ignore' as CsvColumnRole)
        })
        return
      }
      if (data.needsIbanConfirm) {
        setConfirmIban(data.foreignIban || '')
        setFormat(data.format || '')
        return
      }
      setSummary(data as ImportSummary)
      setFormat(data.format || '')
      onImported()
    } catch {
      setError(t('imp.failRetry'))
    } finally {
      setBusy(false)
    }
  }

  const takeFile = (next?: File | null) => {
    if (!next) return
    setFile(next)
    setSummary(null)
    send(next)
  }

  const guessRole = (header: string): CsvColumnRole => {
    const h = header.toLowerCase()
    if (/dat[aă]|date|book/.test(h)) return 'date'
    if (/debit/.test(h)) return 'debit'
    if (/credit/.test(h)) return 'credit'
    if (/sum[aă]|amount|valoare/.test(h)) return 'amount'
    if (/iban/.test(h)) return 'iban'
    if (/nume|name|plăt|plat|benef/.test(h)) return 'name'
    if (/detal|desc|ref/.test(h)) return 'details'
    return 'ignore'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[2px] px-0 sm:px-4" onClick={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[420px] max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl outline-none bg-white shadow-[0_24px_64px_-28px_rgba(15,23,42,0.45)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 bg-gradient-to-br from-sky-50 via-white to-emerald-50 border-b border-sky-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="kicker mb-1 text-sky-700">{t('imp.kicker')}</p>
              <h3 className="text-lg font-semibold tracking-tight">{t('bank.import.title')}</h3>
              {companyName && (
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">{companyName}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-500 hover:text-slate-800 rounded-full px-2 py-1 hover:bg-white/80"
            >
              {t('common.close')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {['MT940', 'CAMT.053', 'CSV'].map(label => (
              <span key={label} className="text-xs font-medium tracking-wide px-1.5 py-0.5 rounded-full bg-white/80 text-sky-800 border border-sky-100">
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="p-4">
        {!summary && (
          <label
            className={`block rounded-xl border-2 border-dashed px-3 py-5 text-center cursor-pointer mb-3 transition-colors ${
              dragOver
                ? 'border-sky-400 bg-sky-50'
                : file
                  ? 'border-emerald-300 bg-emerald-50/70'
                  : 'border-sky-200 bg-sky-50/40 hover:border-sky-300 hover:bg-sky-50'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              takeFile(e.dataTransfer.files?.[0])
            }}
          >
            <input
              type="file"
              accept=".xml,.csv,.txt,text/xml,application/xml,text/csv"
              className="sr-only"
              disabled={busy}
              onChange={e => takeFile(e.target.files?.[0])}
            />
            <span className={`mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-xl ${file ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 16V4m0 0 4 4M12 4 8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <p className="text-sm font-medium text-slate-800">{file?.name || t('bank.import.drop')}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">{t('bank.import.formats')}</p>
          </label>
        )}

        {format && !summary && (
          <p className="text-xs text-[color:var(--color-muted-foreground)] mb-3">
            {t('bank.import.detected')}: {format.toUpperCase()}
          </p>
        )}

        {busy && <p className="text-sm text-[color:var(--color-muted-foreground)] mb-3">{t('imp.reading')}</p>}
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {confirmIban && !summary && (
          <div className="rounded-xl bg-amber-50 text-amber-900 text-sm p-3 mb-4">
            <p>{t('bank.import.foreignIban', { iban: confirmIban })}</p>
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={allowIban} onChange={e => setAllowIban(e.target.checked)} />
              {t('bank.import.confirmIban')}
            </label>
            <button
              type="button"
              className="btn btn-primary mt-3"
              disabled={!allowIban || !file || busy}
              onClick={() => file && send(file, { csvMapping: mapping || undefined, confirmForeignIban: true })}
            >
              {t('bank.import.continue')}
            </button>
          </div>
        )}

        {preview && mapping && !summary && (
          <div className="mb-4">
            <p className="text-sm font-medium mb-2">{t('bank.import.map')}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr>
                    {preview.headers.map((header, index) => (
                      <th key={`${header}-${index}`} className="p-1 text-left font-medium">
                        <div>{header}</div>
                        <select
                          className="input py-1 mt-1 text-xs"
                          value={mapping.columns[index] || 'ignore'}
                          onChange={e => {
                            const columns = [...mapping.columns]
                            columns[index] = e.target.value as CsvColumnRole
                            setMapping({ ...mapping, columns })
                          }}
                        >
                          {ROLES.map(role => (
                            <option key={role} value={role}>{t(`bank.csv.${role}` as MessageKey)}</option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c} className="p-1 border-t border-gray-50">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  if (!preview) return
                  setMapping({
                    ...mapping,
                    columns: preview.headers.map(guessRole)
                  })
                }}
              >
                {t('bank.import.guess')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!file || busy}
                onClick={() => file && mapping && send(file, { csvMapping: mapping, confirmForeignIban: allowIban })}
              >
                {t('bank.import.continue')}
              </button>
            </div>
          </div>
        )}

        {summary && (
          <div className="space-y-2 text-sm rounded-2xl bg-emerald-50/80 border border-emerald-100 p-4">
            <p>{t('bank.import.summary', {
              n: summary.newCount,
              a: summary.autoMatched,
              z: summary.toConfirm,
              w: summary.duplicates,
              v: summary.internalTransfers
            })}</p>
            <div className="flex gap-2 pt-2">
              <a href="/banca" className="btn btn-primary">{t('bank.import.seeInbox')}</a>
              <button type="button" className="btn btn-outline" onClick={onClose}>{t('common.close')}</button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
