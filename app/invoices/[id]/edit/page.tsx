'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

interface Client {
  id: string
  company_name: string
  cui: string
  city: string
}

interface LineItem {
  id?: string
  description: string
  quantity: number
  unit_price: number
  tva_rate: number
  total: number
}
function ClientSearch({ clients, selectedClient, onSelect }: {
  clients: Client[]
  selectedClient: Client | null
  onSelect: (client: Client) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = clients.filter(c =>
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.cui && c.cui.includes(search))
  )

  return (
    <div className="relative">
      <div
        className={`w-full border rounded-xl px-4 py-3 cursor-pointer flex items-center justify-between ${open ? 'border-black ring-2 ring-black' : 'border-gray-200'}`}
        onClick={() => setOpen(!open)}
      >
        {selectedClient ? (
          <div>
            <p className="text-sm font-medium text-gray-900">{selectedClient.company_name}</p>
            <p className="text-xs text-gray-500">CUI: {selectedClient.cui || '—'} · {selectedClient.city || '—'}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Selectează client...</p>
        )}
        <span className="text-gray-400 text-xs ml-2">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="Caută după nume sau CUI..."
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Niciun client găsit</p>
            ) : (
              filtered.map(client => (
                <div
                  key={client.id}
                  onClick={() => { onSelect(client); setOpen(false); setSearch('') }}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition border-b border-gray-50 last:border-0 ${selectedClient?.id === client.id ? 'bg-gray-50' : ''}`}
                >
                  <p className="text-sm font-medium text-gray-900">{client.company_name}</p>
                  <p className="text-xs text-gray-500">CUI: {client.cui || '—'} · {client.city || '—'}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
export default function EditInvoice() {
  const router = useRouter()
  const params = useParams()
  const invoiceId = params.id as string

  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    series: 'FCT',
    invoice_number: '',
    issue_date: '',
    due_date: '',
    notes: ''
  })
  const [items, setItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unit_price: 0, tva_rate: 21, total: 0 }
  ])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await loadClients(user.id)
      await loadInvoice()
    }
    init()
  }, [])

  const loadClients = async (uid: string) => {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', uid)
      .order('company_name')
    setClients(data || [])
    return data || []
  }

  const loadInvoice = async () => {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*, clients(*), invoice_items(*)')
      .eq('id', invoiceId)
      .single()

    if (!invoice) { router.push('/invoices'); return }

    setForm({
      series: invoice.series,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date || '',
      notes: invoice.notes || ''
    })
    setSelectedClient(invoice.clients)
    setItems(invoice.invoice_items.map((item: any) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tva_rate: item.tva_rate,
      total: item.total
    })))
    setLoading(false)
  }

  const updateItem = (index: number, field: string, value: any) => {
    setItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      const item = updated[index]
      const subtotal = item.quantity * item.unit_price
      updated[index].total = subtotal + (subtotal * item.tva_rate / 100)
      return updated
    })
  }

  const addItem = () => {
    setItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0, tva_rate: 19, total: 0 }])
  }

  const removeItem = (index: number) => {
    if (items.length === 1) return
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  const tvaAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price * item.tva_rate / 100), 0)
  const total = subtotal + tvaAmount

  const saveInvoice = async (status: 'draft' | 'sent') => {
    if (!selectedClient) { alert('Selectează un client!'); return }
    if (items.some(i => !i.description)) { alert('Completează descrierea!'); return }
    setSaving(true)

    await supabase.from('invoices').update({
      client_id: selectedClient.id,
      series: form.series,
      invoice_number: form.invoice_number,
      issue_date: form.issue_date,
      due_date: form.due_date || form.issue_date,
      status,
      subtotal,
      tva_amount: tvaAmount,
      total,
      notes: form.notes
    }).eq('id', invoiceId)

    await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
    await supabase.from('invoice_items').insert(
      items.map(item => ({
        invoice_id: invoiceId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tva_rate: item.tva_rate,
        total: item.total
      }))
    )

    router.push('/invoices')
    setSaving(false)
  }

  if (loading) return (
    <div className="app-shell flex items-center justify-center">
      <p className="text-[color:var(--color-muted-foreground)]">Se încarcă...</p>
    </div>
  )

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <Link href="/dashboard" className="text-xl font-bold text-[color:var(--color-foreground)]">Facturo</Link>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="nav-link">Dashboard</Link>
          <Link href="/clients" className="nav-link">Clienți</Link>
          <Link href="/invoices" className="nav-link-active">Facturi</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-[color:var(--color-foreground)]">Editează factură</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">{form.series}{form.invoice_number}</p>
          </div>
          <Link href="/invoices" className="text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] transition">
            ← Înapoi la facturi
          </Link>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">Detalii factură</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Serie</label>
                <input type="text" value={form.series}
                  onChange={e => setForm(f => ({ ...f, series: e.target.value }))}
                  className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Număr</label>
                <input type="text" value={form.invoice_number}
                  onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                  className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data emiterii</label>
                <input type="date" value={form.issue_date}
                  onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))}
                  className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scadență</label>
                <input type="date" value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="input" />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">Client</h3>
            {clients.length === 0 ? (
              <p className="text-gray-400 text-sm">Nu ai clienți adăugați.</p>
            ) : (
              <ClientSearch
                clients={clients}
                selectedClient={selectedClient}
                onSelect={setSelectedClient}
              />
            )}
          </div>

          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">Produse / Servicii</h3>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 md:col-span-4">
                    {index === 0 && <label className="block text-xs text-gray-500 mb-1">Descriere</label>}
                    <input type="text" value={item.description}
                      onChange={e => updateItem(index, 'description', e.target.value)}
                      className="input px-3 py-2.5"
                      placeholder="Serviciu / produs" />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    {index === 0 && <label className="block text-xs text-gray-500 mb-1">Cantitate</label>}
                    <input type="number" value={item.quantity}
                      onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="input px-3 py-2.5" min="0" />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    {index === 0 && <label className="block text-xs text-gray-500 mb-1">Preț unitar</label>}
                    <input type="number" value={item.unit_price}
                      onChange={e => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="input px-3 py-2.5" min="0" />
                  </div>
                  <div className="col-span-3 md:col-span-2">
                    {index === 0 && <label className="block text-xs text-gray-500 mb-1">TVA %</label>}
                    <select
                      value={item.tva_rate}
                      onChange={e => updateItem(index, 'tva_rate', parseFloat(e.target.value))}
                      className="input bg-white px-3 py-2.5"
                    >
                      <option value={21}>21%</option>
                      <option value={9}>9%</option>
                      <option value={5}>5%</option>
                      <option value={0}>0%</option>
                    </select>
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    {index === 0 && <label className="block text-xs text-gray-500 mb-1">Total</label>}
                    <p className="text-sm font-medium text-[color:var(--color-foreground)] py-2.5">{item.total.toFixed(2)}</p>
                  </div>
                  <div className="col-span-1">
                    {index === 0 && <div className="mb-1 h-4"></div>}
                    <button onClick={() => removeItem(index)} className="text-red-400 hover:text-red-600 transition text-lg leading-none py-2.5">×</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addItem}
              className="mt-4 btn btn-outline w-full border-dashed">
              + Adaugă linie
            </button>
          </div>

          <div className="card p-6">
            <div className="flex flex-col items-end gap-2">
              <div className="flex justify-between w-64">
                <span className="text-sm text-gray-500">Subtotal</span>
                <span className="text-sm font-medium text-[color:var(--color-foreground)]">{subtotal.toFixed(2)} RON</span>
              </div>
              <div className="flex justify-between w-64">
                <span className="text-sm text-gray-500">TVA</span>
                <span className="text-sm font-medium text-[color:var(--color-foreground)]">{tvaAmount.toFixed(2)} RON</span>
              </div>
              <div className="flex justify-between w-64 pt-2 border-t border-gray-100">
                <span className="font-bold text-[color:var(--color-foreground)]">Total</span>
                <span className="font-bold text-[color:var(--color-foreground)] text-lg">{total.toFixed(2)} RON</span>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">Mențiuni</h3>
            <textarea value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="input text-sm"
              rows={3} placeholder="Mențiuni suplimentare..." />
          </div>

          <div className="flex gap-3 pb-8">
            <button onClick={() => saveInvoice('draft')} disabled={saving}
              className="btn btn-outline px-6 py-3 disabled:opacity-50">
              {saving ? 'Se salvează...' : 'Salvează ciornă'}
            </button>
            <button onClick={() => saveInvoice('sent')} disabled={saving}
              className="btn btn-primary px-6 py-3 disabled:opacity-50">
              {saving ? 'Se salvează...' : 'Emite factură'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}