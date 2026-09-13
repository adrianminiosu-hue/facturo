'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'

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
  efactura_status?: string | null
  efactura_index?: string | null
  efactura_error?: string | null
}

export default function Invoices() {
  const router = useRouter()
  const { userId, company, loading: companyLoading } = useCompany()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [filterClientId, setFilterClientId] = useState('')
  const [filterFrom, setFilterFrom] = useState('') // yyyy-mm-dd
  const [filterTo, setFilterTo] = useState('') // yyyy-mm-dd
  const [spvBusyId, setSpvBusyId] = useState('')
  const [spvResult, setSpvResult] = useState<{
    invoiceRef: string
    simulated: true
    environment: string
    endpoint: string
    executionStatus: string
    indexIncarcare?: string
    stare?: string
    error?: string
    uploadResponseXml: string
    statusResponseXml?: string
    note: string
  } | null>(null)

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      loadInvoices()
    }
    init()
  }, [company?.id, userId, companyLoading])

  const loadInvoices = async () => {
    let query = supabase
      .from('invoices')
      .select('*, clients(id, company_name)')
      .order('created_at', { ascending: false })
    query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', userId)
    const { data } = await query
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
    loadInvoices()
  }

  const downloadPDF = async (invoice: Invoice) => {
    const { data: { user } } = await supabase.auth.getUser()
    const url = `/api/invoice-pdf?id=${invoice.id}&userId=${user?.id}`
    window.open(url, '_blank')
  }

  const downloadXML = async (invoice: Invoice) => {
    const { data: { user } } = await supabase.auth.getUser()
    const url = `/api/invoice-xml?id=${invoice.id}&userId=${user?.id}`
    const res = await fetch(url)
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Eroare XML' }))
      alert(data.error || 'Nu s-a putut genera XML-ul e-Factura. Completează județul, adresa și UM.')
      return
    }
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `e-Factura-${invoice.series}${invoice.invoice_number}.xml`
    link.click()
    URL.revokeObjectURL(href)
  }

  const sendToSpvTest = async (invoice: Invoice) => {
    if (!confirm(`Simulezi trimiterea ${invoice.series}${invoice.invoice_number} în e-Factura SPV (mediu TEST)?\n\nNu se folosește certificat și nu se trimite nimic la ANAF.`)) return
    setSpvBusyId(invoice.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const res = await fetch('/api/efactura/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, userId: user?.id })
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Eroare simulare SPV')
        return
      }
      setSpvResult(data)
      loadInvoices()
    } finally {
      setSpvBusyId('')
    }
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
      loadInvoices()
    } else {
      alert(`Eroare: ${data.error}`)
    }
  }
  const deleteInvoice = async (id: string) => {
    if (!confirm('Ești sigur că vrei să ștergi această ciornă?')) return
    await supabase.from('invoice_items').delete().eq('invoice_id', id)
    await supabase.from('invoices').delete().eq('id', id)
    loadInvoices()
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
    <div className="app-shell">
      <AppNav active="invoices" />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">Facturi</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              {company?.company_name ? `${company.company_name} · ` : ''}
              {filteredInvoices.length} facturi{filtersActive ? ` din ${invoices.length}` : ''} · {unpaidCount} neplatite
            </p>
          </div>
          <Link
            href="/invoices/new"
            className="btn btn-primary"
          >
            + Factură nouă
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card p-6">
            <p className="text-sm text-[color:var(--color-muted-foreground)]">Total facturi</p>
            <p className="text-3xl font-bold text-[color:var(--color-foreground)] mt-1">{filteredInvoices.length}</p>
          </div>
          <div className="card p-6">
            <p className="text-sm text-[color:var(--color-muted-foreground)]">Valoare totală</p>
            <p className="text-3xl font-bold text-[color:var(--color-foreground)] mt-1">{totalValue.toFixed(0)} RON</p>
          </div>
          <div className="card p-6">
            <p className="text-sm text-[color:var(--color-muted-foreground)]">Neplatite</p>
            <p className="text-3xl font-bold text-[color:var(--color-foreground)] mt-1">{unpaidCount}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-[color:var(--color-muted-foreground)] text-center py-12">Se încarcă...</p>
        ) : invoices.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-[color:var(--color-muted-foreground)]">Nu ai nicio factură încă</p>
            <Link href="/invoices/new" className="font-medium text-sm mt-2 inline-block hover:underline text-[color:var(--color-foreground)]">
              Creează prima factură →
            </Link>
          </div>
        ) : (
          <>
            <div className="card p-4 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-[color:var(--color-muted-foreground)] mb-1">Client</label>
                  <select
                    value={filterClientId}
                    onChange={e => setFilterClientId(e.target.value)}
                    className="input bg-white px-3 py-2.5"
                  >
                    <option value="">Toți clienții</option>
                    {clientOptions.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--color-muted-foreground)] mb-1">De la</label>
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={e => setFilterFrom(e.target.value)}
                    className="input px-3 py-2.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--color-muted-foreground)] mb-1">Până la</label>
                  <input
                    type="date"
                    value={filterTo}
                    onChange={e => setFilterTo(e.target.value)}
                    className="input px-3 py-2.5"
                  />
                </div>
                <div className="flex gap-2 md:justify-end">
                  <button
                    onClick={() => { setFilterClientId(''); setFilterFrom(''); setFilterTo('') }}
                    disabled={!filtersActive}
                    className="btn btn-outline px-4 py-2.5 disabled:opacity-50"
                  >
                    Resetează
                  </button>
                </div>
              </div>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="card p-12 text-center">
                <p className="text-[color:var(--color-muted-foreground)]">Nu există facturi pentru filtrele selectate</p>
                <button
                  onClick={() => { setFilterClientId(''); setFilterFrom(''); setFilterTo('') }}
                  className="font-medium text-sm mt-2 inline-block hover:underline text-[color:var(--color-foreground)]"
                >
                  Resetează filtrele →
                </button>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="grid w-full grid-cols-[6.5rem_minmax(0,1fr)_7rem_7.5rem_8rem_minmax(18rem,auto)] gap-x-4 px-6 py-3 border-b border-gray-50">
                  <span className="text-xs font-medium text-gray-400">NUMĂR</span>
                  <span className="text-xs font-medium text-gray-400">CLIENT</span>
                  <span className="text-xs font-medium text-gray-400">DATA</span>
                  <span className="text-xs font-medium text-gray-400">STATUS</span>
                  <span className="text-xs font-medium text-gray-400 text-right">TOTAL</span>
                  <span className="text-xs font-medium text-gray-400 text-right">ACȚIUNI</span>
                </div>
                {filteredInvoices.map((invoice, i) => (
                  <div key={invoice.id} className={`grid w-full grid-cols-[6.5rem_minmax(0,1fr)_7rem_7.5rem_8rem_minmax(18rem,auto)] gap-x-4 px-6 py-4 items-center ${i !== filteredInvoices.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <span className="text-sm font-medium text-[color:var(--color-foreground)]">
                      {invoice.series}{invoice.invoice_number}
                    </span>
                    <span className="text-sm text-[color:var(--color-muted-foreground)] truncate" title={invoice.clients?.company_name || undefined}>
                      {invoice.clients?.company_name || '—'}
                    </span>
                    <span className="text-sm text-[color:var(--color-muted-foreground)]">{invoice.issue_date}</span>
                    <span>
                      <span className={`inline-block text-xs px-2 py-1 rounded-lg font-medium ${statusLabel[invoice.status]?.style}`}>
                        {statusLabel[invoice.status]?.label}
                      </span>
                      {invoice.efactura_status === 'accepted' && (
                        <p className="text-[10px] text-green-600 mt-1 font-medium">SPV test · acceptat</p>
                      )}
                      {invoice.efactura_status === 'rejected' && (
                        <p className="text-[10px] text-red-500 mt-1 font-medium">SPV test · respins</p>
                      )}
                    </span>
                    <span className="text-sm font-medium text-[color:var(--color-foreground)] text-right whitespace-nowrap tabular-nums">
                      {invoice.total.toFixed(0)} RON
                    </span>
                    <div className="flex flex-nowrap items-center justify-end gap-1.5">
                      {invoice.status === 'draft' && (
                        <>
                          <Link
                            href={`/invoices/${invoice.id}/edit`}
                            className="text-xs border border-gray-200 text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition"
                          >
                            Editează
                          </Link>
                          <button
                            onClick={() => downloadXML(invoice)}
                            className="text-xs border border-gray-200 text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition"
                          >
                            XML SPV
                          </button>
                          <button
                            onClick={() => sendToSpvTest(invoice)}
                            disabled={spvBusyId === invoice.id}
                            className="text-xs border border-amber-200 text-amber-700 px-2 py-1.5 rounded-lg hover:bg-amber-50 transition disabled:opacity-50"
                          >
                            {spvBusyId === invoice.id ? 'SPV...' : 'SPV test'}
                          </button>
                          <button
                            onClick={() => deleteInvoice(invoice.id)}
                            className="text-xs border border-red-100 text-red-500 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition"
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
                            onClick={() => downloadXML(invoice)}
                            className="text-xs border border-gray-200 text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition"
                          >
                            XML SPV
                          </button>
                          <button
                            onClick={() => sendToSpvTest(invoice)}
                            disabled={spvBusyId === invoice.id}
                            className="text-xs border border-amber-200 text-amber-700 px-2 py-1.5 rounded-lg hover:bg-amber-50 transition disabled:opacity-50"
                          >
                            {spvBusyId === invoice.id ? 'SPV...' : 'SPV test'}
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

      {spvResult && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSpvResult(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Simulare e-Factura SPV (test)</h3>
                <p className="text-sm text-gray-500 mt-1">{spvResult.invoiceRef}</p>
              </div>
              <button onClick={() => setSpvResult(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
              {spvResult.note}
            </p>
            <p className="text-xs text-gray-500 mb-1">Endpoint simulat</p>
            <p className="text-sm font-mono break-all mb-4">{spvResult.endpoint}</p>
            <p className={`text-sm font-medium mb-3 ${spvResult.executionStatus === '0' ? 'text-green-600' : 'text-red-600'}`}>
              {spvResult.executionStatus === '0'
                ? `Acceptat · index_incarcare ${spvResult.indexIncarcare} · stare ${spvResult.stare}`
                : spvResult.error}
            </p>
            <p className="text-xs text-gray-500 mb-1">Răspuns upload (XML ANAF)</p>
            <pre className="text-xs bg-gray-50 border border-gray-100 rounded-xl p-3 overflow-x-auto mb-3 whitespace-pre-wrap">{spvResult.uploadResponseXml}</pre>
            {spvResult.statusResponseXml && (
              <>
                <p className="text-xs text-gray-500 mb-1">Răspuns stareMesaj</p>
                <pre className="text-xs bg-gray-50 border border-gray-100 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">{spvResult.statusResponseXml}</pre>
              </>
            )}
            <button onClick={() => setSpvResult(null)} className="mt-5 btn btn-primary">Închide</button>
          </div>
        </div>
      )}
    </div>
  )
}