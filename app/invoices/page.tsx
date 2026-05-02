'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Invoice {
  id: string
  invoice_number: string
  series: string
  issue_date: string
  due_date: string
  status: string
  total: number
  client_id?: string
  clients?: { id?: string; company_name?: string } | null
}

export default function Invoices() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string>('')
  const [filterClientId, setFilterClientId] = useState('')
  const [filterFrom, setFilterFrom] = useState('') // yyyy-mm-dd
  const [filterTo, setFilterTo] = useState('') // yyyy-mm-dd

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      loadInvoices(user.id)
    }
    init()
  }, [])

  const loadInvoices = async (uid: string) => {
    const { data } = await supabase
      .from('invoices')
      .select('*, clients(id, company_name)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  const statusLabel: Record<string, { label: string, style: string }> = {
    draft: { label: 'Ciornă', style: 'bg-gray-100 text-gray-600' },
    sent: { label: 'Emisă', style: 'bg-blue-50 text-blue-600' },
    paid: { label: 'Plătită', style: 'bg-green-50 text-green-600' },
    overdue: { label: 'Restantă', style: 'bg-red-50 text-red-600' }
  }

  const markAsPaid = async (id: string) => {
    await supabase.from('invoices').update({ status: 'paid' }).eq('id', id)
    loadInvoices(userId)
  }

  const downloadPDF = async (invoice: Invoice) => {
    const { data: { user } } = await supabase.auth.getUser()
    const url = `/api/invoice-pdf?id=${invoice.id}&userId=${user?.id}`
    window.open(url, '_blank')
  }

  const sendInvoice = async (invoice: Invoice) => {
    if (!confirm(`Trimiți factura ${invoice.series}${invoice.invoice_number} pe email?`)) return
    const { data: { user } } = await supabase.auth.getUser()
    const res = await fetch('/api/send-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: invoice.id, userId: user?.id })
    })
    const data = await res.json()
    if (data.success) {
      alert('✓ Factura a fost trimisă cu succes!')
      loadInvoices(userId)
    } else {
      alert(`Eroare: ${data.error}`)
    }
  }
  const deleteInvoice = async (id: string) => {
    if (!confirm('Ești sigur că vrei să ștergi această ciornă?')) return
    await supabase.from('invoice_items').delete().eq('invoice_id', id)
    await supabase.from('invoices').delete().eq('id', id)
    loadInvoices(userId)
  }

  const parseDate = (value: string) => {
    // expects yyyy-mm-dd; treat empty as invalid
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const fromDate = filterFrom ? parseDate(filterFrom) : null
  const toDate = filterTo ? parseDate(filterTo) : null

  const filteredInvoices = invoices.filter(inv => {
    if (filterClientId && inv.client_id !== filterClientId) return false
    if (fromDate || toDate) {
      const invDate = inv.issue_date ? parseDate(inv.issue_date) : null
      if (!invDate) return false
      if (fromDate && invDate < fromDate) return false
      if (toDate) {
        // inclusive end date (end of day)
        const end = new Date(toDate)
        end.setHours(23, 59, 59, 999)
        if (invDate > end) return false
      }
    }
    return true
  })

  const filtersActive = !!filterClientId || !!filterFrom || !!filterTo

  const clientOptions = Array.from(
    new Map(
      invoices
        .filter(inv => inv.client_id && inv.clients?.company_name)
        .map(inv => [inv.client_id as string, inv.clients?.company_name as string])
    ).entries()
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const totalValue = filteredInvoices.reduce((sum, inv) => sum + inv.total, 0)
  const unpaidCount = filteredInvoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue').length

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="text-xl font-bold text-gray-900">Facturo</Link>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition">Dashboard</Link>
          <Link href="/clients" className="text-sm text-gray-500 hover:text-gray-900 transition">Clienți</Link>
          <Link href="/invoices" className="text-sm font-medium text-gray-900">Facturi</Link>
          <Link href="/profile" className="text-sm text-gray-500 hover:text-gray-900 transition">Profil</Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Facturi</h2>
            <p className="text-gray-500 mt-1">
              {filteredInvoices.length} facturi{filtersActive ? ` din ${invoices.length}` : ''} · {unpaidCount} neplatite
            </p>
          </div>
          <Link
            href="/invoices/new"
            className="bg-black text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition"
          >
            + Factură nouă
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <p className="text-sm text-gray-500">Total facturi</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{filteredInvoices.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <p className="text-sm text-gray-500">Valoare totală</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{totalValue.toFixed(0)} RON</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <p className="text-sm text-gray-500">Neplatite</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{unpaidCount}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-12">Se încarcă...</p>
        ) : invoices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <p className="text-gray-400">Nu ai nicio factură încă</p>
            <Link href="/invoices/new" className="text-black font-medium text-sm mt-2 inline-block hover:underline">
              Creează prima factură →
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Client</label>
                  <select
                    value={filterClientId}
                    onChange={e => setFilterClientId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">Toți clienții</option>
                    {clientOptions.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">De la</label>
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={e => setFilterFrom(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Până la</label>
                  <input
                    type="date"
                    value={filterTo}
                    onChange={e => setFilterTo(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div className="flex gap-2 md:justify-end">
                  <button
                    onClick={() => { setFilterClientId(''); setFilterFrom(''); setFilterTo('') }}
                    disabled={!filtersActive}
                    className="border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    Resetează
                  </button>
                </div>
              </div>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <p className="text-gray-400">Nu există facturi pentru filtrele selectate</p>
                <button
                  onClick={() => { setFilterClientId(''); setFilterFrom(''); setFilterTo('') }}
                  className="text-black font-medium text-sm mt-2 inline-block hover:underline"
                >
                  Resetează filtrele →
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="grid grid-cols-12 px-6 py-3 border-b border-gray-50">
                  <span className="col-span-2 text-xs font-medium text-gray-400">NUMĂR</span>
                  <span className="col-span-3 text-xs font-medium text-gray-400">CLIENT</span>
                  <span className="col-span-2 text-xs font-medium text-gray-400">DATA</span>
                  <span className="col-span-1 text-xs font-medium text-gray-400">STATUS</span>
                  <span className="col-span-2 text-xs font-medium text-gray-400 text-right">TOTAL</span>
                  <span className="col-span-2 text-xs font-medium text-gray-400 text-right">ACȚIUNI</span>
                </div>
                {filteredInvoices.map((invoice, i) => (
                  <div key={invoice.id} className={`grid grid-cols-12 px-6 py-4 items-center ${i !== filteredInvoices.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <span className="col-span-2 text-sm font-medium text-gray-900">
                      {invoice.series}{invoice.invoice_number}
                    </span>
                    <span className="col-span-3 text-sm text-gray-700">
                      {invoice.clients?.company_name || '—'}
                    </span>
                    <span className="col-span-2 text-sm text-gray-500">{invoice.issue_date}</span>
                    <span className="col-span-1">
                      <span className={`text-xs px-2 py-1 rounded-lg font-medium ${statusLabel[invoice.status]?.style}`}>
                        {statusLabel[invoice.status]?.label}
                      </span>
                    </span>
                    <span className="col-span-2 text-sm font-medium text-gray-900 text-right">
                      {invoice.total.toFixed(0)} RON
                    </span>
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      {invoice.status === 'draft' && (
                        <>
                          <Link
                            href={`/invoices/${invoice.id}/edit`}
                            className="text-xs border border-gray-200 text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition"
                          >
                            Editează
                          </Link>
                          <button
                            onClick={() => deleteInvoice(invoice.id)}
                            className="text-xs border border-red-100 text-red-500 px-2 py-1.5 rounded-lg hover:bg-red-50 transition"
                          >
                            Șterge
                          </button>
                        </>
                      )}
                      {invoice.status === 'sent' && (
                        <button
                          onClick={() => markAsPaid(invoice.id)}
                          className="text-xs border border-green-200 text-green-600 px-2 py-1.5 rounded-lg hover:bg-green-50 transition"
                        >
                          Plătită
                        </button>
                      )}
                      {invoice.status !== 'draft' && (
                        <>
                          <button
                            onClick={() => downloadPDF(invoice)}
                            className="text-xs border border-gray-200 text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition"
                          >
                            PDF ↓
                          </button>
                          <button
                            onClick={() => sendInvoice(invoice)}
                            className="text-xs border border-blue-100 text-blue-600 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition"
                          >
                            ✉ Email
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}