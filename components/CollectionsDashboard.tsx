'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import PaySpeedChart, { type PaySpeedDay } from '@/components/PaySpeedChart'
import { useCompany } from '@/components/CompanyProvider'
import { useLocale } from '@/components/LocaleProvider'
import { supabase } from '@/lib/supabase'
import { calendarDateInBucharest, daysBetween } from '@/lib/dates'
import { isCreditNote, isPurchaseInvoice } from '@/lib/invoiceStatus'
import { remainingOf, roundMoney } from '@/lib/invoiceMath'

type InvoiceRow = {
  id: string
  issue_date: string
  total: number
  amount_paid?: number | null
  prepaid_amount?: number | null
  status: string
  invoice_type_code?: string | null
  notes?: string | null
  direction?: string | null
}

type PaymentRow = {
  invoice_id: string | null
  paid_on: string | null
  amount: number | null
  company_id?: string | null
}

function paidOnDate(invoice: InvoiceRow, payments: PaymentRow[]) {
  const rows = payments
    .filter(row => row.invoice_id === invoice.id && row.paid_on)
    .map(row => ({ date: (row.paid_on as string).slice(0, 10), amount: Number(row.amount) || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!rows.length) return null

  let running = Number(invoice.prepaid_amount || 0)
  const need = Number(invoice.total || 0)
  for (const row of rows) {
    running = roundMoney(running + row.amount)
    if (running + 0.005 >= need) return row.date
  }
  if (invoice.status === 'paid' || remainingOf(invoice) === 0) return rows[rows.length - 1].date
  return null
}

function formatDays(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export default function CollectionsDashboard() {
  const router = useRouter()
  const { t } = useLocale()
  const { company, ownerUserId, userId, accessibleOwnerIds, loading: companyLoading } = useCompany()
  const [loading, setLoading] = useState(true)
  const [average, setAverage] = useState<number | null>(null)
  const [paidCount, setPaidCount] = useState(0)
  const [series, setSeries] = useState<PaySpeedDay[]>([])

  useEffect(() => {
    const load = async () => {
      if (companyLoading) return
      try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      let invoiceQuery = supabase
        .from('invoices')
        .select('id, issue_date, total, amount_paid, prepaid_amount, status, invoice_type_code, notes, direction')
      invoiceQuery = company?.id
        ? invoiceQuery.eq('company_id', company.id)
        : invoiceQuery.eq('user_id', ownerUserId || userId)
      const { data: invoices, error } = await invoiceQuery
      if (error) throw error
      const issued = ((invoices || []) as InvoiceRow[]).filter(
        inv => !isPurchaseInvoice(inv) && !isCreditNote(inv.invoice_type_code) && inv.status !== 'draft'
      )

      const { data: payments } = await supabase
        .from('invoice_payments')
        .select('invoice_id, paid_on, amount, company_id')
        .in('user_id', accessibleOwnerIds.length ? accessibleOwnerIds : [ownerUserId || userId])

      const issuedIds = new Set(issued.map(invoice => invoice.id))
      const paymentRows = ((payments || []) as PaymentRow[]).filter(row => {
        if (company?.id) {
          if (row.company_id && row.company_id !== company.id) return false
          if (!row.company_id && row.invoice_id && !issuedIds.has(row.invoice_id)) return false
          if (!row.company_id && !row.invoice_id) return false
        }
        return true
      })

      const today = calendarDateInBucharest(0)
      const from = calendarDateInBucharest(-29)
      const settled: { paidOn: string; days: number }[] = []
      for (const invoice of issued) {
        const paidOn = paidOnDate(invoice, paymentRows)
        if (!paidOn || paidOn < from || paidOn > today) continue
        settled.push({ paidOn, days: Math.max(0, daysBetween(invoice.issue_date, paidOn)) })
      }

      const avg = settled.length
        ? settled.reduce((sum, row) => sum + row.days, 0) / settled.length
        : null
      setAverage(avg)
      setPaidCount(settled.length)

      const byDay = new Map<string, number[]>()
      for (const row of settled) {
        const list = byDay.get(row.paidOn) || []
        list.push(row.days)
        byDay.set(row.paidOn, list)
      }
      setSeries(Array.from({ length: 30 }, (_, i) => {
        const date = calendarDateInBucharest(i - 29)
        const list = byDay.get(date)
        return {
          date,
          days: list?.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null,
          count: list?.length || 0
        }
      }))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [accessibleOwnerIds, company?.id, companyLoading, ownerUserId, router, userId])

  if (loading || companyLoading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppNav active="dashboard-4" />
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h2 className="text-4xl text-[color:var(--color-foreground)]">{t('nav.dashboard4')}</h2>
          <p className="text-[color:var(--color-muted-foreground)] mt-2">{t('dash.collect.lead')}</p>
        </div>

        <div className="card p-6 mb-8 max-w-md">
          <p className="kicker mb-4">{t('dash.collect.avg')}</p>
          <p className="text-4xl brand text-[color:var(--color-foreground)]">
            {average === null ? '—' : t('dash.collect.days', { n: formatDays(average) })}
          </p>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">
            {t('dash.collect.avgHint')}
          </p>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
            {t('dash.collect.paidCount', { count: paidCount })}
          </p>
        </div>

        <div className="card p-6">
          <PaySpeedChart days={series} average={average} />
        </div>
      </div>
    </div>
  )
}
