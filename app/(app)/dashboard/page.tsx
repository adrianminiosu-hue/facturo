'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import DailyInvoicedChart, { type DailyAmount } from '@/components/DailyInvoicedChart'
import DailyTrendChart from '@/components/DailyTrendChart'
import { addDaysIso, calendarDateInBucharest, startOfIsoWeek } from '@/lib/dates'
import { isCreditNote, isOpenReceivable, isPurchaseInvoice } from '@/lib/invoiceStatus'
import { formatRon } from '@/lib/money'
import { userGreeting } from '@/lib/userDisplay'

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

type TopCustomer = {
  id: string
  name: string
  amount: number
}

type WeekOverWeek = {
  thisWeek: number
  lastWeek: number
  changePct: number | null
}

type PaymentRow = {
  paid_on: string | null
  amount: number | null
  company_id?: string | null
  invoice_id?: string | null
}

function formatChangePct(pct: number) {
  const abs = Math.abs(pct)
  const text = abs.toLocaleString('en-US', { maximumFractionDigits: abs >= 10 ? 0 : 1 })
  if (pct > 0) return `+${text}%`
  if (pct < 0) return `−${text}%`
  return '0%'
}

function lastFifteenDays(): DailyAmount[] {
  return Array.from({ length: 15 }, (_, i) => ({
    date: calendarDateInBucharest(i - 14),
    invoiced: 0,
    collected: 0
  }))
}

export default function Dashboard() {
  const router = useRouter()
  const { userId, company, ownerUserId, accessibleOwnerIds, loading: companyLoading, userName } = useCompany()
  const [loading, setLoading] = useState(true)
  const [onboarding, setOnboarding] = useState(false)
  const [steps, setSteps] = useState({
    profile: false,
    client: false,
    invoice: false
  })
  const [stats, setStats] = useState({
    invoicesThisMonth: 0,
    totalAmount: 0,
    unpaidCount: 0,
    daily: lastFifteenDays(),
    topCustomers: [] as TopCustomer[],
    weekOverWeek: { thisWeek: 0, lastWeek: 0, changePct: null } as WeekOverWeek
  })
  const [bannerDismissed, setBannerDismissed] = useState(false)

  useEffect(() => {
    setBannerDismissed(localStorage.getItem('facturo_onboarding_dismissed') === '1')
  }, [])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      if (companyLoading) return
      await checkOnboarding()
      await loadStats()
    }
    getUser()
  }, [company?.id, companyLoading])

  const checkOnboarding = async () => {
    let hasProfile = !!(company?.company_name)
    if (!hasProfile && userId) {
      const { data: profile } = await supabase.from('profiles').select('company_name').eq('id', userId).single()
      hasProfile = !!(profile?.company_name)
    }
    const clientQuery = supabase.from('clients').select('id').limit(1)
    const invoiceQuery = supabase.from('invoices').select('id').limit(1)
    const { data: clients } = company?.id
      ? await clientQuery.eq('company_id', company.id)
      : await clientQuery.eq('user_id', ownerUserId || userId)
    const { data: invoices } = company?.id
      ? await invoiceQuery.eq('company_id', company.id)
      : await invoiceQuery.eq('user_id', ownerUserId || userId)
    const hasClient = !!(clients && clients.length > 0)
    const hasInvoice = !!(invoices && invoices.length > 0)
    setSteps({ profile: hasProfile, client: hasClient, invoice: hasInvoice })
    setOnboarding(!hasProfile || !hasClient || !hasInvoice)
  }

  const loadStats = async () => {
    const firstDay = calendarDateInBucharest(0).slice(0, 8) + '01'
    let query = supabase
      .from('invoices')
      .select('id, client_id, issue_date, total, status, invoice_type_code, notes, clients(company_name)')
    query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', ownerUserId || userId)
    const { data: invoices } = await query
    const all = ((invoices || []) as InvoiceRow[]).filter(inv => !isPurchaseInvoice(inv))
    const thisMonth = all.filter(inv => inv.issue_date >= firstDay && inv.status !== 'draft')
    const unpaid = all.filter(inv => isOpenReceivable(inv.status))
    const totalAmount = all
      .filter(inv => inv.status !== 'draft')
      .reduce((sum, inv) => sum + Number(inv.total), 0)
    const daily = lastFifteenDays()
    const index = new Map(daily.map(day => [day.date, day]))
    for (const inv of all) {
      if (inv.status === 'draft' || isCreditNote(inv.invoice_type_code)) continue
      const bucket = index.get(inv.issue_date)
      if (bucket) bucket.invoiced += Number(inv.total) || 0
    }

    let payQuery = supabase
      .from('invoice_payments')
      .select('paid_on, amount, company_id, invoice_id')
      .in('user_id', accessibleOwnerIds.length ? accessibleOwnerIds : [ownerUserId || userId])
    const { data: payments } = await payQuery
    const invoiceIds = new Set(all.map(inv => inv.id))
    for (const payment of (payments || []) as PaymentRow[]) {
      const date = (payment.paid_on || '').slice(0, 10)
      const bucket = date ? index.get(date) : undefined
      if (!bucket) continue
      if (company?.id) {
        if (payment.company_id && payment.company_id !== company.id) continue
        if (!payment.company_id && payment.invoice_id && !invoiceIds.has(payment.invoice_id)) continue
        if (!payment.company_id && !payment.invoice_id) continue
      }
      bucket.collected += Number(payment.amount) || 0
    }

    const since = calendarDateInBucharest(-29)
    const byClient = new Map<string, TopCustomer>()
    for (const inv of all) {
      if (inv.status === 'draft' || isCreditNote(inv.invoice_type_code)) continue
      if (inv.issue_date < since) continue
      const id = inv.client_id || 'none'
      const current = byClient.get(id) || {
        id,
        name: inv.clients?.company_name?.trim() || 'Fără client',
        amount: 0
      }
      current.amount += Number(inv.total) || 0
      byClient.set(id, current)
    }
    const topCustomers = [...byClient.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)

    const today = calendarDateInBucharest(0)
    const thisWeekStart = startOfIsoWeek(today)
    const lastWeekStart = addDaysIso(thisWeekStart, -7)
    const lastWeekSameEnd = addDaysIso(today, -7)
    const issuedInRange = (from: string, to: string) =>
      all.reduce((sum, inv) => {
        if (inv.status === 'draft' || isCreditNote(inv.invoice_type_code)) return sum
        if (inv.issue_date < from || inv.issue_date > to) return sum
        return sum + (Number(inv.total) || 0)
      }, 0)
    const thisWeekAmount = issuedInRange(thisWeekStart, today)
    const lastWeekAmount = issuedInRange(lastWeekStart, lastWeekSameEnd)
    const weekOverWeek: WeekOverWeek = {
      thisWeek: thisWeekAmount,
      lastWeek: lastWeekAmount,
      changePct: lastWeekAmount === 0 ? null : ((thisWeekAmount - lastWeekAmount) / lastWeekAmount) * 100
    }

    setStats({
      invoicesThisMonth: thisMonth.length,
      totalAmount,
      unpaidCount: unpaid.length,
      daily,
      topCustomers,
      weekOverWeek
    })
    setLoading(false)
  }

  const completedSteps = Object.values(steps).filter(Boolean).length
  const progressPct = (completedSteps / 3) * 100
  const { thisWeek, lastWeek, changePct } = stats.weekOverWeek
  const weekUp = changePct !== null && changePct > 0
  const weekDown = changePct !== null && changePct < 0
  const weekHeadline = changePct === null
    ? (thisWeek > 0 ? 'Nou' : '—')
    : formatChangePct(changePct)
  const weekColor = weekUp || (changePct === null && thisWeek > 0)
    ? 'text-emerald-700'
    : weekDown
      ? 'text-rose-700'
      : 'text-[color:var(--color-foreground)]'
  const weekCaption = changePct === null && lastWeek === 0 && thisWeek === 0
    ? 'nicio factură emisă în ambele săptămâni'
    : changePct === null
      ? `${formatRon(thisWeek)} emis · fără bază săptămâna trecută`
      : `${formatRon(thisWeek)} față de ${formatRon(lastWeek)}, aceleași zile`

  if (loading || companyLoading) return (
    <div className="app-shell flex items-center justify-center">
      <p className="text-gray-500">Se încarcă...</p>
    </div>
  )

  return (
    <div className="app-shell">
      <AppNav active="dashboard" />

        <div className="max-w-6xl mx-auto px-8 py-8">

        {/* Onboarding banner */}
        {onboarding && !bannerDismissed && (
          <div className="card p-8 mb-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl text-[color:var(--color-foreground)]">Bun venit în Facturo</h2>
                <p className="text-[color:var(--color-muted-foreground)] mt-1">Completează cei 3 pași pentru a emite prima ta factură</p>
              </div>
              <button
                onClick={() => {
                  localStorage.setItem('facturo_onboarding_dismissed', '1')
                  setBannerDismissed(true)
                  setOnboarding(false)
                }}
                className="text-gray-300 hover:text-gray-500 transition text-xl"
              >×</button>
            </div>

            <div className="mb-8">
              <div className="flex justify-between text-xs text-[color:var(--color-muted-foreground)] mb-2">
                <span>{completedSteps} din 3 pași completați</span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[color:var(--color-accent)] rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`rounded-2xl border-2 p-5 transition ${steps.profile ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${steps.profile ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {steps.profile ? '✓' : '1'}
                  </div>
                  <p className="font-medium text-[color:var(--color-foreground)]">Profilul companiei</p>
                </div>
                <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">Adaugă datele companiei tale — apar pe toate facturile.</p>
                {steps.profile ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-green-600 font-medium">✓ Completat</p>
                    {!steps.client && (
                      <Link href="/clients" className="inline-block btn btn-primary">
                        Mergi la pasul 2 →
                      </Link>
                    )}
                  </div>
                ) : (
                  <Link href="/profile" className="inline-block btn btn-primary">Configurează →</Link>
                )}
              </div>

              <div className={`rounded-2xl border-2 p-5 transition ${steps.client ? 'border-green-200 bg-green-50' : steps.profile ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${steps.client ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {steps.client ? '✓' : '2'}
                  </div>
                  <p className="font-medium text-[color:var(--color-foreground)]">Primul client</p>
                </div>
                <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">Adaugă un client cu completare automată din registrul public.</p>
                {steps.client ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-green-600 font-medium">✓ Completat</p>
                    {!steps.invoice && (
                      <Link href="/invoices/new" className="inline-block btn btn-primary">
                        Mergi la pasul 3 →
                      </Link>
                    )}
                  </div>
                ) : (
                  <Link href="/clients" className={`inline-block btn btn-primary ${!steps.profile ? 'pointer-events-none opacity-40' : ''}`}>Adaugă client →</Link>
                )}
              </div>

              <div className={`rounded-2xl border-2 p-5 transition ${steps.invoice ? 'border-green-200 bg-green-50' : steps.client ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${steps.invoice ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {steps.invoice ? '✓' : '3'}
                  </div>
                  <p className="font-medium text-[color:var(--color-foreground)]">Prima factură</p>
                </div>
                <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">Emite prima ta factură și descarcă PDF-ul.</p>
                {steps.invoice ? (
                  <p className="text-sm text-green-600 font-medium">✓ Completat</p>
                ) : (
                  <Link href="/invoices/new" className={`inline-block btn btn-primary ${!steps.client ? 'pointer-events-none opacity-40' : ''}`}>Creează factură →</Link>
                )}
              </div>
            </div>

            {completedSteps === 3 && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                <p className="text-green-700 font-medium">🎉 Felicitări! Ai completat configurarea Facturo!</p>
                <button
                  onClick={() => {
                    localStorage.setItem('facturo_onboarding_dismissed', '1')
                    setBannerDismissed(true)
                    setOnboarding(false)
                  }}
                  className="mt-2 text-sm text-green-600 hover:text-green-800 underline"
                >
                  Închide acest mesaj
                </button>
              </div>
            )}
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
        <h2 className="text-4xl text-[color:var(--color-foreground)]">{userGreeting(userName)}</h2>
          <p className="text-[color:var(--color-muted-foreground)] mt-2">
            {company?.company_name ? `${company.company_name} · ` : ''}
            {new Date().toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="kicker">Luna aceasta</p>
            </div>
            <p className="text-4xl brand text-[color:var(--color-foreground)]">{stats.invoicesThisMonth}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">facturi emise</p>
          </div>
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="kicker">Total facturat</p>
            </div>
            <p className="text-4xl brand text-[color:var(--color-foreground)]">{formatRon(stats.totalAmount).replace(' RON', '')}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">RON emis</p>
          </div>
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="kicker">Neîncasate</p>
            </div>
            <p className={`text-4xl brand ${stats.unpaidCount > 0 ? 'text-amber-700' : 'text-[color:var(--color-foreground)]'}`}>
              {stats.unpaidCount}
            </p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">în așteptare</p>
          </div>
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="kicker">Față de săptămâna trecută</p>
            </div>
            <p className={`text-4xl brand ${weekColor}`}>{weekHeadline}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">{weekCaption}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card p-6 lg:col-span-2">
            <DailyInvoicedChart days={stats.daily} />
          </div>
          <div className="card p-6">
            <p className="kicker mb-2">Clienți</p>
            <h3 className="brand text-xl text-[color:var(--color-foreground)]">Top 5 · 30 zile</h3>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1 mb-5">
              După sumă facturată, de azi înapoi 30 de zile
            </p>
            {stats.topCustomers.length === 0 ? (
              <p className="text-sm text-[color:var(--color-muted-foreground)] py-8 text-center">
                Nicio factură emisă în ultimele 30 de zile
              </p>
            ) : (
              <ol className="space-y-3">
                {stats.topCustomers.map((customer, i) => {
                  const peak = stats.topCustomers[0].amount || 1
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
                          className="h-full rounded-full bg-[#0e7490]"
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

        <div className="card p-6 mt-6">
          <DailyTrendChart days={stats.daily} />
        </div>
      </div>
    </div>
  )
}