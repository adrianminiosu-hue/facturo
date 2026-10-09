'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { useLocale } from '@/components/LocaleProvider'
import { formatRoDate } from '@/lib/dates'
import { formatRon } from '@/lib/money'
import { plannedTotal, type RecurringRow } from '@/lib/recurring'
import { generateNow, loadRecurringList, pauseSeries, resumeSeries, stopSeries, templateTotal } from '@/lib/recurringClient'

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  paused: 'bg-amber-50 text-amber-800',
  ended: 'bg-gray-100 text-gray-600'
}

export default function RecurringInvoicesPage() {
  const { t } = useLocale()
  const router = useRouter()
  const { userId, company, ownerUserId, loading: companyLoading } = useCompany()
  const [rows, setRows] = useState<RecurringRow[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = () => loadRecurringList({ companyId: company?.id, ownerUserId: ownerUserId || userId })
    .then(result => {
      setRows(result.rows)
      setMissing(result.missing)
      setError('')
    })
    .catch(e => setError(e instanceof Error ? e.message : String(e)))
    .finally(() => setLoading(false))

  useEffect(() => {
    if (companyLoading || !userId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, userId, companyLoading])

  const run = async (row: RecurringRow, action: 'generate' | 'pause' | 'resume' | 'stop') => {
    if (action === 'stop' && !confirm(t('recur.confirmStop', { client: row.clients?.company_name || '' }))) return
    if (action === 'generate' && !confirm(t('recur.confirmGenerate', { date: formatRoDate(row.next_run_date || '') }))) return
    setBusy(`${row.id}:${action}`)
    try {
      if (action === 'generate') {
        const result = await generateNow(row)
        if (result.outcome === 'created') { router.push(`/invoices/${result.invoiceId}`); return }
        if (result.outcome === 'paused') alert(t(`recur.pause.${result.reason}`) + (result.error ? ` (${result.error})` : ''))
      }
      if (action === 'pause') await pauseSeries(row)
      if (action === 'resume') await resumeSeries(row)
      if (action === 'stop') await stopSeries(row)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const active = rows.filter(r => r.status === 'active')
  const monthly = active.reduce((sum, r) => {
    const perYear = r.frequency === 'monthly' ? 12 : r.frequency === 'quarterly' ? 4 : 1
    return sum + templateTotal(r.template) * perYear / 12
  }, 0)

  return (
    <div className="app-shell">
      <AppNav active="recurring" />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="page-toolbar">
          <div>
            <h2 className="page-title text-[color:var(--color-foreground)]">{t('recur.title')}</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              {t('recur.count', { count: active.length })}
              {active.length ? ` · ${t('recur.monthlyValue', { amount: formatRon(monthly) })}` : ''}
            </p>
          </div>
          <Link href="/invoices/new" className="btn btn-primary">{t('inv.new')}</Link>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        {missing && (
          <div className="card p-6 mb-6 text-sm text-amber-800">{t('recur.migrationMissing')}</div>
        )}

        {loading ? (
          <p className="text-[color:var(--color-muted-foreground)]">{t('common.loading')}</p>
        ) : !rows.length && !missing ? (
          <div className="card p-8 text-center">
            <p className="font-medium">{t('recur.emptyTitle')}</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-2 max-w-xl mx-auto">{t('recur.emptyLead')}</p>
          </div>
        ) : (
          <div className="card divide-y divide-[color:var(--color-border)]">
            {rows.map(row => {
              const planned = plannedTotal(row)
              const amount = templateTotal(row.template)
              const isBusy = busy.startsWith(`${row.id}:`)
              return (
                <div key={row.id} id={row.id} className="p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{row.clients?.company_name || t('recur.clientMissing')}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${STATUS_STYLE[row.status] || ''}`}>{t(`recur.status.${row.status}`)}</span>
                    </div>
                    <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
                      {t(`recur.freq.${row.frequency}`)}
                      {' · '}
                      {row.status === 'active' && row.next_run_date
                        ? t('recur.nextOn', { date: formatRoDate(row.next_run_date) })
                        : row.status === 'paused' && row.pause_reason
                          ? t(`recur.pause.${row.pause_reason}`)
                          : t('recur.noNext')}
                      {' · '}
                      {planned ? t('recur.progress', { done: row.generated_count, total: planned }) : t('recur.progressOpen', { done: row.generated_count })}
                    </p>
                    {row.last_error && <p className="text-xs text-red-600 mt-1">{row.last_error}</p>}
                  </div>
                  <div className="text-right md:w-40">
                    <p className="font-semibold">{formatRon(amount)}</p>
                    {row.template?.fx_eur && <p className="text-xs text-[color:var(--color-muted-foreground)]">{t('recur.eurNote')}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end md:w-[22rem]">
                    {row.status === 'active' && (
                      <button className="btn btn-outline" disabled={isBusy} onClick={() => run(row, 'generate')}>{t('recur.generateNow')}</button>
                    )}
                    {row.status === 'active' && (
                      <button className="btn btn-outline" disabled={isBusy} onClick={() => run(row, 'pause')}>{t('recur.pauseAction')}</button>
                    )}
                    {row.status === 'paused' && (
                      <button className="btn btn-outline" disabled={isBusy} onClick={() => run(row, 'resume')}>{t('recur.resume')}</button>
                    )}
                    {row.status !== 'ended' && (
                      <Link href={`/invoices/recurente/${row.id}`} className="btn btn-outline">{t('common.edit')}</Link>
                    )}
                    {row.status !== 'ended' && (
                      <button className="btn btn-outline text-red-700" disabled={isBusy} onClick={() => run(row, 'stop')}>{t('recur.stop')}</button>
                    )}
                    {row.source_invoice_id && (
                      <Link href={`/invoices/${row.source_invoice_id}`} className="btn btn-outline">{t('recur.firstInvoice')}</Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
