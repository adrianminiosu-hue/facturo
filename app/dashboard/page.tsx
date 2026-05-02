'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
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
      setUser(user)
      await checkOnboarding(user.id)
      await loadStats(user.id)
    }
    getUser()
  }, [])

  const checkOnboarding = async (uid: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single()

    const { data: clients } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', uid)
      .limit(1)

    const { data: invoices } = await supabase
      .from('invoices')
      .select('id')
      .eq('user_id', uid)
      .limit(1)

    const hasProfile = !!(profile?.company_name)
    const hasClient = !!(clients && clients.length > 0)
    const hasInvoice = !!(invoices && invoices.length > 0)

    setSteps({
      profile: hasProfile,
      client: hasClient,
      invoice: hasInvoice
    })

    if (!hasProfile || !hasClient || !hasInvoice) {
      setOnboarding(true)
    }
  }

  const loadStats = async (uid: string) => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    const { data: invoices } = await supabase
      .from('invoices')
      .select('*, clients(company_name)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })

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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const statusLabel: Record<string, { label: string, style: string }> = {
    draft: { label: 'Ciornă', style: 'bg-gray-100 text-gray-600' },
    sent: { label: 'Emisă', style: 'bg-blue-50 text-blue-600' },
    paid: { label: 'Plătită', style: 'bg-green-50 text-green-600' },
    overdue: { label: 'Restantă', style: 'bg-red-50 text-red-600' }
  }

  const completedSteps = Object.values(steps).filter(Boolean).length
  const progressPct = (completedSteps / 3) * 100

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Se încarcă...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Facturo</h1>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-medium text-gray-900">Dashboard</Link>
          <Link href="/clients" className="text-sm text-gray-500 hover:text-gray-900 transition">Clienți</Link>
          <Link href="/invoices" className="text-sm text-gray-500 hover:text-gray-900 transition">Facturi</Link>
          <Link href="/profile" className="text-sm text-gray-500 hover:text-gray-900 transition">Profil</Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-900 transition">
            Deconectare
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Onboarding banner */}
        {onboarding && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 mb-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Bun venit în Facturo! 👋</h2>
                <p className="text-gray-500 mt-1">Completează cei 3 pași pentru a emite prima ta factură</p>
              </div>
              <button
                onClick={() => setOnboarding(false)}
                className="text-gray-300 hover:text-gray-500 transition text-xl"
              >
                ×
              </button>
            </div>

            {/* Progress bar */}
            <div className="mb-8">
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>{completedSteps} din 3 pași completați</span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-black rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Steps */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              <div className={`rounded-2xl border-2 p-5 transition ${steps.profile ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${steps.profile ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {steps.profile ? '✓' : '1'}
                  </div>
                  <p className="font-medium text-gray-900">Profilul companiei</p>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Adaugă datele companiei tale — apar pe toate facturile.
                </p>
                {steps.profile ? (
                  <p className="text-sm text-green-600 font-medium">✓ Completat</p>
                ) : (
                  <Link href="/profile" className="inline-block bg-black text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-gray-800 transition">
                    Configurează →
                  </Link>
                )}
              </div>

              <div className={`rounded-2xl border-2 p-5 transition ${steps.client ? 'border-green-200 bg-green-50' : steps.profile ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${steps.client ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {steps.client ? '✓' : '2'}
                  </div>
                  <p className="font-medium text-gray-900">Primul client</p>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Adaugă un client cu completare automată din ANAF.
                </p>
                {steps.client ? (
                  <p className="text-sm text-green-600 font-medium">✓ Completat</p>
                ) : (
                  <Link href="/clients" className={`inline-block bg-black text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-gray-800 transition ${!steps.profile ? 'pointer-events-none opacity-40' : ''}`}>
                    Adaugă client →
                  </Link>
                )}
              </div>

              <div className={`rounded-2xl border-2 p-5 transition ${steps.invoice ? 'border-green-200 bg-green-50' : steps.client ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${steps.invoice ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {steps.invoice ? '✓' : '3'}
                  </div>
                  <p className="font-medium text-gray-900">Prima factură</p>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Emite prima ta factură și descarcă PDF-ul.
                </p>
                {steps.invoice ? (
                  <p className="text-sm text-green-600 font-medium">✓ Completat</p>
                ) : (
                  <Link href="/invoices/new" className={`inline-block bg-black text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-gray-800 transition ${!steps.client ? 'pointer-events-none opacity-40' : ''}`}>
                    Creează factură →
                  </Link>
                )}
              </div>

            </div>

            {completedSteps === 3 && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                <p className="text-green-700 font-medium">🎉 Felicitări! Ai completat configurarea Facturo!</p>
                <button
                  onClick={() => setOnboarding(false)}
                  className="mt-2 text-sm text-green-600 hover:text-green-800 underline"
                >
                  Închide acest mesaj
                </button>
              </div>
            )}
          </div>
        )}

        {/* Dashboard header */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Bună ziua! 👋</h2>
          <p className="text-gray-500 mt-1">Bine ai venit în Facturo</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <p className="text-sm text-gray-500">Facturi luna aceasta</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.invoicesThisMonth}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <p className="text-sm text-gray-500">Total facturat</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalAmount.toFixed(0)} RON</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <p className="text-sm text-gray-500">Facturi neplatite</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.unpaidCount}</p>
          </div>
        </div>

        {/* Recent invoices */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900">Facturi recente</h3>
            <Link href="/invoices/new" className="bg-black text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 transition">
              + Factură nouă
            </Link>
          </div>
          {stats.recentInvoices.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">Nu ai nicio factură încă</p>
              <p className="text-gray-400 text-sm mt-1">Creează prima ta factură!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.recentInvoices.map((invoice: any) => (
                <div key={invoice.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-gray-900">{invoice.series}{invoice.invoice_number}</span>
                    <span className="text-sm text-gray-500">{invoice.clients?.company_name || '—'}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-xs px-2 py-1 rounded-lg font-medium ${statusLabel[invoice.status]?.style}`}>
                      {statusLabel[invoice.status]?.label}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{Number(invoice.total).toFixed(0)} RON</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}