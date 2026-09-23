'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import InvoiceOverflow from '@/components/InvoiceOverflow'
import PaymentModal from '@/components/PaymentModal'
import { formatRoDate } from '@/lib/dates'
import { downloadInvoicePdf, downloadInvoiceXml, sendInvoiceEmail, simulateSpvUpload } from '@/lib/invoiceClient'
import { alreadySentToSpv, invoiceStatusAppearance, isCreditNote, isDraftInvoice, isEfacturaProcessing, isPurchaseInvoice, notesWithoutSpvMark } from '@/lib/invoiceStatus'
import { useLocale } from '@/components/LocaleProvider'
import { invoiceTypeKey } from '@/lib/uiLabels'
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
  efactura_index?: string | null
  efactura_error?: string | null
  efactura_environment?: string | null
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
  const { t } = useLocale()
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
    if (!confirm(t('inv.confirmCredit', { ref: `${invoice.series}${invoice.invoice_number}` }))) return
    setBusy('storno')
    try {
      const created = await createStornoDraft(supabase, { invoice, company, userId: ownerUserId || userId })
      router.push(`/invoices/${created.id}/edit`)
    } catch (e) {
      alert(e instanceof Error ? e.message : t('inv.stornoFail'))
    } finally {
      setBusy('')
    }
  }

  const copyInvoice = async () => {
    if (!invoice || !userId) return
    if (!confirm(t('inv.confirmDuplicate', { ref: `${invoice.series}${invoice.invoice_number}` }))) return
    setBusy('copy')
    try {
      const created = await copyInvoiceAsDraft(supabase, { invoice, company, userId: ownerUserId || userId })
      router.push(`/invoices/${created.id}/edit`)
    } catch (e) {
      alert(e instanceof Error ? e.message : t('inv.copyFail'))
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
        <p className="text-[color:var(--color-muted-foreground)]">{t('common.loading')}</p>
      </div>
    )
  }

  const status = invoiceStatusAppearance(invoice)
  const typeLabel = t(invoiceTypeKey(invoice.invoice_type_code || '380'))
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
            {t('inv.backToIssued')}
          </Link>
        </div>

        {!draft && (
          <div className="card p-4 mb-6 text-sm text-[color:var(--color-muted-foreground)]">
            {t('inv.issuedLocked')}
          </div>
        )}

        {creditedRef && (
          <p className="text-sm mb-4">
            {t('inv.stornoFor')}{' '}
            <Link href={`/invoices/${invoice.credited_invoice_id}`} className="underline">
              {creditedRef}
            </Link>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className={`text-xs px-2 py-1 rounded-lg font-medium ${status.style}`}>{t(status.key)}</span>
          {invoice.efactura_status === 'rejected' && <span className="text-xs text-red-500">{t('inv.rejectedShort')}</span>}
          {isEfacturaProcessing(invoice) && <span className="text-xs text-amber-700">{t('inv.anafWorking')}</span>}
          {invoice.efactura_index && (
            <span className="text-xs font-mono text-[color:var(--color-muted-foreground)]">index {invoice.efactura_index}</span>
          )}
          {hasStorno && <span className="text-xs text-[color:var(--color-muted-foreground)]">{t('inv.hasStorno')}</span>}
        </div>
        {invoice.efactura_error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-6">
            {invoice.efactura_error}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-8">
          {draft ? (
            <Link href={`/invoices/${invoice.id}/edit`} className="btn btn-primary">
              {t('common.edit')}
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
                if (!confirm(t('inv.confirmEmail', { ref: `${invoice.series}${invoice.invoice_number}` }))) return
                setBusy('email')
                try {
                  await sendInvoiceEmail(invoice.id, userId)
                  alert(t('inv.emailSent'))
                  load()
                } catch (e) {
                  alert(e instanceof Error ? e.message : t('inv.emailError'))
                } finally { setBusy('') }
              }}
            >
              {t('inv.sendEmail')}
            </button>
          )}
          {canStorno && (
            <button className="btn btn-outline" disabled={busy === 'storno'} onClick={createStorno}>
              {busy === 'storno' ? '...' : t('inv.createStorno')}
            </button>
          )}
          <button className="btn btn-outline" disabled={busy === 'copy'} onClick={copyInvoice}>
            {busy === 'copy' ? '...' : t('inv.copyInvoice')}
          </button>
          {!draft && !credit && invoice.status !== 'paid' && (
            <button className="btn btn-outline" onClick={() => setPayOpen(true)}>
              {t('inv.collection')}
            </button>
          )}
          <InvoiceOverflow
            actions={[
              {
                label: t('inv.xmlLabel'),
                onClick: async () => {
                  try { await downloadInvoiceXml(invoice.id, userId, filename) }
                  catch (e) { alert(e instanceof Error ? e.message : t('inv.xmlError')) }
                }
              },
              {
                label: isEfacturaProcessing(invoice) ? t('inv.updateAnaf') : t('inv.sendEfactura'),
                onClick: async () => {
                  if (alreadySentToSpv(invoice)) {
                    alert(t('inv.alreadySent'))
                    return
                  }
                  const processing = isEfacturaProcessing(invoice)
                  if (!confirm(processing
                    ? t('inv.confirmStareThis')
                    : t('inv.confirmSpvThis'))) return
                  try {
                    const data = await simulateSpvUpload(invoice.id, userId)
                    if (data.executionStatus !== '0' && data.error) {
                      alert(data.error)
                    } else {
                      alert(data.note || (processing ? t('inv.spvUpdated') : t('inv.spvSent')))
                    }
                    if (data.invoicePatch || data.executionStatus === '0') {
                      setInvoice(prev => prev ? {
                        ...prev,
                        status: data.invoicePatch?.status || prev.status,
                        efactura_status: data.invoicePatch?.efactura_status ?? prev.efactura_status,
                        efactura_index: data.invoicePatch?.efactura_index ?? prev.efactura_index,
                        efactura_error: data.invoicePatch?.efactura_error ?? prev.efactura_error,
                        notes: data.invoicePatch?.notes ?? prev.notes
                      } : prev)
                    }
                    load()
                  } catch (e) {
                    alert(e instanceof Error ? e.message : t('inv.efacturaError'))
                  }
                }
              }
            ]}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="card p-6">
            <h3 className="font-bold mb-3">{t('common.client')}</h3>
            <p className="text-sm">{invoice.clients?.company_name || '—'}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
              {t('cli.cui')}: {invoice.clients?.cui || '—'} · {invoice.clients?.city || '—'}
            </p>
          </div>
          <div className="card p-6">
            <h3 className="font-bold mb-3">{t('common.dates')}</h3>
            <p className="text-sm">{t('inv.issuedOn', { date: formatRoDate(invoice.issue_date) })}</p>
            <p className="text-sm mt-1">{t('inv.vatPointOn', { date: formatRoDate(invoice.tax_point_date || invoice.issue_date) })}</p>
            <p className="text-sm mt-1">{t('inv.dueOn', { date: invoice.due_date ? formatRoDate(invoice.due_date) : '—' })}</p>
            {Number(invoice.amount_paid) > 0 && (
              <p className="text-sm mt-1">{t('inv.collectedOf', { paid: ron(Number(invoice.amount_paid)), total: ron(Number(invoice.total)) })}</p>
            )}
            {remainingOf(invoice) > 0 && remainingOf(invoice) < Number(invoice.total) && (
              <p className="text-sm mt-1">{t('inv.remaining', { amount: ron(remainingOf(invoice)) })}</p>
            )}
          </div>
        </div>

        <div className="card overflow-hidden mb-6">
          <div className="grid grid-cols-12 px-6 py-3 border-b border-gray-100 text-xs text-[color:var(--color-muted-foreground)]">
            <span className="col-span-6">{t('inv.description')}</span>
            <span className="col-span-2 text-right">{t('inv.qty')}</span>
            <span className="col-span-2 text-right">{t('common.price')}</span>
            <span className="col-span-2 text-right">{t('common.total')}</span>
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
              <span className="text-[color:var(--color-muted-foreground)]">{t('inv.base')}</span>
              <span>{ron(viewTotals?.lineExtension ?? invoice.subtotal)}</span>
            </div>
            {(viewTotals?.vatBreakdown || []).map(row => (
              <div key={row.rate} className="flex justify-between w-72 text-sm">
                <span className="text-[color:var(--color-muted-foreground)]">{t('inv.vatOnly', { rate: row.rate })}</span>
                <span>{ron(row.tax)}</span>
              </div>
            ))}
            <div className="flex justify-between w-72 text-base font-bold pt-2 border-t border-gray-100">
              <span>{t('common.total')}</span>
              <span>{ron(viewTotals?.taxInclusive ?? invoice.total)}</span>
            </div>
            {(viewTotals?.prepaid || 0) > 0 && (
              <div className="flex justify-between w-72 text-sm">
                <span className="text-[color:var(--color-muted-foreground)]">{t('inv.advance')}</span>
                <span>-{ron(viewTotals!.prepaid)}</span>
              </div>
            )}
          </div>
        </div>

        {notesWithoutSpvMark(invoice.notes) && (
          <div className="card p-6">
            <h3 className="font-bold mb-2">{t('inv.notes')}</h3>
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
