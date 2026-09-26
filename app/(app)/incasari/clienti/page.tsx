'use client'
import Money from '@/components/Money'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import ReceivablesTabs from '@/components/ReceivablesTabs'
import PaymentBehaviourBadge from '@/components/PaymentBehaviourBadge'
import { useLocale } from '@/components/LocaleProvider'
import { useCompany } from '@/components/CompanyProvider'
import { calendarDateInBucharest, formatRoDate } from '@/lib/dates'
import { formatRon } from '@/lib/money'
import { loadCollectionData, type CollectionData } from '@/lib/collectionsData'
import {
  portfolioAverageDelay,
  settledHistory,
  sortSummaries,
  summarizeClient,
  type ClientCollectionSummary
} from '@/lib/clientCollections'

type Filter = 'all' | 'overdue' | 'risk' | 'promised'

export default function ClientCollectionsPage() {
  const { t, locale } = useLocale()
  const fmtDays = (n: number) => n.toLocaleString(locale === 'en' ? 'en-GB' : 'ro-RO', { maximumFractionDigits: 1 })
  const router = useRouter()
  const { userId, company, ownerUserId, loading: companyLoading } = useCompany()
  const [data, setData] = useState<CollectionData | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const today = calendarDateInBucharest(0)

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId) return
      const { data: { user } } = await getCurrentUser()
      if (!user) { router.push('/login'); return }
      try {
        setData(await loadCollectionData(supabase, { companyId: company?.id, ownerUserId: ownerUserId || userId }))
      } catch (e) {
        setError((e as { message?: string })?.message || String(e))
      }
    }
    init()
  }, [userId, company?.id, companyLoading])

  const summaries = useMemo(() => {
    if (!data) return [] as ClientCollectionSummary[]
    const byClient = new Map<string, typeof data.invoices>()
    for (const inv of data.invoices) byClient.set(inv.client_id, [...(byClient.get(inv.client_id) || []), inv])
    return sortSummaries(
      Array.from(byClient.entries())
        .map(([id, list]) => summarizeClient(id, list, today))
        .filter(s => s.openCount > 0)
    )
  }, [data, today])

  const totals = useMemo(() => {
    const open = summaries.reduce((s, c) => s + c.openAmount, 0)
    const overdue = summaries.reduce((s, c) => s + c.overdueAmount, 0)
    const week = summaries.reduce((s, c) => s + c.expectedThisWeek, 0)
    const invoices = summaries.reduce((s, c) => s + c.openCount, 0)
    const lateClients = summaries.filter(c => c.overdueAmount > 0).length
    const avg = data ? portfolioAverageDelay(data.invoices, today) : null
    const sample = data ? settledHistory(data.invoices, today).length : 0
    return { open, overdue, week, invoices, lateClients, avg, sample }
  }, [summaries, data, today])

  // ANAF inactive / struck-off clients count as risk whatever their payment history.
  const isRisk = (s: (typeof summaries)[number]) => s.behaviour === 'risk' || !!data?.clients[s.clientId]?.anaf_flag

  const counts = {
    all: summaries.length,
    overdue: summaries.filter(s => s.overdueAmount > 0).length,
    risk: summaries.filter(s => isRisk(s)).length,
    promised: summaries.filter(s => s.behaviour === 'promised').length
  }

  const q = search.trim().toLowerCase()
  const visible = summaries.filter(s => {
    if (filter === 'overdue' && s.overdueAmount <= 0) return false
    if (filter === 'risk' && !isRisk(s)) return false
    if (filter === 'promised' && s.behaviour !== 'promised') return false
    if (!q) return true
    const c = data?.clients[s.clientId]
    return (c?.company_name || '').toLowerCase().includes(q) || (c?.cui || '').includes(q)
  })

  const nextStep = (s: ClientCollectionSummary) => {
    if (s.behaviour === 'promised' && s.nextPromise) return t('cc.nextPromise', { date: formatRoDate(s.nextPromise) })
    if (s.oldestOverdueDays > 0) return t('cc.nextOverdue', { count: s.oldestOverdueDays })
    if (s.nextDue) return t('cc.nextDue', { date: formatRoDate(s.nextDue) })
    return '—'
  }

  const trendLabel = (s: ClientCollectionSummary) =>
    s.trend === 'worse' ? t('cc.trendWorse') : s.trend === 'better' ? t('cc.trendBetter') : s.trend === 'stable' ? t('cc.trendStable') : ''

  const chip = (id: Filter, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setFilter(id)}
      aria-pressed={filter === id}
      className={`text-xs px-3 py-1.5 rounded-full border transition ${filter === id
        ? 'bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] border-transparent'
        : 'border-[color:var(--color-border)] text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]'}`}
    >
      {label} ({counts[id]})
    </button>
  )

  return (
    <div className="app-shell">
      <AppNav active="receivables" />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="page-toolbar">
          <div>
            <p className="kicker mb-2">{t('rec.portfolio')}</p>
            <h2 className="page-title text-[color:var(--color-foreground)]">{t('cc.title')}</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">{t('cc.lead')}</p>
          </div>
        </div>
        <ReceivablesTabs active="clients" />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card p-5">
            <p className="kicker mb-2">{t('cc.kpiOpen')}</p>
            <p className="kpi"><Money value={totals.open} size="lg" /></p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">{t('cc.kpiOpenSub', { invoices: totals.invoices, clients: summaries.length })}</p>
          </div>
          <div className={`card p-5 ${totals.overdue > 0 ? 'bg-amber-50' : ''}`}>
            <p className="kicker mb-2">{t('cc.kpiOverdue')}</p>
            <p className={`kpi ${totals.overdue > 0 ? 'text-amber-800' : ''}`}><Money value={totals.overdue} size="lg" /></p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">{t('cc.kpiOverdueSub', { count: totals.lateClients })}</p>
          </div>
          <div className="card p-5">
            <p className="kicker mb-2">{t('cc.kpiWeek')}</p>
            <p className="kpi text-green-800"><Money value={totals.week} size="lg" /></p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">{t('cc.kpiWeekSub')}</p>
          </div>
          <div className="card p-5">
            <p className="kicker mb-2">{t('cc.kpiDelay')}</p>
            <p className="kpi">{totals.avg === null ? '—' : t('cc.days', { count: fmtDays(totals.avg) })}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
              {totals.avg === null ? t('cc.noData') : t('cc.kpiDelaySub', { count: totals.sample })}
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex flex-wrap gap-2">
            {chip('all', t('cc.filterAll'))}
            {chip('overdue', t('cc.filterOverdue'))}
            {chip('risk', t('cc.filterRisk'))}
            {chip('promised', t('cc.filterPromised'))}
          </div>
          <label className="md:w-72">
            <span className="sr-only">{t('cc.search')}</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('cc.search')} className="input py-2.5 w-full" />
          </label>
        </div>

        {error ? (
          <div className="card p-8 text-center text-red-700">{error}</div>
        ) : !data ? (
          <p className="text-[color:var(--color-muted-foreground)] text-center py-12">{t('common.loading')}</p>
        ) : visible.length === 0 ? (
          <div className="card p-12 text-center text-[color:var(--color-muted-foreground)]">{t('cc.empty')}</div>
        ) : (
          <div className="card overflow-hidden">
            <div className="hidden lg:grid grid-cols-[minmax(12rem,1.6fr)_8.5rem_9rem_8rem_9.5rem_minmax(10rem,1.3fr)_6rem] gap-3 px-5 py-2.5 text-xs uppercase tracking-wider text-[color:var(--color-muted-foreground)] border-b border-gray-100">
              <span>{t('cc.colClient')}</span>
              <span className="text-right">{t('cc.colOpen')}</span>
              <span className="text-right">{t('cc.colOverdue')}</span>
              <span className="text-right">{t('cc.colDelay')}</span>
              <span>{t('cc.colBehaviour')}</span>
              <span>{t('cc.colNext')}</span>
              <span />
            </div>
            {visible.map(s => {
              const c = data.clients[s.clientId]
              return (
                <div key={s.clientId} className="grid grid-cols-2 lg:grid-cols-[minmax(12rem,1.6fr)_8.5rem_9rem_8rem_9.5rem_minmax(10rem,1.3fr)_6rem] gap-x-3 gap-y-2 px-5 py-4 items-center border-b border-gray-50 last:border-b-0">
                  <div className="col-span-2 lg:col-span-1 min-w-0 flex items-center justify-between lg:block">
                    <div className="min-w-0">
                      <Link href={`/incasari/clienti/${s.clientId}`} className="block font-semibold truncate hover:underline">{c?.company_name || '—'}</Link>
                      {c?.anaf_flag && (
                        <span className="inline-block text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 mr-2">
                          {c.anaf_flag === 'deregistered' ? t('cc.anafDeregisteredShort') : t('cc.anafInactive')}
                        </span>
                      )}
                      <span className="text-xs text-[color:var(--color-muted-foreground)]">{t(s.openCount === 1 ? 'cc.openInvoicesOne' : 'cc.openInvoices', { count: s.openCount })}</span>
                    </div>
                    <span className="lg:hidden"><PaymentBehaviourBadge behaviour={s.behaviour} promise={s.nextPromise} /></span>
                  </div>
                  <div className="lg:text-right">
                    <span className="lg:hidden block text-xs text-[color:var(--color-muted-foreground)]">{t('cc.colOpen')}</span>
                    <span className="font-semibold"><Money value={s.openAmount} /></span>
                  </div>
                  <div className="text-right">
                    <span className="lg:hidden block text-xs text-[color:var(--color-muted-foreground)]">{t('cc.colOverdue')}</span>
                    {s.overdueAmount > 0 ? (
                      <>
                        <span className={`block font-semibold ${s.behaviour === 'risk' ? 'text-red-700' : 'text-amber-800'}`}>{formatRon(s.overdueAmount)}</span>
                        <span className={`text-xs ${s.behaviour === 'risk' ? 'text-red-700' : 'text-amber-800'}`}>{t('cc.overdueFor', { count: s.oldestOverdueDays })}</span>
                      </>
                    ) : <span className="text-[color:var(--color-muted-foreground)]">—</span>}
                  </div>
                  <div className="hidden lg:block text-right">
                    <span className="block font-medium">{s.averageDelay === null ? '—' : t('cc.days', { count: fmtDays(s.averageDelay) })}</span>
                    <span className={`text-xs ${s.trend === 'worse' ? 'text-amber-800' : s.trend === 'better' ? 'text-green-800' : 'text-[color:var(--color-muted-foreground)]'}`}>
                      {s.averageDelay === null ? t('cc.noData') : trendLabel(s)}
                    </span>
                  </div>
                  <div className="hidden lg:block"><PaymentBehaviourBadge behaviour={s.behaviour} promise={s.nextPromise} /></div>
                  <div className="col-span-2 lg:col-span-1 text-sm text-[color:var(--color-foreground)]">
                    {nextStep(s)}
                    {s.lastReminder && (
                      <span className="block text-xs text-[color:var(--color-muted-foreground)]">{t('cc.lastReminder', { date: formatRoDate(s.lastReminder) })}</span>
                    )}
                  </div>
                  <div className="col-span-2 lg:col-span-1 lg:text-right">
                    <Link href={`/incasari/clienti/${s.clientId}`} className="btn btn-outline text-xs px-3 py-2 w-full lg:w-auto text-center">{t('cc.open')}</Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="text-xs text-[color:var(--color-muted-foreground)] mt-4">{t('cc.footnote')}</p>
      </div>
    </div>
  )
}
