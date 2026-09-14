'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import InvoiceEfacturaFields, { type InvoiceEfacturaValue } from '@/components/InvoiceEfacturaFields'
import InvoiceLineItems, { emptyInvoiceLine, type InvoiceLineItem } from '@/components/InvoiceLineItems'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { calendarDateInBucharest, defaultDueDate } from '@/lib/dates'
import { nextInvoiceNumber } from '@/lib/invoiceNumber'

interface Client {
  id: string
  company_name: string
  cui: string
  address: string
  city: string
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
export default function NewInvoice() {
  const router = useRouter()
  const { userId, company } = useCompany()
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [dueManual, setDueManual] = useState(false)
  const [form, setForm] = useState({
    series: 'FCT',
    invoice_number: '',
    issue_date: calendarDateInBucharest(0),
    due_date: defaultDueDate(calendarDateInBucharest(0)),
    notes: '',
    invoice_type_code: '380',
    currency: 'RON',
    payment_means_code: '42',
    delivery_date: '',
    buyer_reference: '',
    order_reference: '',
    period_start: '',
    period_end: ''
  })
  const [items, setItems] = useState<InvoiceLineItem[]>([emptyInvoiceLine()])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setSelectedClient(null)
      loadClients()
      generateInvoiceNumber()
      if (company?.invoice_series) setForm(f => ({ ...f, series: company.invoice_series }))
    }
    init()
  }, [company?.id, userId])

  const loadClients = async () => {
    let query = supabase.from('clients').select('*').order('company_name')
    query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', userId)
    const { data } = await query
    setClients(data || [])
  }

  const generateInvoiceNumber = async () => {
    const series = company?.invoice_series || 'FCT'
    const next = await nextInvoiceNumber(supabase, {
      series,
      companyId: company?.id,
      userId,
      startNumber: company?.invoice_start_number
    })
    setForm(f => ({ ...f, series, invoice_number: next }))
  }

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  const tvaAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price * item.tva_rate / 100), 0)
  const total = subtotal + tvaAmount

  const saveInvoice = async (status: 'draft' | 'sent') => {
    if (!selectedClient) { alert('Selectează un client!'); return }
    if (items.some(i => !i.description)) { alert('Completează descrierea pentru toate produsele/serviciile!'); return }
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        user_id: user?.id,
        ...(company?.id ? { company_id: company.id } : {}),
        client_id: selectedClient.id,
        invoice_number: form.invoice_number,
        series: form.series,
        issue_date: form.issue_date,
        due_date: form.due_date || defaultDueDate(form.issue_date),
        status,
        subtotal,
        tva_rate: items[0]?.tva_rate ?? 21,
        tva_amount: tvaAmount,
        total,
        notes: form.notes,
        invoice_type_code: form.invoice_type_code,
        currency: form.currency,
        payment_means_code: form.payment_means_code,
        delivery_date: form.delivery_date || null,
        buyer_reference: form.buyer_reference || null,
        order_reference: form.order_reference || null,
        period_start: form.period_start || null,
        period_end: form.period_end || null
      })
      .select()
      .single()

    if (error) { alert('Eroare la salvare! Rulează migrarea e-Factura în Supabase dacă ai adăugat coloane noi.'); setSaving(false); return }

    await supabase.from('invoice_items').insert(
      items.map(item => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tva_rate: item.tva_rate,
        total: item.total,
        unit_code: item.unit_code,
        vat_category: item.vat_category,
        vat_exemption_reason: item.vat_exemption_reason || null
      }))
    )

    router.push(`/invoices/${invoice.id}`)
    setSaving(false)
  }

  return (
    <div className="app-shell">
      <AppNav active="invoices" />

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">Factură nouă</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">Completează detaliile facturii</p>
          </div>
          <Link href="/invoices" className="text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] transition">
            ← Înapoi la facturi
          </Link>
        </div>

        <div className="space-y-6">

          {/* Invoice details */}
          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">Detalii factură</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Serie</label>
                <input
                  type="text"
                  value={form.series}
                  onChange={e => setForm(f => ({ ...f, series: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Număr</label>
                <input
                  type="text"
                  value={form.invoice_number}
                  onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data emiterii</label>
                <input
                  type="date"
                  value={form.issue_date}
                  onChange={e => {
                    const issue_date = e.target.value
                    setForm(f => ({
                      ...f,
                      issue_date,
                      due_date: dueManual ? f.due_date : defaultDueDate(issue_date)
                    }))
                  }}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scadență</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={e => {
                    setDueManual(true)
                    setForm(f => ({ ...f, due_date: e.target.value }))
                  }}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* Client selection */}
          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">Client</h3>
            {clients.length === 0 ? (
              <p className="text-[color:var(--color-muted-foreground)] text-sm">Nu ai clienți adăugați. <Link href="/clients" className="underline text-[color:var(--color-foreground)]">Adaugă un client</Link> mai întâi.</p>
            ) : (
              <div className="relative">
                <ClientSearch
                  clients={clients}
                  selectedClient={selectedClient}
                  onSelect={setSelectedClient}
                />
              </div>
            )}
          </div>

          <InvoiceEfacturaFields
            value={form as InvoiceEfacturaValue}
            onChange={efactura => setForm(f => ({ ...f, ...efactura }))}
          />

          <InvoiceLineItems items={items} onChange={setItems} />

          {/* Totals */}
          <div className="card p-6">
            <div className="flex flex-col items-end gap-2">
              <div className="flex justify-between w-64">
                <span className="text-sm text-[color:var(--color-muted-foreground)]">Subtotal</span>
                <span className="text-sm font-medium text-[color:var(--color-foreground)]">{subtotal.toFixed(2)} RON</span>
              </div>
              <div className="flex justify-between w-64">
                <span className="text-sm text-[color:var(--color-muted-foreground)]">TVA</span>
                <span className="text-sm font-medium text-[color:var(--color-foreground)]">{tvaAmount.toFixed(2)} RON</span>
              </div>
              <div className="flex justify-between w-64 pt-2 border-t border-gray-100">
                <span className="font-bold text-[color:var(--color-foreground)]">Total</span>
                <span className="font-bold text-[color:var(--color-foreground)] text-lg">{total.toFixed(2)} RON</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">Mențiuni</h3>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="input text-sm"
              rows={3}
              placeholder="Mențiuni suplimentare, termeni de plată, etc."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pb-8">
            <button
              onClick={() => saveInvoice('draft')}
              disabled={saving}
              className="btn btn-outline px-6 py-3 disabled:opacity-50"
            >
              {saving ? 'Se salvează...' : 'Salvează ciornă'}
            </button>
            <button
              onClick={() => saveInvoice('sent')}
              disabled={saving}
              className="btn btn-primary px-6 py-3 disabled:opacity-50"
            >
              {saving ? 'Se salvează...' : 'Emite factură'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}