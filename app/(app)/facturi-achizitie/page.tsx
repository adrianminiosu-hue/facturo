'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { supabase } from '@/lib/supabase'
import { formatRoDate } from '@/lib/dates'
import { formatRon } from '@/lib/money'
import { importPurchaseInvoicesFromEfactura, openPurchaseInvoicePdf } from '@/lib/invoiceClient'
import { isPurchaseInvoice } from '@/lib/invoiceStatus'
import { purchaseInvoiceFromRow } from '@/lib/purchaseInvoicePersist'
import type { SimulatedPurchaseInvoice } from '@/lib/efacturaPurchaseImport'

const LIST_GRID = 'grid w-full grid-cols-[6.5rem_minmax(0,1fr)_7rem_8.5rem_8rem_minmax(10rem,auto)] gap-x-4 px-6'

export default function PurchaseInvoicesPage() {
  const router = useRouter()
  const { userId, company, ownerUserId, loading: companyLoading } = useCompany()
  const [invoices, setInvoices] = useState<SimulatedPurchaseInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importNote, setImportNote] = useState('')
  const [sealInvoice, setSealInvoice] = useState<SimulatedPurchaseInvoice | null>(null)

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await loadInvoices()
    }
    init()
  }, [companyLoading, userId, company?.id, router])

  const loadInvoices = async () => {
    let query = supabase
      .from('invoices')
      .select('*, clients(*), invoice_items(*)')
      .order('issue_date', { ascending: false })
    query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', ownerUserId || userId)
    const { data } = await query
    const rows = ((data || []) as Record<string, any>[])
      .filter(isPurchaseInvoice)
      .map(row => purchaseInvoiceFromRow({ invoice: row, buyer: company }))
    setInvoices(rows)
    setLoading(false)
  }

  const importFromEfactura = async () => {
    const companyName = company?.company_name || 'firma curentă'
    if (!confirm(`Simulezi interogarea e-Factura SPV (mediu TEST) pentru facturile de achiziție primite pe ${companyName}?\n\nNu se folosește certificat și nu se trimite nimic la ANAF. Facturile găsite se înregistrează în baza de date.`)) return
    setImporting(true)
    try {
      const data = await importPurchaseInvoicesFromEfactura(userId, company)
      await loadInvoices()
      setImportNote(data.note)
      const added = data.added ?? data.invoices.length
      const catalogInserted = data.catalogInserted || 0
      const catalogNote = catalogInserted
        ? ` ${catalogInserted} ${catalogInserted === 1 ? 'articol nou a fost adăugat' : 'articole noi au fost adăugate'} în nomenclator.`
        : ' Articolele din facturi erau deja în nomenclator.'
      if (added === 0) {
        alert(`e-Factura a returnat ${data.count} facturi pe ${data.buyerName}. Erau deja înregistrate.${catalogNote}`)
      } else {
        alert(`Au fost înregistrate ${added} facturi din e-Factura pe numele ${data.buyerName}.${catalogNote}`)
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Eroare interogare e-Factura')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="app-shell">
      <AppNav active="purchase-invoices" />
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">Facturi de achiziție</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              {company?.company_name
                ? `Facturi primite pe ${company.company_name}${company.cui ? ` · ${company.cui}` : ''}`
                : 'Facturi primite de la furnizori prin e-Factura'}
            </p>
          </div>
          <button
            type="button"
            onClick={importFromEfactura}
            disabled={importing || !userId}
            className="btn btn-primary whitespace-nowrap disabled:opacity-50"
          >
            {importing ? 'Se interoghează e-Factura...' : 'Importă facturi din e-Factura'}
          </button>
        </div>

        {loading ? (
          <p className="text-[color:var(--color-muted-foreground)] text-center py-12">Se încarcă...</p>
        ) : invoices.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="font-medium text-[color:var(--color-foreground)]">Nicio factură de achiziție încă</p>
            <p className="text-[color:var(--color-muted-foreground)] text-sm mt-1 mb-4">
              Interoghează e-Factura SPV și înregistrează facturile primite pe numele firmei active.
            </p>
            <button
              type="button"
              onClick={importFromEfactura}
              disabled={importing || !userId}
              className="btn btn-primary disabled:opacity-50"
            >
              {importing ? 'Se interoghează e-Factura...' : 'Importă facturi din e-Factura'}
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mb-2">
              {invoices.length} facturi înregistrate pe {invoices[0].buyerName} · {invoices[0].buyerCui}
            </p>
            {importNote && (
              <p className="text-xs text-[color:var(--color-muted-foreground)] mb-3">{importNote}</p>
            )}
            <div className="card overflow-hidden">
              <div className={`${LIST_GRID} py-1.5 border-b border-gray-50 items-center`}>
                <span className="text-xs font-medium text-gray-400">NUMĂR</span>
                <span className="text-xs font-medium text-gray-400">FURNIZOR</span>
                <span className="text-xs font-medium text-gray-400">DATA</span>
                <span className="text-xs font-medium text-gray-400">SPV</span>
                <span className="text-xs font-medium text-gray-400 text-right">TOTAL</span>
                <span className="text-xs font-medium text-gray-400 text-right">ACȚIUNI</span>
              </div>
              {invoices.map((invoice, i) => (
                <div
                  key={invoice.id}
                  className={`${LIST_GRID} py-2 items-center ${i !== invoices.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <Link
                    href={`/facturi-achizitie/${invoice.id}`}
                    className="text-sm font-medium text-[color:var(--color-foreground)] hover:underline"
                  >
                    {invoice.series}{invoice.invoiceNumber}
                  </Link>
                  <span className="text-sm text-[color:var(--color-muted-foreground)] truncate" title={invoice.supplierName}>
                    {invoice.supplierName}
                  </span>
                  <span className="text-sm text-[color:var(--color-muted-foreground)]">{formatRoDate(invoice.issueDate)}</span>
                  <span className="inline-block text-xs px-2 py-1 rounded-lg font-medium bg-teal-50 text-teal-700 w-fit">
                    În e-Factura
                  </span>
                  <span className="text-sm font-medium text-[color:var(--color-foreground)] text-right whitespace-nowrap tabular-nums">
                    {formatRon(invoice.total)}
                  </span>
                  <div className="flex flex-nowrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openPurchaseInvoicePdf(invoice.id, userId, company?.id)}
                      className="text-xs border border-gray-200 text-gray-600 px-2 py-0.5 rounded-lg hover:bg-gray-50 transition leading-tight"
                    >
                      Deschide PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setSealInvoice(invoice)}
                      className="text-xs border border-teal-200 text-teal-700 px-2 py-0.5 rounded-lg hover:bg-teal-50 transition leading-tight"
                    >
                      Sigiliu
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {sealInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setSealInvoice(null)}>
          <div className="card max-w-lg w-full p-6" onClick={event => event.stopPropagation()}>
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] border-teal-700 bg-teal-50 text-teal-700 text-2xl">
                ✓
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-teal-700 font-semibold">Sigiliu electronic e-Factura</p>
                <h3 className="text-xl text-[color:var(--color-foreground)] mt-1">Valid</h3>
                <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
                  {sealInvoice.series}{sealInvoice.invoiceNumber} · {sealInvoice.supplierName}
                </p>
              </div>
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">Cumpărător</dt>
                <dd className="text-right font-medium">{sealInvoice.buyerName} · {sealInvoice.buyerCui}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">Emitent</dt>
                <dd className="text-right">{sealInvoice.seal.issuer}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">Certificat</dt>
                <dd className="text-right text-xs">{sealInvoice.seal.certificate}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">Serial</dt>
                <dd className="text-right font-mono text-xs">{sealInvoice.seal.serial}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">Semnat</dt>
                <dd className="text-right">{sealInvoice.seal.signedAt}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">Index încărcare</dt>
                <dd className="text-right font-mono text-xs">{sealInvoice.indexIncarcare}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">Id descărcare</dt>
                <dd className="text-right font-mono text-xs">{sealInvoice.idDescarcare}</dd>
              </div>
              <div>
                <dt className="text-[color:var(--color-muted-foreground)]">{sealInvoice.seal.algorithm}</dt>
                <dd className="mt-1 break-all font-mono text-xs text-[color:var(--color-foreground)]">{sealInvoice.seal.digest}</dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => openPurchaseInvoicePdf(sealInvoice.id, userId, company?.id)}
                className="btn btn-outline"
              >
                Deschide PDF
              </button>
              <button type="button" onClick={() => setSealInvoice(null)} className="btn btn-primary">
                Închide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
