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
import { formatRoDate } from '@/lib/dates'
import { downloadInvoicePdf, downloadInvoiceXml, sendInvoiceEmail, simulateSpvUpload } from '@/lib/invoiceClient'
import { ALREADY_SENT_TO_SPV, alreadySentToSpv, invoiceStatusAppearance, isCreditNote, isDraftInvoice, isPurchaseInvoice, notesWithoutSpvMark } from '@/lib/invoiceStatus'
import { formatAmount, formatRon } from '@/lib/money'
import { computeInvoiceTotals, remainingOf } from '@/lib/invoiceMath'
import { canCreateStorno, copyInvoiceAsDraft, createStornoDraft } from '@/lib/invoiceClone'

type Line = {
  id: string
  description: string
  quantity: number
  unit_price: number
  tva_rate: number
  total: number
  unit_code?: string
  vat_category?: string
  vat_exemption_reason?: string | null
  discount_percent?: number | null
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
  tva_rate?: number | null
  tva_amount: number
  total: number
  notes?: string | null
  invoice_type_code?: string | null
  currency?: string | null
  payment_means_code?: string | null
  tax_point_date?: string | null
  delivery_date?: string | null
  buyer_reference?: string | null
  order_reference?: string | null
  period_start?: string | null
  period_end?: string | null
  credited_invoice_id?: string | null
  amount_paid?: number | null
  prepaid_amount?: number | null
  discount_percent?: number | null
  efactura_status?: string | null
  clients?: { company_name?: string; cui?: string; email?: string; city?: string } | null
  invoice_items?: Line[]
}

function ron(n: number) {
  return formatRon(n)
}

export default function InvoiceViewPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.id as string
  const { userId, company, ownerUserId, loading: companyLoading } = useCompany()
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
    if (isPurchaseInvoice(data)) {
      router.replace(`/facturi-achizitie/${invoiceId}`)
      return
    }
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
      const created = await createStornoDraft(supabase, { invoice, company, userId: ownerUserId || userId })
      router.push(`/invoices/${created.id}/edit`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Nu s-a putut crea stornoul.')
    } finally {
      setBusy('')
    }
  }

  const copyInvoice = async () => {
    if (!invoice || !userId) return
    if (!confirm(`Creezi o ciornă cu aceleași detalii ca ${invoice.series}${invoice.invoice_number}? Data emiterii și scadența vor fi de azi (+15 zile). Poți edita datele înainte de emitere.`)) return
    setBusy('copy')
    try {
      const created = await copyInvoiceAsDraft(supabase, { invoice, company, userId: ownerUserId || userId })
      router.push(`/invoices/${created.id}/edit`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Nu s-a putut copia factura.')
    } finally {
      setBusy('')
    }
  }

  const viewTotals = invoice
    ? computeInvoiceTotals(invoice.invoice_items || [], invoice)
    : null

  if (loading || !invoice) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-[color:var(--color-muted-foreground)]">Se încarcă...</p>
      </div>
    )
  }

  const status = invoiceStatusAppearance(invoice)
  const typeLabel = INVOICE_TYPE_CODES.find(t => t.code === (invoice.invoice_type_code || '380'))?.label || 'Factură'
  const draft = isDraftInvoice(invoice.status)
  const credit = isCreditNote(invoice.invoice_type_code)
  const canStorno = canCreateStorno(invoice, hasStorno)
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
            ← Facturi emise
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
          {invoice.efactura_status === 'rejected' && <span className="text-xs text-red-500">SPV test · respins</span>}
          {hasStorno && <span className="text-xs text-[color:var(--color-muted-foreground)]">Are storno</span>}
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {draft ? (
            <Link href={`/invoices/${invoice.id}/edit`} className="btn btn-primary">
              Editează
            </Link>
          ) : (
            <button
              className="btn btn-outline"
              onClick={() => downloadInvoicePdf(invoice.id, userId)}
            >
              PDF
            </button>
          )}
          {!draft && invoice.clients?.email && (
            <button
              className="btn btn-outline"
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
            <button className="btn btn-outline" disabled={busy === 'storno'} onClick={createStorno}>
              {busy === 'storno' ? '...' : 'Creează storno'}
            </button>
          )}
          <button className="btn btn-outline" disabled={busy === 'copy'} onClick={copyInvoice}>
            {busy === 'copy' ? '...' : 'Copiază factură'}
          </button>
          {!draft && !credit && invoice.status !== 'paid' && (
            <button className="btn btn-outline" onClick={() => setPayOpen(true)}>
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
                  if (alreadySentToSpv(invoice)) {
                    alert(ALREADY_SENT_TO_SPV)
                    return
                  }
                  if (!confirm('Simulare SPV. Nu se trimite nimic la ANAF.')) return
                  try {
                    const data = await simulateSpvUpload(invoice.id, userId)
                    if (data.executionStatus !== '0' && data.error) {
                      alert(data.error)
                    } else {
                      alert(data.note || 'Simulare finalizată')
                    }
                    if (data.invoicePatch || data.executionStatus === '0') {
                      setInvoice(prev => prev ? {
                        ...prev,
                        status: data.invoicePatch?.status || (prev.status === 'paid' ? 'paid' : 'spv'),
                        efactura_status: data.invoicePatch?.efactura_status ?? (data.executionStatus === '0' ? 'accepted' : prev.efactura_status),
                        notes: data.invoicePatch?.notes ?? prev.notes
                      } : prev)
                    }
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
            <p className="text-sm mt-1">Exigibilitate TVA: {formatRoDate(invoice.tax_point_date || invoice.issue_date)}</p>
            <p className="text-sm mt-1">Scadență: {invoice.due_date ? formatRoDate(invoice.due_date) : '—'}</p>
            {Number(invoice.amount_paid) > 0 && (
              <p className="text-sm mt-1">Încasat: {ron(Number(invoice.amount_paid))} din {ron(Number(invoice.total))}</p>
            )}
            {remainingOf(invoice) > 0 && remainingOf(invoice) < Number(invoice.total) && (
              <p className="text-sm mt-1">Rest: {ron(remainingOf(invoice))}</p>
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
              <span className="col-span-2 text-right">{formatAmount(item.unit_price)}</span>
              <span className="col-span-2 text-right">{formatAmount(item.total)}</span>
            </div>
          ))}
        </div>

        <div className="card p-6 mb-6">
          <div className="flex flex-col items-end gap-1">
            <div className="flex justify-between w-72 text-sm">
              <span className="text-[color:var(--color-muted-foreground)]">Bază</span>
              <span>{ron(viewTotals?.lineExtension ?? invoice.subtotal)}</span>
            </div>
            {(viewTotals?.vatBreakdown || []).map(row => (
              <div key={row.rate} className="flex justify-between w-72 text-sm">
                <span className="text-[color:var(--color-muted-foreground)]">TVA {row.rate}%</span>
                <span>{ron(row.tax)}</span>
              </div>
            ))}
            <div className="flex justify-between w-72 text-base font-bold pt-2 border-t border-gray-100">
              <span>Total</span>
              <span>{ron(viewTotals?.taxInclusive ?? invoice.total)}</span>
            </div>
            {(viewTotals?.prepaid || 0) > 0 && (
              <div className="flex justify-between w-72 text-sm">
                <span className="text-[color:var(--color-muted-foreground)]">Avans</span>
                <span>-{ron(viewTotals!.prepaid)}</span>
              </div>
            )}
          </div>
        </div>

        {notesWithoutSpvMark(invoice.notes) && (
          <div className="card p-6">
            <h3 className="font-bold mb-2">Mențiuni</h3>
            <p className="text-sm text-[color:var(--color-muted-foreground)] whitespace-pre-wrap">{notesWithoutSpvMark(invoice.notes)}</p>
          </div>
        )}
      </div>
      {payOpen && (
        <PaymentModal
          invoice={invoice}
          userId={ownerUserId || userId}
          firmName={company?.company_name}
          onClose={() => setPayOpen(false)}
          onSaved={() => { setPayOpen(false); load() }}
        />
      )}
    </div>
  )
}
