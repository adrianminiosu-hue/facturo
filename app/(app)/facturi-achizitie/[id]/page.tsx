'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { supabase } from '@/lib/supabase'
import { formatRoDate } from '@/lib/dates'
import { formatAmount, formatRon } from '@/lib/money'
import { openPurchaseInvoicePdf } from '@/lib/invoiceClient'
import { isPurchaseInvoice } from '@/lib/invoiceStatus'
import { purchaseInvoiceFromRow } from '@/lib/purchaseInvoicePersist'
import { computeInvoiceTotals } from '@/lib/invoiceMath'
import type { SimulatedPurchaseInvoice } from '@/lib/efacturaPurchaseImport'

type Line = {
  id: string
  description: string
  quantity: number
  unit_price: number
  tva_rate: number
  total: number
  unit_code?: string
}

export default function PurchaseInvoiceViewPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.id as string
  const { userId, company, loading: companyLoading } = useCompany()
  const [invoice, setInvoice] = useState<SimulatedPurchaseInvoice | null>(null)
  const [items, setItems] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)
  const [sealOpen, setSealOpen] = useState(false)

  const load = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('*, clients(*), invoice_items(*)')
      .eq('id', invoiceId)
      .single()
    if (!data) { router.push('/facturi-achizitie'); return }
    if (!isPurchaseInvoice(data)) {
      router.replace(`/invoices/${invoiceId}`)
      return
    }
    if (data.company_id && company?.id && data.company_id !== company.id) {
      router.push('/facturi-achizitie')
      return
    }
    setInvoice(purchaseInvoiceFromRow({ invoice: data, buyer: company }))
    setItems((data.invoice_items || []) as Line[])
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

  if (loading || !invoice) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-[color:var(--color-muted-foreground)]">Se încarcă...</p>
      </div>
    )
  }

  const totals = computeInvoiceTotals(items, {})

  return (
    <div className="app-shell">
      <AppNav active="purchase-invoices" />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="kicker mb-2">Factură de achiziție</p>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">
              {invoice.series}{invoice.invoiceNumber}
            </h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              {invoice.supplierName} · {formatRoDate(invoice.issueDate)}
            </p>
          </div>
          <Link href="/facturi-achizitie" className="text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]">
            ← Facturi de achiziție
          </Link>
        </div>

        <div className="card p-4 mb-6 text-sm text-[color:var(--color-muted-foreground)]">
          Document înregistrat din e-Factura SPV (simulare test). Nu se editează — rămâne ca înregistrare de achiziție.
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs px-2 py-1 rounded-lg font-medium bg-teal-50 text-teal-700">În e-Factura</span>
          <span className="text-xs text-[color:var(--color-muted-foreground)]">Înregistrată</span>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          <button
            className="btn btn-outline"
            onClick={() => openPurchaseInvoicePdf(invoice.id, userId, company?.id)}
          >
            Deschide PDF
          </button>
          <button className="btn btn-outline" onClick={() => setSealOpen(true)}>
            Sigiliu e-Factura
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="card p-6">
            <h3 className="font-bold mb-3">Furnizor</h3>
            <p className="text-sm">{invoice.supplierName}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
              CUI: {invoice.supplierCui || '—'} · {invoice.supplierAddress || '—'}
            </p>
          </div>
          <div className="card p-6">
            <h3 className="font-bold mb-3">Cumpărător</h3>
            <p className="text-sm">{invoice.buyerName}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
              CUI: {invoice.buyerCui || '—'} · {invoice.buyerAddress || '—'}
            </p>
            <p className="text-sm mt-3">Emisă: {formatRoDate(invoice.issueDate)}</p>
            <p className="text-sm mt-1">Scadență: {formatRoDate(invoice.dueDate)}</p>
          </div>
        </div>

        <div className="card overflow-hidden mb-6">
          <div className="grid grid-cols-12 px-6 py-3 border-b border-gray-100 text-xs text-[color:var(--color-muted-foreground)]">
            <span className="col-span-6">Descriere</span>
            <span className="col-span-2 text-right">Cant.</span>
            <span className="col-span-2 text-right">Preț</span>
            <span className="col-span-2 text-right">Total</span>
          </div>
          {items.map(item => (
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
              <span>{formatRon(totals.lineExtension)}</span>
            </div>
            {totals.vatBreakdown.map(row => (
              <div key={row.rate} className="flex justify-between w-72 text-sm">
                <span className="text-[color:var(--color-muted-foreground)]">TVA {row.rate}%</span>
                <span>{formatRon(row.tax)}</span>
              </div>
            ))}
            <div className="flex justify-between w-72 text-base font-bold pt-2 border-t border-gray-100">
              <span>Total</span>
              <span>{formatRon(totals.taxInclusive)}</span>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-bold mb-2">Mențiuni</h3>
          <p className="text-sm text-[color:var(--color-muted-foreground)]">
            Înregistrată din e-Factura SPV (simulare test).
          </p>
        </div>
      </div>

      {sealOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setSealOpen(false)}>
          <div className="card max-w-lg w-full p-6" onClick={event => event.stopPropagation()}>
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] border-teal-700 bg-teal-50 text-teal-700 text-2xl">
                ✓
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-teal-700 font-semibold">Sigiliu electronic e-Factura</p>
                <h3 className="text-xl text-[color:var(--color-foreground)] mt-1">Valid</h3>
                <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
                  {invoice.series}{invoice.invoiceNumber} · {invoice.supplierName}
                </p>
              </div>
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">Cumpărător</dt>
                <dd className="text-right font-medium">{invoice.buyerName} · {invoice.buyerCui}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">Index încărcare</dt>
                <dd className="text-right font-mono text-xs">{invoice.indexIncarcare}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">Id descărcare</dt>
                <dd className="text-right font-mono text-xs">{invoice.idDescarcare}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">Serial</dt>
                <dd className="text-right font-mono text-xs">{invoice.seal.serial}</dd>
              </div>
              <div>
                <dt className="text-[color:var(--color-muted-foreground)]">{invoice.seal.algorithm}</dt>
                <dd className="mt-1 break-all font-mono text-xs">{invoice.seal.digest}</dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => setSealOpen(false)} className="btn btn-primary">Închide</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
