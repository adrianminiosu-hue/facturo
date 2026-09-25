'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { supabase } from '@/lib/supabase'
import { addDaysIso, calendarDateInBucharest, formatRoDate, startOfIsoWeek } from '@/lib/dates'
import { formatRon } from '@/lib/money'
import { importPurchaseInvoicesFromEfactura, openPurchaseInvoicePdf } from '@/lib/invoiceClient'
import { isPurchaseInvoice } from '@/lib/invoiceStatus'
import { purchaseInvoiceFromRow } from '@/lib/purchaseInvoicePersist'
import type { SimulatedPurchaseInvoice } from '@/lib/efacturaPurchaseImport'
import { paymentStatusKey } from '@/lib/bank/labels'
import { useLocale } from '@/components/LocaleProvider'
import type { MessageKey } from '@/lib/messages'

const LIST_GRID = 'grid w-full grid-cols-[6.5rem_minmax(0,1fr)_7rem_8.5rem_7rem_8rem_minmax(10rem,auto)] gap-x-4 px-6'
const PAGE_SIZE = 20
const STATUS_FILTER_IDS = ['', 'unpaid', 'partial', 'paid'] as const
type IssuePeriodId = 'issued_0_2' | 'this_week' | 'last_7' | 'last_14' | 'last_30'

const ISSUE_PERIODS: { id: IssuePeriodId; key: MessageKey }[] = [
  { id: 'issued_0_2', key: 'inv.issued02' },
  { id: 'this_week', key: 'inv.issuedThisWeek' },
  { id: 'last_7', key: 'inv.issuedLast7' },
  { id: 'last_14', key: 'inv.issuedLast14' },
  { id: 'last_30', key: 'inv.issuedLast30' }
]

function issuePeriodRange(id: IssuePeriodId, today = calendarDateInBucharest(0)) {
  if (id === 'issued_0_2') return { from: calendarDateInBucharest(-2), to: today }
  if (id === 'this_week') {
    const from = startOfIsoWeek(today)
    return { from, to: addDaysIso(from, 6) }
  }
  if (id === 'last_7') return { from: calendarDateInBucharest(-6), to: today }
  if (id === 'last_14') return { from: calendarDateInBucharest(-13), to: today }
  return { from: calendarDateInBucharest(-29), to: today }
}

function parseDate(value: string) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function paymentOf(invoice: SimulatedPurchaseInvoice) {
  return invoice.paymentStatus || 'unpaid'
}

function PurchaseStatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card flex h-full min-h-[8.5rem] flex-col justify-between p-6">
      <p className="text-sm leading-5 text-[color:var(--color-muted-foreground)]">{label}</p>
      <p className="mt-3 text-[clamp(1.25rem,1.1vw+0.9rem,1.75rem)] font-bold leading-none tabular-nums whitespace-nowrap text-[color:var(--color-foreground)]">
        {value}
      </p>
    </div>
  )
}

export default function PurchaseInvoicesPage() {
  const router = useRouter()
  const { t } = useLocale()
  const { userId, company, ownerUserId, loading: companyLoading } = useCompany()
  const [invoices, setInvoices] = useState<SimulatedPurchaseInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importNote, setImportNote] = useState('')
  const [sealInvoice, setSealInvoice] = useState<SimulatedPurchaseInvoice | null>(null)
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [issuePeriod, setIssuePeriod] = useState<IssuePeriodId | ''>('')
  const [page, setPage] = useState(1)

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
    const companyName = company?.company_name || t('pur.currentFirm')
    if (!confirm(t('pur.confirmImport', { name: companyName }))) return
    setImporting(true)
    try {
      const data = await importPurchaseInvoicesFromEfactura(userId, company)
      await loadInvoices()
      setImportNote(data.note)
      const added = data.added ?? data.invoices.length
      const catalogInserted = data.catalogInserted || 0
      const catalogNote = catalogInserted
        ? (catalogInserted === 1 ? t('pur.catalogOne') : t('pur.catalogMany', { count: catalogInserted }))
        : t('pur.catalogNone')
      if (added === 0) {
        alert(t('pur.already', { count: data.count, name: data.buyerName, catalog: catalogNote }))
      } else {
        alert(t('pur.added', { added, name: data.buyerName, catalog: catalogNote }))
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : t('pur.queryError'))
    } finally {
      setImporting(false)
    }
  }

  const resetFilters = () => {
    setFilterSupplier('')
    setFilterStatus('')
    setFilterFrom('')
    setFilterTo('')
    setIssuePeriod('')
  }

  const applyIssuePeriod = (id: IssuePeriodId) => {
    const range = issuePeriodRange(id)
    setIssuePeriod(id)
    setFilterFrom(range.from)
    setFilterTo(range.to)
  }

  const fromDate = filterFrom ? parseDate(filterFrom) : null
  const toDate = filterTo ? parseDate(filterTo) : null
  const filteredInvoices = invoices.filter(invoice => {
    if (filterSupplier && invoice.supplierCui !== filterSupplier) return false
    if (filterStatus && paymentOf(invoice) !== filterStatus) return false
    if (fromDate || toDate) {
      const invDate = invoice.issueDate ? parseDate(invoice.issueDate) : null
      if (!invDate) return false
      if (fromDate && invDate < fromDate) return false
      if (toDate) {
        const end = new Date(toDate)
        end.setHours(23, 59, 59, 999)
        if (invDate > end) return false
      }
    }
    return true
  })

  const filtersActive = !!filterSupplier || !!filterStatus || !!filterFrom || !!filterTo
  const pageCount = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pagedInvoices = filteredInvoices.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [filterSupplier, filterStatus, filterFrom, filterTo, company?.id])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const supplierOptions = Array.from(
    new Map(
      invoices
        .filter(inv => inv.supplierCui && inv.supplierName)
        .map(inv => [inv.supplierCui, inv.supplierName])
    ).entries()
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const totalValue = filteredInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0)
  const unpaidCount = filteredInvoices.filter(inv => paymentOf(inv) !== 'paid').length
  const today = calendarDateInBucharest(0)
  const monthStart = `${today.slice(0, 8)}01`
  const billedThisMonth = invoices
    .filter(inv => inv.issueDate >= monthStart && inv.issueDate <= today)
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0)

  return (
    <div className="app-shell">
      <AppNav active="purchase-invoices" />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="page-toolbar">
          <div>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">{t('pur.title')}</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              {invoices.length === 0
                ? t('pur.receivedLead')
                : (
                  <>
                    {filtersActive
                      ? t('inv.countFiltered', { count: filteredInvoices.length, total: invoices.length })
                      : t('pur.registeredOn', { count: invoices.length, name: invoices[0].buyerName, cui: invoices[0].buyerCui })}
                    {' · '}
                    {t('pur.unpaidCount', { count: unpaidCount })}
                  </>
                )}
            </p>
          </div>
          <button
            type="button"
            onClick={importFromEfactura}
            disabled={importing || !userId}
            className="btn btn-primary whitespace-nowrap disabled:opacity-50"
          >
            {importing ? t('pur.importing') : t('pur.import')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 items-stretch">
          <PurchaseStatCard label={t('inv.totalInvoices')} value={filteredInvoices.length} />
          <PurchaseStatCard label={t('inv.totalValue')} value={formatRon(totalValue)} />
          <PurchaseStatCard label={t('pur.monthValue')} value={formatRon(billedThisMonth)} />
        </div>

        {loading ? (
          <p className="text-[color:var(--color-muted-foreground)] text-center py-12">{t('common.loading')}</p>
        ) : invoices.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="font-medium text-[color:var(--color-foreground)]">{t('pur.empty')}</p>
            <p className="text-[color:var(--color-muted-foreground)] text-sm mt-1 mb-4">
              {t('pur.emptyLead')}
            </p>
            <button
              type="button"
              onClick={importFromEfactura}
              disabled={importing || !userId}
              className="btn btn-primary disabled:opacity-50"
            >
              {importing ? t('pur.importing') : t('pur.import')}
            </button>
          </div>
        ) : (
          <>
            {importNote && (
              <p className="text-xs text-[color:var(--color-muted-foreground)] mb-3">{importNote}</p>
            )}
            <div className="card p-4 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('pur.supplier')}</label>
                  <select
                    value={filterSupplier}
                    onChange={e => setFilterSupplier(e.target.value)}
                    className="input bg-white px-3 py-2.5"
                  >
                    <option value="">{t('pur.allSuppliers')}</option>
                    {supplierOptions.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('common.status')}</label>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="input bg-white px-3 py-2.5"
                  >
                    {STATUS_FILTER_IDS.map(id => (
                      <option key={id || 'all'} value={id}>
                        {id ? t(paymentStatusKey(id) as MessageKey) : t('common.all')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('inv.from')}</label>
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={e => { setIssuePeriod(''); setFilterFrom(e.target.value) }}
                    className="input px-3 py-2.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('inv.to')}</label>
                  <input
                    type="date"
                    value={filterTo}
                    onChange={e => { setIssuePeriod(''); setFilterTo(e.target.value) }}
                    className="input px-3 py-2.5"
                  />
                </div>
                <div className="flex gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={resetFilters}
                    disabled={!filtersActive}
                    className="btn btn-outline disabled:opacity-50"
                  >
                    {t('inv.reset')}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {ISSUE_PERIODS.map(period => (
                  <button
                    key={period.id}
                    type="button"
                    onClick={() => applyIssuePeriod(period.id)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      issuePeriod === period.id
                        ? 'bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] border-transparent'
                        : 'border-[color:var(--color-border)] text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]'
                    }`}
                  >
                    {t(period.key)}
                  </button>
                ))}
              </div>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="card p-12 text-center">
                <p className="text-[color:var(--color-muted-foreground)]">{t('inv.noFilterMatch')}</p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="font-medium text-sm mt-2 inline-block hover:underline text-[color:var(--color-foreground)]"
                >
                  {t('inv.resetFiltersArrow')}
                </button>
              </div>
            ) : (
            <>
            <div className="card overflow-hidden">
              <div className={`${LIST_GRID} list-head py-1.5 border-b border-gray-50 items-center`}>
                <span className="text-xs font-medium text-gray-400">{t('common.number')}</span>
                <span className="text-xs font-medium text-gray-400">{t('pur.supplier')}</span>
                <span className="text-xs font-medium text-gray-400">{t('common.date')}</span>
                <span className="text-xs font-medium text-gray-400">SPV</span>
                <span className="text-xs font-medium text-gray-400">{t('bank.pay.status')}</span>
                <span className="text-xs font-medium text-gray-400 text-right">{t('common.total')}</span>
                <span className="text-xs font-medium text-gray-400 text-right">{t('common.actions')}</span>
              </div>
              {pagedInvoices.map((invoice, i) => (
                <div
                  key={invoice.id}
                  className={`${LIST_GRID} list-row list-row-purchases py-2 items-center ${i !== pagedInvoices.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <Link
                    href={`/facturi-achizitie/${invoice.id}`}
                    className="list-cell-title text-sm font-medium text-[color:var(--color-foreground)] hover:underline"
                  >
                    {invoice.series}{invoice.invoiceNumber}
                  </Link>
                  <span className="list-cell-sub text-sm text-[color:var(--color-muted-foreground)] truncate" title={invoice.supplierName}>
                    {invoice.supplierName}
                  </span>
                  <span className="list-cell-meta text-sm text-[color:var(--color-muted-foreground)]">{formatRoDate(invoice.issueDate)}</span>
                  <span className="list-cell-status inline-block text-xs px-2 py-1 rounded-lg font-medium bg-teal-50 text-teal-700 w-fit">
                    {t('pur.inEfactura')}
                  </span>
                  <span className="list-cell-extra text-xs text-[color:var(--color-muted-foreground)]">
                    {t(paymentStatusKey(invoice.paymentStatus) as MessageKey)}
                  </span>
                  <span className="list-cell-amount text-sm font-medium text-[color:var(--color-foreground)] text-right whitespace-nowrap tabular-nums">
                    {formatRon(invoice.total)}
                  </span>
                  <div className="list-cell-actions flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openPurchaseInvoicePdf(invoice.id, userId, company?.id)}
                      className="text-xs border border-gray-200 text-gray-600 px-2 py-0.5 rounded-lg hover:bg-gray-50 transition leading-tight"
                    >
                      {t('common.open')} PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setSealInvoice(invoice)}
                      className="text-xs border border-teal-200 text-teal-700 px-2 py-0.5 rounded-lg hover:bg-teal-50 transition leading-tight"
                    >
                      {t('pur.sealShort')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {pageCount > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
                <p className="text-xs text-[color:var(--color-muted-foreground)]">
                  {t('inv.range', {
                    from: (currentPage - 1) * PAGE_SIZE + 1,
                    to: Math.min(currentPage * PAGE_SIZE, filteredInvoices.length),
                    total: filteredInvoices.length
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    aria-label={t('common.prev')}
                    className="btn btn-outline text-sm px-3 py-1.5 disabled:opacity-40"
                  >
                    ←
                  </button>
                  <span className="text-sm text-[color:var(--color-foreground)] tabular-nums">
                    {t('common.pageOf', { page: currentPage, pages: pageCount })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                    disabled={currentPage >= pageCount}
                    aria-label={t('common.next')}
                    className="btn btn-outline text-sm px-3 py-1.5 disabled:opacity-40"
                  >
                    →
                  </button>
                </div>
              </div>
            )}
            </>
            )}
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
                <p className="text-xs uppercase tracking-wide text-teal-700 font-semibold">{t('pur.seal')}</p>
                <h3 className="text-xl text-[color:var(--color-foreground)] mt-1">{t('pur.valid')}</h3>
                <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
                  {sealInvoice.series}{sealInvoice.invoiceNumber} · {sealInvoice.supplierName}
                </p>
              </div>
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">{t('pur.buyer')}</dt>
                <dd className="text-right font-medium">{sealInvoice.buyerName} · {sealInvoice.buyerCui}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">{t('pur.issuer')}</dt>
                <dd className="text-right">{sealInvoice.seal.issuer}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">{t('pur.certificate')}</dt>
                <dd className="text-right text-xs">{sealInvoice.seal.certificate}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">{t('pur.serial')}</dt>
                <dd className="text-right font-mono text-xs">{sealInvoice.seal.serial}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">{t('pur.signed')}</dt>
                <dd className="text-right">{sealInvoice.seal.signedAt}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">{t('pur.uploadIndex')}</dt>
                <dd className="text-right font-mono text-xs">{sealInvoice.indexIncarcare}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--color-muted-foreground)]">{t('pur.downloadId')}</dt>
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
                {t('common.open')} PDF
              </button>
              <button type="button" onClick={() => setSealInvoice(null)} className="btn btn-primary">
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
