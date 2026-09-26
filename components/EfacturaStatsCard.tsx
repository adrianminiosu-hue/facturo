'use client'
import { useEffect, useState } from 'react'
import { loadEfacturaStats, syncEfactura, type EfacturaStatsResponse } from '@/lib/invoiceClient'
import { useLocale } from '@/components/LocaleProvider'
import { isMessageKey } from '@/lib/messages'

const PERIODS = [7, 30, 90]

function rateText(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value.toLocaleString('ro-RO', { maximumFractionDigits: 1 })}%`
}

function rateTone(value: number | null | undefined) {
  if (value === null || value === undefined) return 'text-[color:var(--color-muted-foreground)]'
  if (value >= 95) return 'text-green-700'
  if (value >= 85) return 'text-amber-700'
  return 'text-red-600'
}

function Row({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt className="text-[color:var(--color-muted-foreground)]">{label}</dt>
      <dd className={`font-medium tabular-nums ${tone || ''}`}>{value}</dd>
    </div>
  )
}

/** Measured e-Factura transfer rate (from efactura_log) + what is waiting right now. */
export default function EfacturaStatsCard({ companyId }: { companyId?: string | null }) {
  const { t } = useLocale()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<EfacturaStatsResponse | null>(null)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  const load = async (period = days) => {
    setError('')
    try {
      setData(await loadEfacturaStats(period, companyId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => { load(days) }, [days, companyId])

  const sync = async () => {
    setSyncing(true)
    setSyncMessage('')
    try {
      const result = await syncEfactura(true)
      setSyncMessage(result.skipped || t('efs.synced', { count: result.changed }))
      await load()
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : String(e))
    }
    setSyncing(false)
  }

  const label = (key: string) => (isMessageKey(key) ? t(key) : key)
  const stats = data?.stats

  return (
    <div className="card p-8 mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h3 className="font-bold text-[color:var(--color-foreground)]">{t('efs.title')}</h3>
          <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">{t('efs.subtitle', { days })}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[color:var(--color-border)] overflow-hidden text-xs">
            {PERIODS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setDays(p)}
                className={`px-2.5 py-1 ${p === days ? 'bg-[color:var(--color-foreground)] text-[color:var(--color-background)]' : ''}`}
              >
                {p}z
              </button>
            ))}
          </div>
          <button type="button" onClick={sync} disabled={syncing} className="btn btn-outline text-xs disabled:opacity-50">
            {syncing ? t('efs.syncing') : t('efs.syncNow')}
          </button>
        </div>
      </div>

      {syncMessage && <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">{syncMessage}</p>}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {data && !data.available && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">{data.reason}</p>
      )}

      {stats && (
        <>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-6">
            <div>
              <p className={`kpi ${rateTone(stats.transferRate)}`}>{rateText(stats.transferRate)}</p>
              <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">{t('efs.transfer')} · {t('efs.transferHint')}</p>
            </div>
            {data?.now && (data.now.queued > 0 || data.now.awaitingAnaf > 0) && (
              <div className="text-sm">
                {data.now.queued > 0 && <p className="text-amber-700">{t('efs.nowQueued')}: <b>{data.now.queued}</b></p>}
                {data.now.awaitingAnaf > 0 && <p className="text-[color:var(--color-muted-foreground)]">{t('efs.nowAwaiting')}: <b>{data.now.awaitingAnaf}</b></p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <h4 className="font-semibold">{t('efs.outTitle')}</h4>
                <span className={`font-semibold tabular-nums ${rateTone(stats.out.acceptanceRate)}`}>{rateText(stats.out.acceptanceRate)}</span>
              </div>
              <dl>
                <Row label={t('efs.accepted')} value={stats.out.accepted} tone="text-green-700" />
                <Row label={t('efs.rejected')} value={stats.out.rejected} tone={stats.out.rejected ? 'text-red-600' : ''} />
                <Row label={t('efs.pending')} value={stats.out.pending} />
                <Row label={t('efs.firstTry')} value={stats.out.acceptedFirstTry} />
                <Row label={t('efs.recovered')} value={stats.out.recoveredAfterOutage} />
                <Row label={t('efs.blocked')} value={stats.out.blockedBeforeSend} />
              </dl>
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <h4 className="font-semibold">{t('efs.inTitle')}</h4>
                <span className={`font-semibold tabular-nums ${rateTone(stats.in.importRate)}`}>{rateText(stats.in.importRate)}</span>
              </div>
              <dl>
                <Row label={t('efs.imported')} value={stats.in.imported} tone="text-green-700" />
                <Row label={t('efs.known')} value={stats.in.alreadyKnown} />
                <Row label={t('efs.failed')} value={stats.in.failed} tone={stats.in.failed ? 'text-red-600' : ''} />
              </dl>
              <dl className="mt-3 pt-3 border-t border-[color:var(--color-border)]">
                <Row label={t('efs.outages')} value={stats.outages} />
              </dl>
            </div>
          </div>

          {stats.topErrors.length > 0 && (
            <div className="mt-6">
              <h4 className="font-semibold text-sm mb-2">{t('efs.topErrors')}</h4>
              <ul className="text-sm space-y-1">
                {stats.topErrors.map(e => (
                  <li key={e.message} className="flex gap-3">
                    <span className="tabular-nums text-[color:var(--color-muted-foreground)] w-6 shrink-0 text-right">{e.count}×</span>
                    <span className="break-words">{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6">
            <h4 className="font-semibold text-sm mb-2">{t('efs.recent')}</h4>
            {!data?.recent?.length ? (
              <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('efs.empty')}</p>
            ) : (
              <ul className="text-xs divide-y divide-[color:var(--color-border)]">
                {data.recent.slice(0, 12).map((r, i) => (
                  <li key={`${r.created_at}-${i}`} className="py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="tabular-nums text-[color:var(--color-muted-foreground)]">
                      {new Date(r.created_at).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>{r.direction === 'out' ? '→' : '←'} {label(`efs.op.${r.operation}`)}</span>
                    <span className="font-medium">{r.invoice_ref || '—'}</span>
                    <span className={r.outcome === 'ok' ? 'text-green-700' : r.outcome === 'processing' || r.outcome === 'unavailable' || r.outcome === 'skipped' ? 'text-amber-700' : 'text-red-600'}>
                      {label(`efs.outcome.${r.outcome}`)}
                    </span>
                    {r.trigger === 'job' && <span className="text-[color:var(--color-muted-foreground)]">({t('efs.auto')})</span>}
                    {r.message && r.outcome !== 'ok' && <span className="w-full text-[color:var(--color-muted-foreground)] break-words">{r.message}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
