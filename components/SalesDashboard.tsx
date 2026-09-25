'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import DailyInvoicedChart, { type DailyAmount } from '@/components/DailyInvoicedChart'
import { useCompany } from '@/components/CompanyProvider'
import { useLocale } from '@/components/LocaleProvider'
import { supabase } from '@/lib/supabase'
import { calendarDateInBucharest } from '@/lib/dates'
import { isCreditNote, isPurchaseInvoice } from '@/lib/invoiceStatus'
import { formatRon } from '@/lib/money'

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

export default function SalesDashboard() {
  const router = useRouter()
  const { t } = useLocale()
  const { company, ownerUserId, userId, accessibleOwnerIds, loading: companyLoading } = useCompany()
  const [loading, setLoading] = useState(true)
  const [days10, setDays10] = useState({ amount: 0, count: 0 })
  const [days20, setDays20] = useState({ amount: 0, count: 0 })
  const [days30, setDays30] = useState({ amount: 0, count: 0 })
  const [series10, setSeries10] = useState<DailyAmount[]>(() => daySeries(10))
  const [series20, setSeries20] = useState<DailyAmount[]>(() => daySeries(20))
  const [series30, setSeries30] = useState<DailyAmount[]>(() => daySeries(30))
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      if (companyLoading) return

      let query = supabase
        .from('invoices')
        .select('id, client_id, issue_date, total, status, invoice_type_code, notes, direction, clients(company_name)')
      query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', ownerUserId || userId)
      const { data: invoices } = await query
      const all = ((invoices || []) as InvoiceRow[]).filter(inv => !isPurchaseInvoice(inv))

      let payQuery = supabase
        .from('invoice_payments')
        .select('paid_on, amount, company_id, invoice_id')
        .in('user_id', accessibleOwnerIds.length ? accessibleOwnerIds : [ownerUserId || userId])
      const { data: payments } = await payQuery
      const paymentRows = (payments || []) as PaymentRow[]

      const today = calendarDateInBucharest(0)
      setDays10(issuedInRange(all, calendarDateInBucharest(-9), today))
      setDays20(issuedInRange(all, calendarDateInBucharest(-19), today))
      setDays30(issuedInRange(all, calendarDateInBucharest(-29), today))
      setSeries10(fillSeries(daySeries(10), all, paymentRows, company?.id))
      setSeries20(fillSeries(daySeries(20), all, paymentRows, company?.id))
      setSeries30(fillSeries(daySeries(30), all, paymentRows, company?.id))

      const since = calendarDateInBucharest(-29)
      const byClient = new Map<string, TopCustomer>()
      for (const inv of all) {
        if (inv.status === 'draft' || isCreditNote(inv.invoice_type_code)) continue
        if (inv.issue_date < since || inv.issue_date > today) continue
        const id = inv.client_id || 'none'
        const current = byClient.get(id) || {
          id,
          name: inv.clients?.company_name?.trim() || t('dash.unnamedClient'),
          amount: 0
        }
        current.amount += Number(inv.total) || 0
        byClient.set(id, current)
      }
      setTopCustomers([...byClient.values()].sort((a, b) => b.amount - a.amount).slice(0, 5))
      setLoading(false)
    }
    load()
  }, [accessibleOwnerIds, company?.id, companyLoading, ownerUserId, router, t, userId])

  if (loading || companyLoading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    )
  }

  const cards = [
    { key: '10', title: t('dash.sales.billed10'), ...days10 },
    { key: '20', title: t('dash.sales.billed20'), ...days20 },
    { key: '30', title: t('dash.sales.billed30'), ...days30 }
  ]

  const charts = [
    { key: '10', title: t('dash.sales.billed10'), days: series10 },
    { key: '20', title: t('dash.sales.billed20'), days: series20 },
    { key: '30', title: t('dash.sales.billed30'), days: series30 }
  ]

  return (
    <div className="app-shell">
      <AppNav active="dashboard-1" />
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h2 className="text-4xl text-[color:var(--color-foreground)]">{t('nav.dashboard1')}</h2>
          <p className="text-[color:var(--color-muted-foreground)] mt-2">{t('dash.sales.lead')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {cards.map(card => (
            <div key={card.key} className="card p-6">
              <p className="kicker mb-4">{card.title}</p>
              <p className="text-4xl brand text-[color:var(--color-foreground)]">
                {formatRon(card.amount).replace(' RON', '')}
              </p>
              <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">
                {t('dash.sales.issuedCount', { count: card.count })}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-6 mb-8">
          {charts.map(chart => (
            <div key={chart.key} className="card p-6">
              <DailyInvoicedChart
                days={chart.days}
                title={chart.title}
                emptyLabel={t('dash.sales.noVolume')}
                chartId={`sales${chart.key}`}
              />
            </div>
          ))}
        </div>

        <div className="card p-6">
          <p className="kicker mb-2">{t('dash.clients')}</p>
          <h3 className="brand text-xl text-[color:var(--color-foreground)]">{t('dash.sales.top5')}</h3>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1 mb-5">
            {t('dash.sales.top5Lead')}
          </p>
          {topCustomers.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted-foreground)] py-8 text-center">
              {t('dash.noInvoices30')}
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
                      <p className="text-sm font-medium tabular-nums whitespace-nowrap">{formatRon(customer.amount)}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-[color:var(--muted)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[color:var(--accent)]"
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
