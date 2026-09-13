'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'

export default function Dashboard() {
  const router = useRouter()
  const { userId, company, loading: companyLoading } = useCompany()
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
    recentInvoices: [] as any[]
  })

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
      : await clientQuery.eq('user_id', userId)
    const { data: invoices } = company?.id
      ? await invoiceQuery.eq('company_id', company.id)
      : await invoiceQuery.eq('user_id', userId)
    const hasClient = !!(clients && clients.length > 0)
    const hasInvoice = !!(invoices && invoices.length > 0)
    setSteps({ profile: hasProfile, client: hasClient, invoice: hasInvoice })
    setOnboarding(!hasProfile || !hasClient || !hasInvoice)
  }

  const loadStats = async () => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    let query = supabase
      .from('invoices')
      .select('*, clients(company_name)')
      .order('created_at', { ascending: false })
    query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', userId)
    const { data: invoices } = await query
    const all = invoices || []
    const thisMonth = all.filter((inv: any) => inv.issue_date >= firstDay && inv.status !== 'draft')
    const unpaid = all.filter((inv: any) => inv.status === 'sent' || inv.status === 'overdue')
    const totalAmount = all
      .filter((inv: any) => inv.status !== 'draft')
      .reduce((sum: number, inv: any) => sum + Number(inv.total), 0)
    setStats({
      invoicesThisMonth: thisMonth.length,
      totalAmount,
      unpaidCount: unpaid.length,
      recentInvoices: all.slice(0, 5)
    })
    setLoading(false)
  }

  const statusLabel: Record<string, { label: string, style: string }> = {
    draft: { label: 'Ciornă', style: 'bg-gray-100 text-gray-600' },
    sent: { label: 'Emisă', style: 'bg-blue-50 text-blue-600' },
    paid: { label: 'Plătită', style: 'bg-green-50 text-green-600' },
    overdue: { label: 'Restantă', style: 'bg-red-50 text-red-600' }
  }

  const completedSteps = Object.values(steps).filter(Boolean).length
  const progressPct = (completedSteps / 3) * 100

  if (loading || companyLoading) return (
    <div className="app-shell flex items-center justify-center">
      <p className="text-gray-500">Se încarcă...</p>
    </div>
  )

  return (
    <div className="app-shell">
      <AppNav active="dashboard" />

      <div className="max-w-5xl mx-auto px-8 py-8">

        {/* Onboarding banner */}
        {onboarding && (
          <div className="card p-8 mb-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl text-[color:var(--color-foreground)]">Bun venit în Facturo</h2>
                <p className="text-[color:var(--color-muted-foreground)] mt-1">Completează cei 3 pași pentru a emite prima ta factură</p>
              </div>
              <button
                onClick={() => setOnboarding(false)}
                className="text-gray-300 hover:text-gray-500 transition text-xl"
              >×</button>
            </div>

            <div className="mb-8">
              <div className="flex justify-between text-xs text-[color:var(--color-muted-foreground)] mb-2">
                <span>{completedSteps} din 3 pași completați</span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-black rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
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
                      <Link href="/clients" className="inline-block btn btn-primary text-sm px-4 py-2">
                        Mergi la pasul 2 →
                      </Link>
                    )}
                  </div>
                ) : (
                  <Link href="/profile" className="inline-block btn btn-primary text-sm px-4 py-2">Configurează →</Link>
                )}
              </div>

              <div className={`rounded-2xl border-2 p-5 transition ${steps.client ? 'border-green-200 bg-green-50' : steps.profile ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${steps.client ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {steps.client ? '✓' : '2'}
                  </div>
                  <p className="font-medium text-[color:var(--color-foreground)]">Primul client</p>
                </div>
                <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">Adaugă un client cu completare automată din ANAF.</p>
                {steps.client ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-green-600 font-medium">✓ Completat</p>
                    {!steps.invoice && (
                      <Link href="/invoices/new" className="inline-block btn btn-primary text-sm px-4 py-2">
                        Mergi la pasul 3 →
                      </Link>
                    )}
                  </div>
                ) : (
                  <Link href="/clients" className={`inline-block btn btn-primary text-sm px-4 py-2 ${!steps.profile ? 'pointer-events-none opacity-40' : ''}`}>Adaugă client →</Link>
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
                  <Link href="/invoices/new" className={`inline-block btn btn-primary text-sm px-4 py-2 ${!steps.client ? 'pointer-events-none opacity-40' : ''}`}>Creează factură →</Link>
                )}
              </div>
            </div>

            {completedSteps === 3 && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                <p className="text-green-700 font-medium">🎉 Felicitări! Ai completat configurarea Facturo!</p>
                <button onClick={() => setOnboarding(false)} className="mt-2 text-sm text-green-600 hover:text-green-800 underline">
                  Închide acest mesaj
                </button>
              </div>
            )}
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <h2 className="text-4xl text-[color:var(--color-foreground)]">Bună ziua</h2>
          <p className="text-[color:var(--color-muted-foreground)] mt-2">
            {company?.company_name ? `${company.company_name} · ` : ''}
            {new Date().toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
            <p className="text-4xl brand text-[color:var(--color-foreground)]">{stats.totalAmount.toFixed(0)}</p>
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
        </div>

        {/* Recent invoices */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="brand text-xl text-[color:var(--color-foreground)]">Facturi recente</h3>
              <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">Ultimele 5 facturi emise</p>
            </div>
            <div className="flex gap-3">
              <Link href="/incasari" className="text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] transition">
                Încasări →
              </Link>
              <Link href="/invoices" className="text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] transition">
                Vezi toate →
              </Link>
              <Link href="/invoices/new" className="btn btn-primary text-sm px-4 py-2">
                + Factură nouă
              </Link>
            </div>
          </div>

          {stats.recentInvoices.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[color:var(--color-muted-foreground)] text-sm">Nicio factură pe firma activă</p>
              <Link href="/invoices/new" className="inline-block mt-3 text-sm font-medium text-[color:var(--color-foreground)] hover:underline">
                Creează prima factură →
              </Link>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-12 pb-2 mb-1 border-b border-gray-100">
                <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)]">NUMĂR</span>
                <span className="col-span-4 text-xs font-medium text-[color:var(--color-muted-foreground)]">CLIENT</span>
                <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)]">DATA</span>
                <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)]">STATUS</span>
                <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] text-right">TOTAL</span>
              </div>
              {stats.recentInvoices.map((invoice: any) => (
                <div key={invoice.id} className="grid grid-cols-12 py-3 border-b border-gray-50 last:border-0 items-center">
                  <span className="col-span-2 text-sm font-medium text-[color:var(--color-foreground)]">
                    {invoice.series}{invoice.invoice_number}
                  </span>
                  <span className="col-span-4 text-sm text-[color:var(--color-muted-foreground)]">
                    {invoice.clients?.company_name || '—'}
                  </span>
                  <span className="col-span-2 text-sm text-[color:var(--color-muted-foreground)]">
                    {invoice.issue_date}
                  </span>
                  <span className="col-span-2">
                    <span className={`text-xs px-2 py-1 rounded-lg font-medium ${statusLabel[invoice.status]?.style}`}>
                      {statusLabel[invoice.status]?.label}
                    </span>
                  </span>
                  <span className="col-span-2 text-sm font-medium text-[color:var(--color-foreground)] text-right">
                    {Number(invoice.total).toFixed(0)} RON
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}