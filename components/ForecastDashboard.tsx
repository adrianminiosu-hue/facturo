'use client'
import Chevron from '@/components/Chevron'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { useLocale } from '@/components/LocaleProvider'
import { getCurrentUser, supabase } from '@/lib/supabase'
import { calendarDateInBucharest, formatRoDate } from '@/lib/dates'
import { formatAmount, formatRon, parseAmount } from '@/lib/money'
import { roundMoney } from '@/lib/invoiceMath'
import { isPurchaseInvoice } from '@/lib/invoiceStatus'
import { loadCollectionData } from '@/lib/collectionsData'
import { expectedPayDate, summarizeClient, type ClientCollectionSummary } from '@/lib/clientCollections'
import { buildForecast, FORECAST_WEEKS, type ForecastInflow, type ForecastOutflow, type ForecastWeek } from '@/lib/forecast'
import Money from '@/components/Money'

type PurchaseRow = {
  id: string
  series?: string | null
  invoice_number?: string | null
  issue_date?: string | null
  due_date?: string | null
  total?: number | null
  amount_paid?: number | null
  payment_status?: string | null
  direction?: string | null
  notes?: string | null
  clients?: { company_name?: string | null } | null
  seller_snapshot?: { company_name?: string | null } | null
}

type Balance = { amount: number; at: string | null; source: 'bank' | 'manual' | 'none' }

const storageKey = (companyId?: string | null) => `facturo_forecast_opening_${companyId || 'default'}`

function readManualBalance(companyId?: string | null): number | null {
  try {
    const raw = localStorage.getItem(storageKey(companyId))
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function writeManualBalance(companyId: string | null | undefined, value: number | null) {
  try {
    if (value === null) localStorage.removeItem(storageKey(companyId))
    else localStorage.setItem(storageKey(companyId), String(value))
  } catch {
    // Storage unavailable (private mode): the value lives only for this visit.
  }
}

function shortRange(week: ForecastWeek) {
  return `${formatRoDate(week.start).slice(0, 5)}–${formatRoDate(week.end).slice(0, 5)}`
}

export default function ForecastDashboard() {
  const { t } = useLocale()
  const router = useRouter()
  const { userId, company, ownerUserId, loading: companyLoading } = useCompany()
  const today = calendarDateInBucharest(0)
  const [inflows, setInflows] = useState<ForecastInflow[]>([])
  const [outflows, setOutflows] = useState<ForecastOutflow[]>([])
  const [bank, setBank] = useState<Balance>({ amount: 0, at: null, source: 'none' })
  const [manual, setManual] = useState<number | null>(null)
  const [balanceText, setBalanceText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  const [hoverWeek, setHoverWeek] = useState<number | null>(null)

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId) return
      const { data: { user } } = await getCurrentUser()
      if (!user) { router.push('/login'); return }
      await load()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyLoading, userId, company?.id])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const scope = { companyId: company?.id, ownerUserId: ownerUserId || userId }

      // Receivables: due date + the client's usual delay (or the promised date).
      const collection = await loadCollectionData(supabase, scope)
      const byClient = new Map<string, typeof collection.invoices>()
      for (const inv of collection.invoices) {
        const list = byClient.get(inv.client_id) || []
        list.push(inv)
        byClient.set(inv.client_id, list)
      }
      const summaries = new Map<string, ClientCollectionSummary>()
      for (const [clientId, list] of byClient) summaries.set(clientId, summarizeClient(clientId, list, today))
      const nextIn: ForecastInflow[] = collection.invoices
        .filter(inv => inv.rest > 0.009)
        .map(inv => {
          const summary = summaries.get(inv.client_id)
          const promised = !!inv.promised_pay_date && inv.promised_pay_date >= today
          return {
            id: inv.id,
            ref: `${inv.series}${inv.invoice_number}`,
            partyName: collection.clients[inv.client_id]?.company_name || '—',
            amount: inv.rest,
            expectedOn: expectedPayDate(inv, summary?.averageDelay ?? null, today),
            dueDate: inv.due_date,
            confidence: promised ? 'promised' : summary?.behaviour === 'risk' ? 'risk' : 'expected'
          }
        })

      // Payables: supplier invoices not fully paid, on their due date.
      let purchaseQuery = supabase.from('invoices').select('*, clients(company_name)')
      purchaseQuery = company?.id ? purchaseQuery.eq('company_id', company.id) : purchaseQuery.eq('user_id', ownerUserId || userId)
      const { data: purchaseRows } = await purchaseQuery
      const nextOut: ForecastOutflow[] = ((purchaseRows || []) as PurchaseRow[])
        .filter(row => isPurchaseInvoice(row) && row.payment_status !== 'paid')
        .map(row => ({
          id: row.id,
          ref: `${row.series || ''}${row.invoice_number || ''}`,
          partyName: row.clients?.company_name || row.seller_snapshot?.company_name || '—',
          amount: roundMoney(Number(row.total || 0) - Number(row.amount_paid || 0)),
          dueDate: row.due_date || row.issue_date || today
        }))
        .filter(row => row.amount > 0.009)

      // Opening balance: RON bank accounts with a known balance (from statement imports).
      let accountQuery = supabase.from('bank_accounts').select('balance, balance_at, currency, is_active')
      accountQuery = company?.id ? accountQuery.eq('company_id', company.id) : accountQuery.eq('user_id', ownerUserId || userId)
      const { data: accounts } = await accountQuery
      const known = ((accounts || []) as Array<{ balance: number | null; balance_at: string | null; currency: string; is_active: boolean }>)
        .filter(a => a.is_active !== false && a.currency === 'RON' && a.balance !== null)
      const bankBalance: Balance = known.length
        ? {
            amount: roundMoney(known.reduce((s, a) => s + Number(a.balance), 0)),
            at: known.map(a => a.balance_at).filter((d): d is string => !!d).sort().pop() || null,
            source: 'bank'
          }
        : { amount: 0, at: null, source: 'none' }

      const saved = readManualBalance(company?.id)
      setInflows(nextIn)
      setOutflows(nextOut)
      setBank(bankBalance)
      setManual(saved)
      setBalanceText(formatAmount(saved ?? bankBalance.amount))
    } catch (e) {
      setError((e as { message?: string })?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const opening = manual ?? bank.amount
  const forecast = useMemo(
    () => buildForecast({ today, openingBalance: opening, inflows, outflows }),
    [today, opening, inflows, outflows]
  )

  const commitBalance = () => {
    const value = parseAmount(balanceText)
    if (Number.isNaN(value)) { setBalanceText(formatAmount(opening)); return }
    const rounded = roundMoney(value)
    setManual(rounded)
    writeManualBalance(company?.id, rounded)
    setBalanceText(formatAmount(rounded))
  }

  const resetBalance = () => {
    setManual(null)
    writeManualBalance(company?.id, null)
    setBalanceText(formatAmount(bank.amount))
  }

  // Zero line placed in proportion to the positive and negative extremes, so no half of the chart sits empty.
  const posMax = Math.max(0, ...forecast.weeks.map(w => w.closing))
  const negMax = Math.max(0, ...forecast.weeks.map(w => -w.closing))
  const hasNegative = negMax > 0
  const chartHeight = 180
  const plot = chartHeight - 12
  const span = Math.max(1, posMax + negMax)
  const zeroY = 6 + (posMax / span) * plot
  const hovered = hoverWeek !== null ? forecast.weeks[hoverWeek] : null

  return (
    <div className="app-shell">
      <AppNav active="dashboard-3" />
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-8">
        <div className="mb-6">
          <h2 className="page-title text-[color:var(--color-foreground)]">{t('fc.title')}</h2>
          <p className="text-[color:var(--color-muted-foreground)] mt-2">{t('fc.lead', { weeks: FORECAST_WEEKS })}</p>
        </div>

        {error ? (
          <div className="card p-8 text-center text-red-700">{error}</div>
        ) : loading ? (
          <p className="text-[color:var(--color-muted-foreground)] text-center py-12">{t('common.loading')}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="card p-5">
                <p className="kicker mb-2">{t('fc.kpiOpening')}</p>
                <div className="flex items-center gap-2">
                  <input
                    className="input text-lg font-semibold py-1.5"
                    inputMode="decimal"
                    value={balanceText}
                    aria-label={t('fc.kpiOpening')}
                    onChange={e => setBalanceText(e.target.value)}
                    onBlur={commitBalance}
                    onKeyDown={e => { if (e.key === 'Enter') commitBalance() }}
                  />
                  <span className="text-sm text-[color:var(--color-muted-foreground)]">RON</span>
                </div>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
                  {manual !== null
                    ? <>{t('fc.openingManual')} {bank.source === 'bank' && <button type="button" className="underline" onClick={resetBalance}>{t('fc.openingUseBank')}</button>}</>
                    : bank.source === 'bank'
                      ? t('fc.openingBank', { date: bank.at ? formatRoDate(bank.at.slice(0, 10)) : '—' })
                      : t('fc.openingNone')}
                </p>
              </div>
              <div className="card p-5">
                <p className="kicker mb-2">{t('fc.kpiIn')}</p>
                <p className="kpi text-green-800"><Money value={forecast.totalIn} size="lg" /></p>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
                  {forecast.totalRiskIn > 0 ? t('fc.kpiInRisk', { amount: formatRon(forecast.totalRiskIn) }) : t('fc.kpiInSub')}
                </p>
              </div>
              <div className="card p-5">
                <p className="kicker mb-2">{t('fc.kpiOut')}</p>
                <p className="kpi"><Money value={forecast.totalOut} size="lg" /></p>
                <p className={`text-xs mt-1 ${forecast.overdueOut > 0 ? 'text-amber-800 font-medium' : 'text-[color:var(--color-muted-foreground)]'}`}>
                  {forecast.overdueOut > 0 ? t('fc.kpiOutOverdue', { amount: formatRon(forecast.overdueOut) }) : t('fc.kpiOutSub')}
                </p>
              </div>
              <div className={`card p-5 ${forecast.firstNegative ? 'bg-red-50' : ''}`}>
                <p className="kicker mb-2">{t('fc.kpiLowest')}</p>
                <p className={`kpi ${forecast.lowest && forecast.lowest.closing < 0 ? 'text-red-800' : ''}`}>
                  {forecast.lowest ? <Money value={forecast.lowest.closing} size="lg" /> : '—'}
                </p>
                <p className={`text-xs mt-1 ${forecast.firstNegative ? 'text-red-800 font-medium' : 'text-[color:var(--color-muted-foreground)]'}`}>
                  {forecast.firstNegative
                    ? t('fc.kpiNegative', { week: shortRange(forecast.firstNegative) })
                    : forecast.lowest ? t('fc.kpiLowestWeek', { week: shortRange(forecast.lowest.week) }) : ''}
                </p>
              </div>
            </div>

            <section className="card p-5 mb-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
                <h3 className="font-semibold">{t('fc.chartTitle')}</h3>
                <span className="text-xs text-[color:var(--color-muted-foreground)]">{t('fc.chartSub')}</span>
              </div>
              <div className="relative" onMouseLeave={() => setHoverWeek(null)}>
                <div className="relative flex items-stretch gap-1.5" style={{ height: chartHeight }} role="img" aria-label={t('fc.chartTitle')}>
                  <div className="absolute left-0 right-0 border-t border-gray-300" style={{ top: zeroY }} aria-hidden="true" />
                  {forecast.weeks.map(week => {
                    const h = Math.max(3, (Math.abs(week.closing) / span) * plot)
                    const negative = week.closing < 0
                    return (
                      <button
                        key={week.index}
                        type="button"
                        className="relative flex-1 h-full"
                        onMouseEnter={() => setHoverWeek(week.index)}
                        onFocus={() => setHoverWeek(week.index)}
                        onClick={() => setOpenWeek(openWeek === week.index ? null : week.index)}
                        aria-label={`${shortRange(week)}: ${formatRon(week.closing)}`}
                      >
                        <span
                          className={`absolute left-0 right-0 ${negative ? 'bg-red-500 rounded-b' : 'bg-blue-500 rounded-t'} ${hoverWeek === week.index ? 'opacity-100' : 'opacity-85'}`}
                          style={negative ? { top: zeroY, height: h } : { top: zeroY - h, height: h }}
                        />
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-1.5 mt-2">
                  {forecast.weeks.map(week => (
                    <span key={week.index} className="flex-1 text-center text-xs text-[color:var(--color-muted-foreground)] truncate">
                      {week.index % 2 === 0 ? formatRoDate(week.start).slice(0, 5) : ''}
                    </span>
                  ))}
                </div>
                {hovered && (
                  <div
                    className="absolute top-0 z-10 card px-3 py-2 text-xs shadow-lg pointer-events-none"
                    style={{ left: `${Math.min(75, (hovered.index / FORECAST_WEEKS) * 100)}%` }}
                  >
                    <p className="font-semibold mb-1">{shortRange(hovered)}</p>
                    <p>{t('fc.colIn')}: {formatRon(hovered.inflow)}</p>
                    <p>{t('fc.colOut')}: {formatRon(hovered.outflow)}</p>
                    <p className="font-semibold mt-1">{t('fc.colClosing')}: {formatRon(hovered.closing)}</p>
                  </div>
                )}
              </div>
              {hasNegative && (
                <p className="text-xs text-red-800 mt-3">▼ {t('fc.chartNegative')}</p>
              )}
            </section>

            <section className="card overflow-hidden mb-6">
              <div className="grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] gap-3 px-5 py-3 text-xs font-medium text-[color:var(--color-muted-foreground)] border-b border-gray-100">
                <span>{t('fc.colWeek')}</span>
                <span className="text-right">{t('fc.colIn')}</span>
                <span className="text-right">{t('fc.colOut')}</span>
                <span className="text-right">{t('fc.colNet')}</span>
                <span className="text-right">{t('fc.colClosing')}</span>
              </div>
              {forecast.weeks.map(week => {
                const expanded = openWeek === week.index
                const items = week.inflows.length + week.outflows.length
                return (
                  <div key={week.index} className="border-b border-gray-50 last:border-0">
                    <button
                      type="button"
                      className="w-full grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] gap-3 px-5 py-3 text-sm text-left hover:bg-gray-50 disabled:hover:bg-transparent"
                      onClick={() => setOpenWeek(expanded ? null : week.index)}
                      disabled={!items}
                      aria-expanded={expanded}
                    >
                      <span className="font-medium">
                        {items ? <Chevron right={!expanded} className="inline mr-1 -mt-0.5" /> : <span className="inline-block w-4" />}{shortRange(week)}
                        {week.index === 0 && <span className="text-xs text-[color:var(--color-muted-foreground)]"> · {t('fc.thisWeek')}</span>}
                      </span>
                      <span className="text-right tabular-nums text-green-800">
                        {week.inflow ? formatAmount(week.inflow) : '—'}
                        {week.riskInflow > 0 && <span className="block text-xs text-amber-800">+{formatAmount(week.riskInflow)} {t('fc.risk')}</span>}
                      </span>
                      <span className="text-right tabular-nums">{week.outflow ? formatAmount(week.outflow) : '—'}</span>
                      <span className={`text-right tabular-nums ${week.net < 0 ? 'text-red-800' : ''}`}>{formatAmount(week.net)}</span>
                      <span className={`text-right tabular-nums font-semibold ${week.closing < 0 ? 'text-red-800' : ''}`}>{formatAmount(week.closing)}</span>
                    </button>
                    {expanded && (
                      <div className="px-5 pb-4 grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] mb-2">{t('fc.fromClients')}</p>
                          {week.inflows.length === 0 ? <p className="text-xs text-[color:var(--color-muted-foreground)]">—</p> : week.inflows.map(item => (
                            <div key={item.id} className="flex justify-between gap-3 py-1">
                              <Link href={`/invoices/${item.id}`} className="hover:underline truncate">
                                {item.ref} · {item.partyName}
                                <span className="block text-xs text-[color:var(--color-muted-foreground)]">
                                  {item.confidence === 'promised'
                                    ? t('fc.promised', { date: formatRoDate(item.expectedOn) })
                                    : t('fc.expected', { date: formatRoDate(item.expectedOn), due: formatRoDate(item.dueDate) })}
                                  {item.confidence === 'risk' ? ` · ${t('fc.riskNotCounted')}` : ''}
                                </span>
                              </Link>
                              <span className={`tabular-nums whitespace-nowrap ${item.confidence === 'risk' ? 'text-amber-800' : ''}`}>{formatAmount(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] mb-2">{t('fc.toSuppliers')}</p>
                          {week.outflows.length === 0 ? <p className="text-xs text-[color:var(--color-muted-foreground)]">—</p> : week.outflows.map(item => (
                            <div key={item.id} className="flex justify-between gap-3 py-1">
                              <Link href={`/facturi-achizitie/${item.id}`} className="hover:underline truncate">
                                {item.ref} · {item.partyName}
                                <span className="block text-xs text-[color:var(--color-muted-foreground)]">
                                  {item.dueDate < today ? t('fc.overdueSince', { date: formatRoDate(item.dueDate) }) : t('fc.dueOn', { date: formatRoDate(item.dueDate) })}
                                </span>
                              </Link>
                              <span className="tabular-nums whitespace-nowrap">{formatAmount(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>

            <p className="text-xs text-[color:var(--color-muted-foreground)]">
              {t('fc.method')}
              {(forecast.laterIn > 0 || forecast.laterOut > 0) && ` ${t('fc.later', { inAmount: formatRon(forecast.laterIn), outAmount: formatRon(forecast.laterOut) })}`}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
