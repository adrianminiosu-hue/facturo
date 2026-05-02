'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
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
      await loadStats(user.id)
    }
    getUser()
  }, [])

  const loadStats = async (uid: string) => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*, clients(company_name)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })

    console.log('Dashboard invoices:', invoices, 'Error:', error)

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
          <svg
            width="18"
            height="18"
            viewBox="0 0 64 64"
            aria-hidden="true"
            className="shrink-0"
          >
            <rect x="6" y="6" width="52" height="52" rx="14" ry="14" fill="#001F54" />
            <path
              d="M24 22h22v6H30v6h14v6H30v12h-6V22z"
              fill="#FFFFFF"
              opacity="0.98"
            />
            <circle cx="46" cy="22" r="4" fill="#FFFFFF" opacity="0.9" />
            <path
              d="M42 22H34"
              stroke="#FFFFFF"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.6"
            />
          </svg>
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-900 transition">
            Deconectare
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Bună ziua! 👋</h2>
          <p className="text-gray-500 mt-1">Bine ai venit în Facturo</p>
        </div>

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