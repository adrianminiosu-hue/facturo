'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import DailyInvoicedChart, { type DailyAmount } from '@/components/DailyInvoicedChart'
import Money from '@/components/Money'
import { useCompany } from '@/components/CompanyProvider'
import { useLocale } from '@/components/LocaleProvider'
import { getCurrentUser, supabase } from '@/lib/supabase'
import { addDaysIso, calendarDateInBucharest, formatRoDate } from '@/lib/dates'
import { isCreditNote, isPurchaseInvoice } from '@/lib/invoiceStatus'
import { formatDecimal } from '@/lib/money'
import { countWord } from '@/lib/i18n'
import { isMessageKey } from '@/lib/messages'

type InvoiceRow = {
  id: string
  client_id?: string | null
  series?: string | null
  invoice_number?: string | null
  issue_date: string
  due_date?: string | null
  total: number
  tva_amount?: number | null
  amount_paid?: number | null
  payment_status?: string | null
  status: string
  invoice_type_code?: string | null
  notes?: string | null
  direction?: string | null
  clients?: { company_name?: string | null } | null
}

type PaymentRow = { paid_on: string | null; amount: number | null; invoice_id?: string | null }

type Supplier = { id: string; name: string; amount: number; count: number }

const PERIODS = [10, 20, 30] as const
type Period = (typeof PERIODS)[number]
const PERIOD_KEY = 'veyro_purchases_period'

function daySeries(length: number): DailyAmount[] {
  return Array.from({ length }, (_, i) => ({ date: calendarDateInBucharest(i - (length - 1)), invoiced: 0, collected: 0 }))
}

/** What is still to pay on a supplier invoice (credit notes and paid invoices owe nothing). */
function restOf(inv: InvoiceRow) {
  if (isCreditNote(inv.invoice_type_code) || Number(inv.total) <= 0) return 0
  if (inv.payment_status === 'paid' || inv.status === 'paid') return 0
  return Math.max(0, (Number(inv.total) || 0) - (Number(inv.amount_paid) || 0))
}

function inRange(date: string | null | undefined, from: string, to: string) {
  return !!date && date >= from && date <= to
}

export default function PurchasesDashboard() {
  const router = useRouter()
  const { t, locale } = useLocale()
  const { company, ownerUserId, userId, accessibleOwnerIds, loading: companyLoading } = useCompany()
  const [loading, setLoading] = useState(true)
  const [purchases, setPurchases] = useState<InvoiceRow[]>([])
  const [sales, setSales] = useState<InvoiceRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [period, setPeriod] = useState<Period>(30)

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(PERIOD_KEY))
      if (PERIODS.includes(saved as Period)) setPeriod(saved as Period)
    } catch { /* private mode */ }
  }, [])

  const choosePeriod = (next: Period) => {
    setPeriod(next)
    try { localStorage.setItem(PERIOD_KEY, String(next)) } catch { /* private mode */ }
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await getCurrentUser()
      if (!user) { router.push('/login'); return }
      if (companyLoading) return

      let query = supabase
        .from('invoices')
        .select('id, client_id, series, invoice_number, issue_date, due_date, total, tva_amount, amount_paid, payment_status, status, invoice_type_code, notes, direction, clients(company_name)')
      query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', ownerUserId || userId)
      const { data } = await query
      const rows = (data || []) as InvoiceRow[]
      const bought = rows.filter(inv => isPurchaseInvoice(inv))
      setPurchases(bought)
      setSales(rows.filter(inv => !isPurchaseInvoice(inv) && inv.status !== 'draft'))

      const ids = bought.map(inv => inv.id)
      const found: PaymentRow[] = []
      for (let i = 0; i < ids.length; i += 200) {
        const { data: pays } = await supabase
          .from('invoice_payments')
          .select('paid_on, amount, invoice_id')
          .in('user_id', accessibleOwnerIds.length ? accessibleOwnerIds : [ownerUserId || userId])
          .in('invoice_id', ids.slice(i, i + 200))
        found.push(...((pays || []) as PaymentRow[]))
      }
      setPayments(found)
      setLoading(false)
    }
    load()
  }, [accessibleOwnerIds, company?.id, companyLoading, ownerUserId, router, userId])

  const view = useMemo(() => {
    const today = calendarDateInBucharest(0)
    const from = calendarDateInBucharest(-(period - 1))
    const prevFrom = calendarDateInBucharest(-(2 * period - 1))
    const prevTo = calendarDateInBucharest(-period)

    let amount = 0, count = 0, vat = 0, prevAmount = 0
    const bySupplier = new Map<string, Supplier>()
    for (const inv of purchases) {
      const total = Number(inv.total) || 0
      if (inRange(inv.issue_date, from, today)) {
        amount += total
        vat += Number(inv.tva_amount) || 0
        if (!isCreditNote(inv.invoice_type_code)) count += 1
        const id = inv.client_id || 'none'
        const entry = bySupplier.get(id) || { id, name: inv.clients?.company_name?.trim() || t('pdash.unknownSupplier'), amount: 0, count: 0 }
        entry.amount += total
        entry.count += 1
        bySupplier.set(id, entry)
      } else if (inRange(inv.issue_date, prevFrom, prevTo)) {
        prevAmount += total
      }
    }
    const change = prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : null

    // Daily: bought (issue date) and paid (payment date).
    const days = daySeries(period)
    const index = new Map(days.map(d => [d.date, d]))
    for (const inv of purchases) {
      const bucket = index.get(inv.issue_date)
      if (bucket) bucket.invoiced += Number(inv.total) || 0
    }
    for (const pay of payments) {
      const bucket = index.get((pay.paid_on || '').slice(0, 10))
      if (bucket) bucket.collected += Number(pay.amount) || 0
    }
    const paidInPeriod = days.reduce((sum, d) => sum + d.collected, 0)

    // Payables: independent of the period.
    const weekEnd = addDaysIso(today, 7)
    let open = 0, overdue = 0, dueWeek = 0, openCount = 0, overdueCount = 0
    const toPay: Array<InvoiceRow & { rest: number; late: boolean }> = []
    for (const inv of purchases) {
      const rest = restOf(inv)
      if (rest <= 0) continue
      const due = inv.due_date || inv.issue_date
      const late = due < today
      open += rest
      openCount += 1
      if (late) { overdue += rest; overdueCount += 1 }
      else if (due <= weekEnd) dueWeek += rest
      toPay.push({ ...inv, rest, late })
    }
    toPay.sort((a, b) => (a.due_date || a.issue_date).localeCompare(b.due_date || b.issue_date))

    // VAT for the current calendar month: collected on sales − deductible on purchases (estimate).
    const monthStart = `${today.slice(0, 7)}-01`
    const vatOut = sales.filter(inv => inRange(inv.issue_date, monthStart, today)).reduce((sum, inv) => sum + (Number(inv.tva_amount) || 0), 0)
    const vatIn = purchases.filter(inv => inRange(inv.issue_date, monthStart, today)).reduce((sum, inv) => sum + (Number(inv.tva_amount) || 0), 0)

    return {
      amount, count, vat, change, days, paidInPeriod,
      open, overdue, dueWeek, openCount, overdueCount, toPay: toPay.slice(0, 8), moreToPay: Math.max(0, toPay.length - 8),
      vatOut, vatIn, vatNet: vatOut - vatIn,
      suppliers: [...bySupplier.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)
    }
  }, [payments, period, purchases, sales, t])

  if (loading || companyLoading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    )
  }

  const n = (value: number) => countWord(value, locale)
  /** "1 factură" / "2 facturi" / "34 de facturi": a *One key holds the singular. */
  const tc = (key: string, count: number) => (count === 1 && isMessageKey(`${key}One`) ? t(`${key}One`) : t(key, { count: n(count) }))
  const changeText = view.change === null ? null : `${view.change > 0 ? '+' : view.change < 0 ? '−' : ''}${formatDecimal(Math.abs(view.change), Math.abs(view.change) < 10 ? 1 : 0)}%`
  // Spending more is not good news: up is amber, down is green.
  const changeTone = view.change === null || view.change === 0 ? 'text-[color:var(--color-muted-foreground)]' : view.change > 0 ? 'text-amber-700' : 'text-green-700'
  const monthName = new Date().toLocaleDateString(locale === 'en' ? 'en-GB' : 'ro-RO', { month: 'long', timeZone: 'Europe/Bucharest' })
  const vatPayer = company?.vat_registered !== false
  const today = calendarDateInBucharest(0)

  return (
    <div className="app-shell">
      <AppNav active="dashboard-2" />
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="page-toolbar mb-8">
          <div>
            <h2 className="page-title text-[color:var(--color-foreground)]">{t('nav.dashboard2')}</h2>
            <p className="text-[color:var(--color-muted-foreground)] mt-2">{t('pdash.lead')}</p>
          </div>
          <div className="segmented" role="radiogroup" aria-label={t('dash.sales.period')}>
            {PERIODS.map(p => (
              <button key={p} type="button" role="radio" aria-checked={period === p} data-active={period === p} className="segmented-btn" onClick={() => choosePeriod(p)}>
                {t('dash.sales.days', { count: n(p) })}
              </button>
            ))}
          </div>
        </div>

        {purchases.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-[color:var(--color-foreground)] font-medium">{t('pdash.emptyTitle')}</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-2">{t('pdash.emptyLead')}</p>
            <Link href="/facturi-achizitie" className="btn btn-primary mt-5">{t('pdash.goPurchases')}</Link>
          </div>
        ) : (
          <>
            {/* Period: how much was bought */}
            <div className="card p-6 mb-6">
              <p className="kicker mb-4">{t('pdash.boughtN', { count: n(period) })}</p>
              <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
                <div>
                  <p className="kpi text-[color:var(--color-foreground)]"><Money value={view.amount} size="lg" /></p>
                  <p className="text-sm text-[color:var(--color-muted-foreground)] mt-2">
                    {tc('pdash.receivedCount', view.count)}
                    {changeText && (
                      <>
                        {' · '}
                        <span className={`font-medium ${changeTone}`}>{changeText}</span>
                        {' '}{t('dash.sales.vsPrevious', { count: n(period) })}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-10 text-sm">
                  {vatPayer && (
                    <div>
                      <p className="kicker mb-1">{t('pdash.vatN', { count: n(period) })}</p>
                      <p className="text-lg font-medium text-[color:var(--color-foreground)]"><Money value={view.vat} /></p>
                    </div>
                  )}
                  <div>
                    <p className="kicker mb-1">{t('pdash.paidN', { count: n(period) })}</p>
                    <p className="text-lg font-medium text-[color:var(--color-foreground)]"><Money value={view.paidInPeriod} /></p>
                  </div>
                </div>
              </div>
            </div>

            {/* Payables right now */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="card p-6">
                <p className="kicker mb-4">{t('pdash.open')}</p>
                <p className="kpi text-[color:var(--color-foreground)]"><Money value={view.open} size="lg" /></p>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">{tc('pdash.openCount', view.openCount)}</p>
              </div>
              <div className="card p-6">
                <p className="kicker mb-4">{t('pdash.overdue')}</p>
                <p className={`kpi ${view.overdue > 0 ? 'text-amber-800' : 'text-[color:var(--color-foreground)]'}`}><Money value={view.overdue} size="lg" /></p>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">
                  {view.overdueCount > 0 ? tc('pdash.overdueCount', view.overdueCount) : t('pdash.nothingOverdue')}
                </p>
              </div>
              <div className="card p-6">
                <p className="kicker mb-4">{t('pdash.dueWeek')}</p>
                <p className="kpi text-[color:var(--color-foreground)]"><Money value={view.dueWeek} size="lg" /></p>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">{t('pdash.dueWeekLead')}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="card p-6 lg:col-span-2">
                <DailyInvoicedChart
                  days={view.days}
                  kicker={t('dash.dailyVolume')}
                  title={t('pdash.chartN', { count: n(period) })}
                  emptyLabel={t('pdash.noVolume')}
                  chartId={`purchases${period}`}
                  labels={{ first: t('pdash.bought'), second: t('pdash.paid') }}
                />
              </div>

              {vatPayer ? (
                <div className="card p-6 flex flex-col">
                  <p className="kicker mb-2">{t('pdash.vatMonthKicker')}</p>
                  <h3 className="text-lg font-semibold tracking-tight text-[color:var(--color-foreground)]">
                    {view.vatNet >= 0 ? t('pdash.vatToPay', { month: monthName }) : t('pdash.vatToRecover', { month: monthName })}
                  </h3>
                  <p className={`kpi mt-4 ${view.vatNet >= 0 ? 'text-[color:var(--color-foreground)]' : 'text-green-800'}`}>
                    <Money value={Math.abs(view.vatNet)} size="lg" />
                  </p>
                  <dl className="mt-5 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[color:var(--color-muted-foreground)]">{t('pdash.vatOut')}</dt>
                      <dd className="font-medium"><Money value={view.vatOut} /></dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[color:var(--color-muted-foreground)]">{t('pdash.vatIn')}</dt>
                      <dd className="font-medium">−<Money value={view.vatIn} /></dd>
                    </div>
                  </dl>
                  <p className="text-xs text-[color:var(--color-muted-foreground)] mt-auto pt-5">
                    {company?.vat_on_collection ? t('pdash.vatOnCollectionNote') : t('pdash.vatNote')}
                  </p>
                </div>
              ) : (
                <div className="card p-6">
                  <p className="kicker mb-2">{t('pdash.vatMonthKicker')}</p>
                  <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('pdash.notVatPayer')}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card p-6">
                <p className="kicker mb-2">{t('pdash.toPayKicker')}</p>
                <h3 className="text-lg font-semibold tracking-tight text-[color:var(--color-foreground)]">{t('pdash.toPayTitle')}</h3>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1 mb-4">{t('pdash.toPayLead')}</p>
                {view.toPay.length === 0 ? (
                  <p className="text-sm text-[color:var(--color-muted-foreground)] py-8 text-center">{t('pdash.allPaid')}</p>
                ) : (
                  <ul className="divide-y divide-[color:var(--border)]">
                    {view.toPay.map(inv => {
                      const due = inv.due_date || inv.issue_date
                      const days = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000)
                      return (
                        <li key={inv.id}>
                          <Link href={`/facturi-achizitie/${inv.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-[color:var(--muted)] -mx-2 px-2 rounded-lg">
                            <span className="min-w-0">
                              <span className="block text-sm text-[color:var(--color-foreground)] truncate">{inv.clients?.company_name || t('pdash.unknownSupplier')}</span>
                              <span className="block text-xs text-[color:var(--color-muted-foreground)]">
                                {inv.series}{inv.invoice_number} · {formatRoDate(due)}
                              </span>
                            </span>
                            <span className="text-right shrink-0">
                              <span className="block text-sm font-medium"><Money value={inv.rest} /></span>
                              <span className={`block text-xs ${inv.late ? 'text-amber-700 font-medium' : 'text-[color:var(--color-muted-foreground)]'}`}>
                                {inv.late ? t('pdash.lateDays', { count: -days }) : days === 0 ? t('pdash.dueToday') : t('pdash.inDays', { count: days })}
                              </span>
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {view.moreToPay > 0 && (
                  <Link href="/facturi-achizitie" className="block text-sm mt-3 text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]">
                    {tc('pdash.more', view.moreToPay)}
                  </Link>
                )}
              </div>

              <div className="card p-6">
                <p className="kicker mb-2">{t('pdash.suppliersKicker')}</p>
                <h3 className="text-lg font-semibold tracking-tight text-[color:var(--color-foreground)]">{t('pdash.top5N', { count: n(period) })}</h3>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1 mb-5">{t('pdash.top5Lead')}</p>
                {view.suppliers.length === 0 ? (
                  <p className="text-sm text-[color:var(--color-muted-foreground)] py-8 text-center">{t('pdash.noVolume')}</p>
                ) : (
                  <ol className="space-y-3">
                    {view.suppliers.map((supplier, i) => {
                      const peak = view.suppliers[0].amount || 1
                      const share = view.amount > 0 ? (supplier.amount / view.amount) * 100 : 0
                      return (
                        <li key={supplier.id}>
                          <div className="flex items-baseline justify-between gap-3 mb-1.5">
                            <p className="text-sm text-[color:var(--color-foreground)] truncate">
                              <span className="text-[color:var(--color-muted-foreground)] tabular-nums mr-2">{i + 1}.</span>
                              {supplier.name}
                            </p>
                            <p className="text-sm font-medium whitespace-nowrap">
                              <Money value={supplier.amount} />
                              <span className="text-xs text-[color:var(--color-muted-foreground)] ml-2">{formatDecimal(share, 0)}%</span>
                            </p>
                          </div>
                          <div className="h-1.5 rounded-full bg-[color:var(--muted)] overflow-hidden">
                            <div className="h-full rounded-full bg-[color:var(--chart-1)]" style={{ width: `${Math.max(6, (supplier.amount / peak) * 100)}%` }} />
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
