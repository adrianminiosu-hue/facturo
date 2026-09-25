'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import InvoiceEfacturaFields, { type InvoiceEfacturaValue } from '@/components/InvoiceEfacturaFields'
import InvoiceLineItems, { emptyInvoiceLine, type InvoiceLineItem } from '@/components/InvoiceLineItems'
import { emptyInvoiceFx, fxPersistFields, invoiceFxFromRow } from '@/lib/invoiceFx'
import InvoiceTotalsFields from '@/components/InvoiceTotalsFields'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { isDraftInvoice, isPurchaseInvoice } from '@/lib/invoiceStatus'
import { applyStornoToOriginal } from '@/lib/storno'
import { defaultDueDate } from '@/lib/dates'
import { computeInvoiceTotals } from '@/lib/invoiceMath'
import { persistInvoiceConvertedAmounts, updateInvoiceRow, invoicePartySnapshots } from '@/lib/invoicePersist'
import { useLocale } from '@/components/LocaleProvider'
import { invoiceTypeKey } from '@/lib/uiLabels'

interface Client {
  id: string
  company_name: string
  cui: string
  address?: string
  city: string
  is_public_institution?: boolean
}

function clientAddressLine(client: Client) {
  return [client.address, client.city].filter(Boolean).join(', ') || '—'
}
function ClientSearch({ clients, selectedClient, onSelect }: {
  clients: Client[]
  selectedClient: Client | null
  onSelect: (client: Client) => void
}) {
  const { t } = useLocale()
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
            <p className="text-xs text-gray-500">CUI: {selectedClient.cui || '—'} · {clientAddressLine(selectedClient)}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">{t('common.selectClient')}</p>
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
              placeholder={t('inv.searchPlaceholder')}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">{t('inv.noClientFound')}</p>
            ) : (
              filtered.map(client => (
                <div
                  key={client.id}
                  onClick={() => { onSelect(client); setOpen(false); setSearch('') }}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition border-b border-gray-50 last:border-0 ${selectedClient?.id === client.id ? 'bg-gray-50' : ''}`}
                >
                  <p className="text-sm font-medium text-gray-900">{client.company_name}</p>
                  <p className="text-xs text-gray-500">CUI: {client.cui || '—'} · {clientAddressLine(client)}</p>
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
  const { t } = useLocale()
  const { userId, company, ownerUserId } = useCompany()

  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creditedInvoiceId, setCreditedInvoiceId] = useState<string | null>(null)
  const [form, setForm] = useState({
    series: 'FCT',
    invoice_number: '',
    issue_date: '',
    due_date: '',
    notes: '',
    invoice_type_code: '380',
    currency: 'RON',
    payment_means_code: '42',
    tax_point_date: '',
    delivery_date: '',
    buyer_reference: '',
    order_reference: '',
    period_start: '',
    period_end: '',
    discount_percent: 0,
    prepaid_amount: 0
  })
  const [items, setItems] = useState<InvoiceLineItem[]>([emptyInvoiceLine()])
  const [fx, setFx] = useState(emptyInvoiceFx())

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await loadClients()
      await loadInvoice()
    }
    init()
  }, [company?.id, invoiceId, userId])

  const loadClients = async () => {
    let query = supabase.from('clients').select('*').order('company_name')
    query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', ownerUserId || userId)
    const { data } = await query
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
    if (isPurchaseInvoice(invoice)) {
      router.replace(`/facturi-achizitie/${invoiceId}`)
      return
    }
    if (invoice.company_id && company?.id && invoice.company_id !== company.id) {
      router.push('/invoices')
      return
    }
    if (!isDraftInvoice(invoice.status)) {
      router.replace(`/invoices/${invoiceId}`)
      return
    }

    setCreditedInvoiceId(invoice.credited_invoice_id || null)
    setForm({
      series: invoice.series,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date || '',
      notes: invoice.notes || '',
      invoice_type_code: invoice.invoice_type_code || '380',
      currency: 'RON',
      payment_means_code: invoice.payment_means_code || '42',
      tax_point_date: invoice.tax_point_date || invoice.issue_date || '',
      delivery_date: invoice.delivery_date || invoice.issue_date || '',
      buyer_reference: invoice.buyer_reference || '',
      order_reference: invoice.order_reference || '',
      period_start: invoice.period_start || '',
      period_end: invoice.period_end || '',
      discount_percent: Number(invoice.discount_percent || 0),
      prepaid_amount: Number(invoice.prepaid_amount || 0)
    })
    setFx(invoiceFxFromRow(invoice, invoice.invoice_items))
    setSelectedClient(invoice.clients)
    setItems(invoice.invoice_items.map((item: any) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tva_rate: item.tva_rate,
      total: item.total,
      unit_code: item.unit_code || 'H87',
      vat_category: item.vat_category || (item.tva_rate > 0 ? 'S' : 'Z'),
      vat_exemption_reason: item.vat_exemption_reason || '',
      discount_percent: Number(item.discount_percent || 0)
    })))
    setLoading(false)
  }

  const totals = computeInvoiceTotals(items, {
    discount_percent: form.discount_percent,
    prepaid_amount: form.prepaid_amount,
    exchange_rate: fx.enabled ? fx.rate : 0
  })

  const saveInvoice = async (status: 'draft' | 'sent') => {
    if (!selectedClient) { alert(t('inv.selectClientAlert')); return }
    if (items.some(i => !i.description)) { alert(t('inv.completeDesc')); return }
    if (selectedClient.is_public_institution && !form.buyer_reference.trim()) {
      alert(t('inv.publicBuyerAlert'))
      return
    }
    if (fx.enabled && !(fx.rate > 0)) {
      alert(t('inv.fxRequired'))
      return
    }
    setSaving(true)

    const { error } = await updateInvoiceRow(supabase, invoiceId, {
      client_id: selectedClient.id,
      issue_date: form.issue_date,
      due_date: form.due_date || defaultDueDate(form.issue_date),
      status,
      subtotal: totals.subtotal,
      tva_amount: totals.tvaAmount,
      total: totals.total,
      notes: form.notes,
      invoice_type_code: form.invoice_type_code,
      currency: 'RON',
      payment_means_code: form.payment_means_code,
      tax_point_date: form.tax_point_date || form.issue_date,
      delivery_date: form.delivery_date || form.issue_date,
      buyer_reference: form.buyer_reference || null,
      order_reference: form.order_reference || null,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      discount_percent: form.discount_percent || 0,
      prepaid_amount: form.prepaid_amount || 0,
      ...fxPersistFields(fx),
      ...invoicePartySnapshots({
        status,
        seller: company as unknown as Record<string, unknown>,
        buyer: selectedClient as unknown as Record<string, unknown>
      })
    })
    if (error) {
      alert(error.message)
      setSaving(false)
      return
    }

    await persistInvoiceConvertedAmounts(supabase, invoiceId, {
      subtotal: totals.subtotal,
      tva_amount: totals.tvaAmount,
      total: totals.total,
      ...fxPersistFields(fx)
    })

    await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
    await supabase.from('invoice_items').insert(
      items.map((item, index) => ({
        invoice_id: invoiceId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tva_rate: item.tva_rate,
        total: totals.lines[index]?.total ?? item.total,
        unit_code: item.unit_code,
        vat_category: item.vat_category,
        vat_exemption_reason: item.vat_exemption_reason || null,
        discount_percent: item.discount_percent || 0
      }))
    )

    if (status === 'sent' && creditedInvoiceId && (ownerUserId || userId)) {
      await applyStornoToOriginal(supabase, {
        originalId: creditedInvoiceId,
        userId: ownerUserId || userId,
        amount: totals.total,
        creditRef: `${form.series}${form.invoice_number}`
      })
    }

    router.push(`/invoices/${invoiceId}`)
    setSaving(false)
  }

  if (loading) return (
    <div className="app-shell flex items-center justify-center">
      <p className="text-[color:var(--color-muted-foreground)]">{t('common.loading')}</p>
    </div>
  )

  return (
    <div className="app-shell">
      <AppNav active="invoices" />

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">{t('inv.editTitle')}</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">{form.series}{form.invoice_number}{form.invoice_type_code === '381' ? ` · ${t(invoiceTypeKey('381'))}` : ''}</p>
          </div>
          <Link href={`/invoices/${invoiceId}`} className="text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] transition">
            {t('inv.backToDoc')}
          </Link>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">{t('inv.details')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.series')}</label>
                <input
                  type="text"
                  value={form.series}
                  readOnly
                  aria-readonly="true"
                  className="input bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.number')}</label>
                <input
                  type="text"
                  value={form.invoice_number}
                  readOnly
                  aria-readonly="true"
                  className="input bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.issueDate')}</label>
                <input type="date" value={form.issue_date}
                  onChange={e => {
                    const issue_date = e.target.value
                    setForm(f => ({
                      ...f,
                      issue_date,
                      tax_point_date: !f.tax_point_date || f.tax_point_date === f.issue_date ? issue_date : f.tax_point_date,
                      delivery_date: !f.delivery_date || f.delivery_date === f.issue_date ? issue_date : f.delivery_date
                    }))
                  }}
                  className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.dueDate')}</label>
                <input type="date" value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="input" />
              </div>
            </div>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-3">{t('inv.seriesNumberHint')}</p>
          </div>

          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">{t('common.client')}</h3>
            {clients.length === 0 ? (
              <p className="text-gray-400 text-sm">{t('inv.noClientsShort')}</p>
            ) : (
              <ClientSearch
                clients={clients}
                selectedClient={selectedClient}
                onSelect={setSelectedClient}
              />
            )}
          </div>

          <InvoiceEfacturaFields
            value={form as InvoiceEfacturaValue}
            onChange={efactura => setForm(f => ({ ...f, ...efactura, currency: 'RON' }))}
            buyerIsPublic={!!selectedClient?.is_public_institution}
            lockType={form.invoice_type_code === '381'}
          />

          <InvoiceLineItems
            items={items}
            onChange={setItems}
            fx={fx}
            onFxChange={setFx}
            taxPointDate={form.tax_point_date || form.issue_date}
          />

          <InvoiceTotalsFields
            totals={totals}
            discountPercent={form.discount_percent}
            prepaidAmount={form.prepaid_amount}
            onDiscountPercent={discount_percent => setForm(f => ({ ...f, discount_percent }))}
            onPrepaidAmount={prepaid_amount => setForm(f => ({ ...f, prepaid_amount }))}
          />

          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">{t('inv.notes')}</h3>
            <textarea value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="input text-sm"
              rows={3} placeholder={t('inv.notesPhShort')} />
          </div>

          <div className="card px-6 py-4 flex flex-wrap gap-3">
            <button onClick={() => saveInvoice('draft')} disabled={saving}
              className="btn btn-outline disabled:opacity-50">
              {saving ? t('common.saving') : t('inv.saveDraft')}
            </button>
            <button onClick={() => saveInvoice('sent')} disabled={saving}
              className="btn btn-primary disabled:opacity-50">
              {saving ? t('common.saving') : t('inv.issue')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}