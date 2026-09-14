'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import InvoiceOverflow from '@/components/InvoiceOverflow'
import PaymentModal from '@/components/PaymentModal'
import { INVOICE_TYPE_CODES } from '@/lib/efactura'
import { calendarDateInBucharest, formatRoDate } from '@/lib/dates'
import { nextInvoiceNumber } from '@/lib/invoiceNumber'
import { downloadInvoicePdf, downloadInvoiceXml, sendInvoiceEmail, simulateSpvUpload } from '@/lib/invoiceClient'
import { INVOICE_STATUS_LABEL, isCreditNote, isDraftInvoice } from '@/lib/invoiceStatus'

type Line = {
  id: string
  description: string
  quantity: number
  unit_price: number
  tva_rate: number
  total: number
  unit_code?: string
}

type Invoice = {
  id: string
  user_id: string
  company_id?: string | null
  client_id?: string
  series: string
  invoice_number: string
  issue_date: string
  due_date?: string | null
  status: string
  subtotal: number
  tva_amount: number
  total: number
  notes?: string | null
  invoice_type_code?: string | null
  currency?: string | null
  credited_invoice_id?: string | null
  amount_paid?: number | null
  efactura_status?: string | null
  clients?: { company_name?: string; cui?: string; email?: string; city?: string } | null
  invoice_items?: Line[]
}

function ron(n: number) {
  return `${Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`
}

export default function InvoiceViewPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.id as string
  const { userId, company, loading: companyLoading } = useCompany()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [creditedRef, setCreditedRef] = useState('')
  const [hasStorno, setHasStorno] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [payOpen, setPayOpen] = useState(false)

  const load = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('*, clients(company_name, cui, email, city), invoice_items(*)')
      .eq('id', invoiceId)
      .single()
    if (!data) { router.push('/invoices'); return }
    if (data.company_id && company?.id && data.company_id !== company.id) {
      router.push('/invoices')
      return
    }
    setInvoice(data as Invoice)
    if (data.credited_invoice_id) {
      const { data: original } = await supabase
        .from('invoices')
        .select('series, invoice_number')
        .eq('id', data.credited_invoice_id)
        .single()
      setCreditedRef(original ? `${original.series}${original.invoice_number}` : '')
    } else {
      setCreditedRef('')
    }
    const { data: stornos } = await supabase
      .from('invoices')
      .select('id')
      .eq('credited_invoice_id', invoiceId)
      .limit(1)
    setHasStorno(!!stornos?.length)
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      if (companyLoading) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await load()
    }
    init()
  }, [invoiceId, company?.id, companyLoading])

  const createStorno = async () => {
    if (!invoice || !userId) return
    if (!confirm(`Creezi o notă de creditare (storno) pentru ${invoice.series}${invoice.invoice_number}? Factura originală rămâne neschimbată.`)) return
    setBusy('storno')
    try {
      const series = company?.invoice_series || invoice.series
      const invoice_number = await nextInvoiceNumber(supabase, {
        series,
        companyId: company?.id || invoice.company_id,
        userId,
        startNumber: company?.invoice_start_number
      })
      const today = calendarDateInBucharest(0)
      const { data: created, error } = await supabase
        .from('invoices')
        .insert({
          user_id: userId,
          company_id: invoice.company_id || company?.id || null,
          client_id: invoice.client_id,
          series,
          invoice_number,
          issue_date: today,
          due_date: today,
          status: 'draft',
          subtotal: invoice.subtotal,
          tva_amount: invoice.tva_amount,
          total: invoice.total,
          notes: `Storno pentru ${invoice.series}${invoice.invoice_number}`,
          invoice_type_code: '381',
          currency: invoice.currency || 'RON',
          payment_means_code: '42',
          credited_invoice_id: invoice.id
        })
        .select('id')
        .single()
      if (error || !created) {
        alert(error?.message || 'Nu s-a putut crea stornoul. Rulează migrarea storno în Supabase.')
        return
      }
      const items = invoice.invoice_items || []
      if (items.length) {
        await supabase.from('invoice_items').insert(
          items.map(item => ({
            invoice_id: created.id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tva_rate: item.tva_rate,
            total: item.total,
            unit_code: item.unit_code || 'H87'
          }))
        )
      }
      router.push(`/invoices/${created.id}/edit`)
    } finally {
      setBusy('')
    }
  }

  if (loading || !invoice) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-[color:var(--color-muted-foreground)]">Se încarcă...</p>
      </div>
    )
  }

  const status = INVOICE_STATUS_LABEL[invoice.status] || INVOICE_STATUS_LABEL.sent
  const typeLabel = INVOICE_TYPE_CODES.find(t => t.code === (invoice.invoice_type_code || '380'))?.label || 'Factură'
  const draft = isDraftInvoice(invoice.status)
  const credit = isCreditNote(invoice.invoice_type_code)
  const canStorno = !draft && !credit && !hasStorno
  const filename = `e-Factura-${invoice.series}${invoice.invoice_number}.xml`

  return (
    <div className="app-shell">
      <AppNav active="invoices" />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="kicker mb-2">{typeLabel}</p>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">
              {invoice.series}{invoice.invoice_number}
            </h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              {invoice.clients?.company_name || '—'} · {formatRoDate(invoice.issue_date)}
            </p>
          </div>
          <Link href="/invoices" className="text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]">
            ← Facturi
          </Link>
        </div>

        {!draft && (
          <div className="card p-4 mb-6 text-sm text-[color:var(--color-muted-foreground)]">
            Document emis — câmpurile fiscale sunt blocate. Corectarea se face prin notă de creditare (storno).
          </div>
        )}

        {creditedRef && (
          <p className="text-sm mb-4">
            Storno pentru{' '}
            <Link href={`/invoices/${invoice.credited_invoice_id}`} className="underline">
              {creditedRef}
            </Link>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className={`text-xs px-2 py-1 rounded-lg font-medium ${status.style}`}>{status.label}</span>
          {invoice.efactura_status === 'accepted' && <span className="text-xs text-green-700">SPV test · acceptat</span>}
          {invoice.efactura_status === 'rejected' && <span className="text-xs text-red-500">SPV test · respins</span>}
          {hasStorno && <span className="text-xs text-[color:var(--color-muted-foreground)]">Are storno</span>}
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {draft ? (
            <Link href={`/invoices/${invoice.id}/edit`} className="btn btn-primary text-sm px-4 py-2">
              Editează
            </Link>
          ) : (
            <button
              className="btn btn-outline text-sm px-4 py-2"
              onClick={() => downloadInvoicePdf(invoice.id, userId)}
            >
              PDF
            </button>
          )}
          {!draft && invoice.clients?.email && (
            <button
              className="btn btn-outline text-sm px-4 py-2"
              disabled={busy === 'email'}
              onClick={async () => {
                if (!confirm(`Trimiți factura ${invoice.series}${invoice.invoice_number} pe email?`)) return
                setBusy('email')
                try {
                  await sendInvoiceEmail(invoice.id, userId)
                  alert('Factura a fost trimisă.')
                  load()
                } catch (e) {
                  alert(e instanceof Error ? e.message : 'Eroare email')
                } finally { setBusy('') }
              }}
            >
              Email
            </button>
          )}
          {canStorno && (
            <button className="btn btn-outline text-sm px-4 py-2" disabled={busy === 'storno'} onClick={createStorno}>
              {busy === 'storno' ? '...' : 'Creează storno'}
            </button>
          )}
          {!draft && !credit && invoice.status !== 'paid' && (
            <button className="btn btn-outline text-sm px-4 py-2" onClick={() => setPayOpen(true)}>
              Încasare
            </button>
          )}
          <InvoiceOverflow
            actions={[
              {
                label: 'XML e-Factura',
                onClick: async () => {
                  try { await downloadInvoiceXml(invoice.id, userId, filename) }
                  catch (e) { alert(e instanceof Error ? e.message : 'Eroare XML') }
                }
              },
              {
                label: 'SPV test (simulare)',
                onClick: async () => {
                  if (!confirm('Simulare SPV. Nu se trimite nimic la ANAF.')) return
                  try {
                    const data = await simulateSpvUpload(invoice.id, userId)
                    alert(data.note || 'Simulare finalizată')
                    load()
                  } catch (e) {
                    alert(e instanceof Error ? e.message : 'Eroare SPV')
                  }
                }
              }
            ]}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="card p-6">
            <h3 className="font-bold mb-3">Client</h3>
            <p className="text-sm">{invoice.clients?.company_name || '—'}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
              CUI: {invoice.clients?.cui || '—'} · {invoice.clients?.city || '—'}
            </p>
          </div>
          <div className="card p-6">
            <h3 className="font-bold mb-3">Date</h3>
            <p className="text-sm">Emisă: {formatRoDate(invoice.issue_date)}</p>
            <p className="text-sm mt-1">Scadență: {invoice.due_date ? formatRoDate(invoice.due_date) : '—'}</p>
            {Number(invoice.amount_paid) > 0 && (
              <p className="text-sm mt-1">Încasat: {ron(Number(invoice.amount_paid))} din {ron(Number(invoice.total))}</p>
            )}
          </div>
        </div>

        <div className="card overflow-hidden mb-6">
          <div className="grid grid-cols-12 px-6 py-3 border-b border-gray-100 text-xs text-[color:var(--color-muted-foreground)]">
            <span className="col-span-6">Descriere</span>
            <span className="col-span-2 text-right">Cant.</span>
            <span className="col-span-2 text-right">Preț</span>
            <span className="col-span-2 text-right">Total</span>
          </div>
          {(invoice.invoice_items || []).map(item => (
            <div key={item.id} className="grid grid-cols-12 px-6 py-3 border-b border-gray-50 last:border-0 text-sm">
              <span className="col-span-6">{item.description}</span>
              <span className="col-span-2 text-right">{item.quantity}</span>
              <span className="col-span-2 text-right">{Number(item.unit_price).toFixed(2)}</span>
              <span className="col-span-2 text-right">{Number(item.total).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="card p-6 mb-6">
          <div className="flex flex-col items-end gap-1">
            <div className="flex justify-between w-64 text-sm">
              <span className="text-[color:var(--color-muted-foreground)]">Subtotal</span>
              <span>{ron(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between w-64 text-sm">
              <span className="text-[color:var(--color-muted-foreground)]">TVA</span>
              <span>{ron(invoice.tva_amount)}</span>
            </div>
            <div className="flex justify-between w-64 text-base font-bold pt-2 border-t border-gray-100">
              <span>Total</span>
              <span>{ron(invoice.total)}</span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div className="card p-6">
            <h3 className="font-bold mb-2">Mențiuni</h3>
            <p className="text-sm text-[color:var(--color-muted-foreground)] whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}
      </div>
      {payOpen && (
        <PaymentModal
          invoice={invoice}
          userId={userId}
          firmName={company?.company_name}
          onClose={() => setPayOpen(false)}
          onSaved={() => { setPayOpen(false); load() }}
        />
      )}
    </div>
  )
}
