'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import DailyInvoicedChart, { type DailyAmount } from '@/components/DailyInvoicedChart'
import { useCompany } from '@/components/CompanyProvider'
import { useLocale } from '@/components/LocaleProvider'
import { getCurrentUser, supabase } from '@/lib/supabase'
import { calendarDateInBucharest } from '@/lib/dates'
import { isCreditNote, isPurchaseInvoice } from '@/lib/invoiceStatus'
import { formatDecimal } from '@/lib/money'
import Money from '@/components/Money'

type InvoiceRow = {
  id: string
  client_id?: string | null
  issue_date: string
  total: number
  status: string
  invoice_type_code?: string | null
  notes?: string | null
  direction?: string | null
  clients?: { company_name?: string | null } | null
}

type PaymentRow = {
  paid_on: string | null
  amount: number | null
  company_id?: string | null
  invoice_id?: string | null
}

type TopCustomer = {
  id: string
  name: string
  amount: number
}

function daySeries(length: number): DailyAmount[] {
  return Array.from({ length }, (_, i) => ({
    date: calendarDateInBucharest(i - (length - 1)),
    invoiced: 0,
    collected: 0
  }))
}

function issuedInRange(invoices: InvoiceRow[], from: string, to: string) {
  return invoices.reduce(
    (acc, inv) => {
      if (inv.status === 'draft' || isCreditNote(inv.invoice_type_code)) return acc
      if (inv.issue_date < from || inv.issue_date > to) return acc
      acc.amount += Number(inv.total) || 0
      acc.count += 1
      return acc
    },
    { amount: 0, count: 0 }
  )
}

function fillSeries(
  days: DailyAmount[],
  invoices: InvoiceRow[],
  payments: PaymentRow[],
  companyId?: string
) {
  const index = new Map(days.map(day => [day.date, day]))
  for (const inv of invoices) {
    if (inv.status === 'draft' || isCreditNote(inv.invoice_type_code)) continue
    const bucket = index.get(inv.issue_date)
    if (bucket) bucket.invoiced += Number(inv.total) || 0
  }
  const invoiceIds = new Set(invoices.map(inv => inv.id))
  for (const payment of payments) {
    const date = (payment.paid_on || '').slice(0, 10)
    const bucket = date ? index.get(date) : undefined
    if (!bucket) continue
    if (companyId) {
      if (payment.company_id && payment.company_id !== companyId) continue
      if (!payment.company_id && payment.invoice_id && !invoiceIds.has(payment.invoice_id)) continue
      if (!payment.company_id && !payment.invoice_id) continue
    }
    bucket.collected += Number(payment.amount) || 0
  }
  return days
}

const PERIODS = [10, 20, 30] as const
type Period = (typeof PERIODS)[number]
const PERIOD_KEY = 'veyro_sales_period'

export default function SalesDashboard() {
  const router = useRouter()
  const { t, locale } = useLocale()
  const { company, ownerUserId, userId, accessibleOwnerIds, loading: companyLoading } = useCompany()
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
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
        .select('id, client_id, issue_date, total, status, invoice_type_code, notes, direction, clients(company_name)')
      query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', ownerUserId || userId)
      const { data: invoiceRows } = await query
      setInvoices(((invoiceRows || []) as InvoiceRow[]).filter(inv => !isPurchaseInvoice(inv)))

      const { data: paymentRows } = await supabase
        .from('invoice_payments')
        .select('paid_on, amount, company_id, invoice_id')
        .in('user_id', accessibleOwnerIds.length ? accessibleOwnerIds : [ownerUserId || userId])
      setPayments((paymentRows || []) as PaymentRow[])
      setLoading(false)
    }
    load()
  }, [accessibleOwnerIds, company?.id, companyLoading, ownerUserId, router, userId])

  const view = useMemo(() => {
    const today = calendarDateInBucharest(0)
    const from = calendarDateInBucharest(-(period - 1))
    const current = issuedInRange(invoices, from, today)
    const previous = issuedInRange(invoices, calendarDateInBucharest(-(2 * period - 1)), calendarDateInBucharest(-period))
    const days = fillSeries(daySeries(period), invoices, payments, company?.id)
    const collected = days.reduce((sum, d) => sum + d.collected, 0)
    const change = previous.amount > 0 ? ((current.amount - previous.amount) / previous.amount) * 100 : null

    const byClient = new Map<string, TopCustomer>()
    for (const inv of invoices) {
      if (inv.status === 'draft' || isCreditNote(inv.invoice_type_code)) continue
      if (inv.issue_date < from || inv.issue_date > today) continue
      const id = inv.client_id || 'none'
      const entry = byClient.get(id) || { id, name: inv.clients?.company_name?.trim() || t('dash.unnamedClient'), amount: 0 }
      entry.amount += Number(inv.total) || 0
      byClient.set(id, entry)
    }
    const topCustomers = [...byClient.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)
    return { current, change, days, collected, topCustomers }
  }, [company?.id, invoices, payments, period, t])

  if (loading || companyLoading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    )
  }

  const { current, change, days, collected, topCustomers } = view
  // Romanian: "10 zile", but "20 de zile" from 20 up.
  const n = (value: number) => (locale === 'ro' && value >= 20 ? `${value} de` : String(value))
  const changeText = change === null ? null : `${change > 0 ? '+' : change < 0 ? '−' : ''}${formatDecimal(Math.abs(change), Math.abs(change) < 10 ? 1 : 0)}%`
  const changeTone = change === null || change === 0 ? 'text-[color:var(--color-muted-foreground)]' : change > 0 ? 'text-green-700' : 'text-red-700'

  return (
    <div className="app-shell">
      <AppNav active="dashboard-1" />
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="page-toolbar mb-8">
          <div>
            <h2 className="page-title text-[color:var(--color-foreground)]">{t('nav.dashboard1')}</h2>
            <p className="text-[color:var(--color-muted-foreground)] mt-2">{t('dash.sales.lead')}</p>
          </div>
          <div className="segmented" role="radiogroup" aria-label={t('dash.sales.period')}>
            {PERIODS.map(p => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                data-active={period === p}
                className="segmented-btn"
                onClick={() => choosePeriod(p)}
              >
                {t('dash.sales.days', { count: n(p) })}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-6 mb-6">
          <p className="kicker mb-4">{t('dash.sales.billedN', { count: n(period) })}</p>
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <div>
              <p className="kpi text-[color:var(--color-foreground)]"><Money value={current.amount} size="lg" /></p>
              <p className="text-sm text-[color:var(--color-muted-foreground)] mt-2">
                {t('dash.sales.issuedCount', { count: current.count })}
                {changeText && (
                  <>
                    {' · '}
                    <span className={`font-medium ${changeTone}`}>{changeText}</span>
                    {' '}{t('dash.sales.vsPrevious', { count: n(period) })}
                  </>
                )}
              </p>
            </div>
            <div className="text-sm">
              <p className="kicker mb-1">{t('dash.sales.collectedN', { count: n(period) })}</p>
              <p className="text-lg font-medium text-[color:var(--color-foreground)]"><Money value={collected} /></p>
            </div>
          </div>
        </div>

        <div className="card p-6 mb-6">
          <DailyInvoicedChart
            days={days}
            title={t('dash.sales.chartN', { count: n(period) })}
            emptyLabel={t('dash.sales.noVolume')}
            chartId={`sales${period}`}
          />
        </div>

        <div className="card p-6">
          <p className="kicker mb-2">{t('dash.clients')}</p>
          <h3 className="text-lg font-semibold tracking-tight text-[color:var(--color-foreground)]">{t('dash.sales.top5N', { count: n(period) })}</h3>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1 mb-5">
            {t('dash.sales.top5Lead')}
          </p>
          {topCustomers.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted-foreground)] py-8 text-center">
              {t('dash.sales.noVolume')}
            </p>
          ) : (
            <ol className="space-y-3">
              {topCustomers.map((customer, i) => {
                const peak = topCustomers[0].amount || 1
                const widthPct = Math.max(6, (customer.amount / peak) * 100)
                return (
                  <li key={customer.id}>
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <p className="text-sm text-[color:var(--color-foreground)] truncate">
                        <span className="text-[color:var(--color-muted-foreground)] tabular-nums mr-2">{i + 1}.</span>
                        {customer.name}
                      </p>
                      <p className="text-sm font-medium tabular-nums whitespace-nowrap"><Money value={customer.amount} /></p>
                    </div>
                    <div className="h-1.5 rounded-full bg-[color:var(--muted)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[color:var(--chart-1)]"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
