'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import InvoiceOverflow from '@/components/InvoiceOverflow'
import { downloadInvoicePdf, downloadInvoiceXml, sendInvoiceEmail, simulateSpvUpload } from '@/lib/invoiceClient'
import type { BulkSpvOutcome, BulkSpvResultItem, SimulatedSpvUpload } from '@/lib/invoiceClient'
import { calendarDateInBucharest } from '@/lib/dates'
import { formatRon } from '@/lib/money'
import { canCreateStorno, copyInvoiceAsDraft, createStornoDraft, loadInvoiceForClone } from '@/lib/invoiceClone'
import { ALREADY_SENT_TO_SPV, alreadySentToSpv, canSendToEfactura, INVOICE_STATUS_LABEL, invoiceStatusAppearance, isCreditNote, isDraftInvoice, isEfacturaProcessing, isOpenReceivable, isPurchaseInvoice } from '@/lib/invoiceStatus'

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
  notes?: string | null
  invoice_type_code?: string | null
  credited_invoice_id?: string | null
}

const LIST_GRID = 'grid w-full grid-cols-[2rem_6.5rem_minmax(0,1fr)_7rem_7.5rem_8rem_minmax(6.5rem,auto)] gap-x-4 px-6'
const PAGE_SIZE = 20

const STATUS_FILTERS = [
  { id: '', label: 'Toate' },
  { id: 'draft', label: INVOICE_STATUS_LABEL.draft.label },
  { id: 'sent', label: INVOICE_STATUS_LABEL.sent.label },
  { id: 'spv', label: INVOICE_STATUS_LABEL.spv.label },
  { id: 'paid', label: INVOICE_STATUS_LABEL.paid.label },
  { id: 'overdue', label: INVOICE_STATUS_LABEL.overdue.label }
] as const

function matchesStatusFilter(invoice: Invoice, filter: string) {
  if (!filter) return true
  const label = invoiceStatusAppearance(invoice).label
  if (filter === 'paid') return invoice.status === 'paid'
  if (filter === 'spv') return alreadySentToSpv(invoice)
  return label === INVOICE_STATUS_LABEL[filter]?.label
}

function invoiceRef(invoice: Invoice) {
  return `${invoice.series}${invoice.invoice_number}`
}

const OUTCOME_LABEL: Record<BulkSpvOutcome, { label: string; style: string }> = {
  accepted: { label: 'Acceptat', style: 'text-green-600' },
  rejected: { label: 'Respins', style: 'text-red-500' },
  skipped: { label: 'Omis', style: 'text-[color:var(--color-muted-foreground)]' },
  error: { label: 'Eroare', style: 'text-red-500' },
  processing: { label: 'În prelucrare', style: 'text-amber-700' }
}

export default function Invoices() {
  const router = useRouter()
  const { userId, company, ownerUserId, loading: companyLoading } = useCompany()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [filterClientId, setFilterClientId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [spvBusyId, setSpvBusyId] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; invoiceRef: string } | null>(null)
  const [bulkSummary, setBulkSummary] = useState<{
    note: string
    results: BulkSpvResultItem[]
  } | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const [spvResult, setSpvResult] = useState<SimulatedSpvUpload | null>(null)
  const [page, setPage] = useState(1)
  const [hasStornoIds, setHasStornoIds] = useState<Set<string>>(new Set())
  const [actionBusyId, setActionBusyId] = useState('')

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
    query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', ownerUserId || userId)
    const { data } = await query
    const rows = ((data || []) as Invoice[]).filter(inv => !isPurchaseInvoice(inv))
    setInvoices(rows)
    const originals = rows
      .filter(inv => !isDraftInvoice(inv.status) && !isCreditNote(inv.invoice_type_code))
      .map(inv => inv.id)
    const stornoIds = new Set<string>()
    for (let i = 0; i < originals.length; i += 100) {
      const chunk = originals.slice(i, i + 100)
      const { data: credits } = await supabase
        .from('invoices')
        .select('credited_invoice_id')
        .in('credited_invoice_id', chunk)
      for (const row of credits || []) {
        if (row.credited_invoice_id) stornoIds.add(row.credited_invoice_id as string)
      }
    }
    setHasStornoIds(stornoIds)
    setLoading(false)
  }

  const runXml = async (invoice: Invoice) => {
    try {
      await downloadInvoiceXml(invoice.id, userId, `e-Factura-${invoice.series}${invoice.invoice_number}.xml`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Eroare XML')
    }
  }

  const sendToSpvTest = async (invoice: Invoice) => {
    if (alreadySentToSpv(invoice)) {
      alert(ALREADY_SENT_TO_SPV)
      return
    }
    const processing = isEfacturaProcessing(invoice)
    if (!processing && !canSendToEfactura(invoice)) return
    if (!confirm(processing
      ? `Actualizezi starea ANAF pentru ${invoice.series}${invoice.invoice_number}?`
      : `Trimiți ${invoice.series}${invoice.invoice_number} în e-Factura TEST?`)) return
    setSpvBusyId(invoice.id)
    try {
      const data = await simulateSpvUpload(invoice.id, userId)
      if (data.executionStatus === '0') {
        setInvoices(prev => prev.map(inv => inv.id === invoice.id ? {
          ...inv,
          status: data.invoicePatch?.status || inv.status,
          efactura_status: data.invoicePatch?.efactura_status ?? inv.efactura_status,
          efactura_index: data.invoicePatch?.efactura_index ?? inv.efactura_index,
          efactura_error: data.invoicePatch?.efactura_error ?? inv.efactura_error,
          notes: data.invoicePatch?.notes ?? inv.notes
        } : inv))
      } else if (data.error) {
        alert(data.error)
      }
      setSpvResult(data)
      await loadInvoices()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Eroare e-Factura')
    } finally {
      setSpvBusyId('')
    }
  }

  const sendInvoice = async (invoice: Invoice) => {
    if (!confirm(`Trimiți factura ${invoice.series}${invoice.invoice_number} pe email?`)) return
    try {
      await sendInvoiceEmail(invoice.id, userId)
      alert('Factura a fost trimisă.')
      loadInvoices()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Eroare email')
    }
  }

  const deleteInvoice = async (id: string) => {
    if (!confirm('Ești sigur că vrei să ștergi această ciornă?')) return
    await supabase.from('invoice_items').delete().eq('invoice_id', id)
    await supabase.from('invoices').delete().eq('id', id)
    loadInvoices()
  }

  const copyFromList = async (invoice: Invoice) => {
    if (!confirm(`Creezi o ciornă cu aceleași detalii ca ${invoice.series}${invoice.invoice_number}? Data emiterii și scadența vor fi de azi (+15 zile). Poți edita datele înainte de emitere.`)) return
    setActionBusyId(invoice.id)
    try {
      const full = await loadInvoiceForClone(supabase, invoice.id)
      const created = await copyInvoiceAsDraft(supabase, { invoice: full, company, userId: ownerUserId || userId })
      router.push(`/invoices/${created.id}/edit`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Nu s-a putut copia factura.')
    } finally {
      setActionBusyId('')
    }
  }

  const stornoFromList = async (invoice: Invoice) => {
    if (!canCreateStorno(invoice, hasStornoIds.has(invoice.id))) return
    if (!confirm(`Creezi o notă de creditare (storno) pentru ${invoice.series}${invoice.invoice_number}? Factura originală rămâne neschimbată.`)) return
    setActionBusyId(invoice.id)
    try {
      const full = await loadInvoiceForClone(supabase, invoice.id)
      const created = await createStornoDraft(supabase, { invoice: full, company, userId: ownerUserId || userId })
      router.push(`/invoices/${created.id}/edit`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Nu s-a putut crea stornoul.')
    } finally {
      setActionBusyId('')
    }
  }

  const parseDate = (value: string) => {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const fromDate = filterFrom ? parseDate(filterFrom) : null
  const toDate = filterTo ? parseDate(filterTo) : null

  const filteredInvoices = invoices.filter(inv => {
    if (filterClientId && inv.client_id !== filterClientId) return false
    if (!matchesStatusFilter(inv, filterStatus)) return false
    if (fromDate || toDate) {
      const invDate = inv.issue_date ? parseDate(inv.issue_date) : null
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

  const filtersActive = !!filterClientId || !!filterStatus || !!filterFrom || !!filterTo
  const pageCount = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pagedInvoices = filteredInvoices.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const filteredIdSet = new Set(filteredInvoices.map(inv => inv.id))
  const visibleSelectedIds = selectedIds.filter(id => filteredIdSet.has(id))
  const eligibleOnPage = pagedInvoices.filter(inv => canSendToEfactura(inv))
  const allEligibleSelected = eligibleOnPage.length > 0 && eligibleOnPage.every(inv => selectedIds.includes(inv.id))
  const someEligibleSelected = eligibleOnPage.some(inv => selectedIds.includes(inv.id))

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someEligibleSelected && !allEligibleSelected
    }
  }, [someEligibleSelected, allEligibleSelected])

  useEffect(() => {
    setPage(1)
  }, [filterClientId, filterStatus, filterFrom, filterTo, company?.id])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  useEffect(() => {
    const allowed = new Set(filteredInvoices.filter(inv => canSendToEfactura(inv)).map(inv => inv.id))
    setSelectedIds(prev => {
      const next = prev.filter(id => allowed.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [filterClientId, filterStatus, filterFrom, filterTo, invoices])

  const toggleSelected = (id: string, eligible: boolean) => {
    if (!eligible || bulkBusy) return
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleSelectAll = () => {
    if (bulkBusy || eligibleOnPage.length === 0) return
    if (allEligibleSelected) {
      const eligibleIds = new Set(eligibleOnPage.map(inv => inv.id))
      setSelectedIds(prev => prev.filter(id => !eligibleIds.has(id)))
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        eligibleOnPage.forEach(inv => next.add(inv.id))
        return [...next]
      })
    }
  }

  const clearSelection = () => {
    if (bulkBusy) return
    setSelectedIds([])
  }

  const sendBulkToSpv = async () => {
    const selected = filteredInvoices.filter(inv => visibleSelectedIds.includes(inv.id))
    if (selected.length === 0) return

    const skipped = selected.filter(inv => !canSendToEfactura(inv))
    const toSend = selected.filter(inv => canSendToEfactura(inv))
    const countLabel = toSend.length === 1 ? 'o factură emisă' : `${toSend.length} facturi emise`

    if (toSend.length === 0) {
      setBulkSummary({
        note: 'Nu există facturi eligibile în selecție.',
        results: skipped.map(inv => ({
          invoiceId: inv.id,
          invoiceRef: invoiceRef(inv),
          outcome: 'skipped' as const,
          error: alreadySentToSpv(inv)
            ? ALREADY_SENT_TO_SPV
            : isEfacturaProcessing(inv)
              ? 'Factura este încă în prelucrare la ANAF.'
              : 'Ciornă — nu se trimite în e-Factura.'
        }))
      })
      setSelectedIds([])
      return
    }

    if (!confirm(
      `Trimiți ${countLabel} în e-Factura TEST?` +
      (skipped.length ? `\n${skipped.length === 1 ? 'O ciornă va fi omisă.' : `${skipped.length} ciorne vor fi omise.`}` : '')
    )) return

    setBulkBusy(true)
    let lastNote = 'Trimitere e-Factura TEST.'
    const results: BulkSpvResultItem[] = skipped.map(inv => ({
      invoiceId: inv.id,
      invoiceRef: invoiceRef(inv),
      outcome: 'skipped',
      error: alreadySentToSpv(inv)
        ? ALREADY_SENT_TO_SPV
        : isEfacturaProcessing(inv)
          ? 'Factura este încă în prelucrare la ANAF.'
          : 'Ciornă — nu se trimite în e-Factura.'
    }))

    try {
      for (let i = 0; i < toSend.length; i++) {
        const inv = toSend[i]
        setBulkProgress({ current: i + 1, total: toSend.length, invoiceRef: invoiceRef(inv) })
        try {
          const data = await simulateSpvUpload(inv.id, userId)
          if (data.note) lastNote = data.note
          if (data.executionStatus === '0') {
            setInvoices(prev => prev.map(row => row.id === inv.id ? {
              ...row,
              status: data.invoicePatch?.status || row.status,
              efactura_status: data.invoicePatch?.efactura_status ?? row.efactura_status,
              efactura_index: data.invoicePatch?.efactura_index ?? row.efactura_index,
              efactura_error: data.invoicePatch?.efactura_error ?? row.efactura_error,
              notes: data.invoicePatch?.notes ?? row.notes
            } : row))
          }
          results.push({
            invoiceId: inv.id,
            invoiceRef: data.invoiceRef || invoiceRef(inv),
            outcome: data.executionStatus === '0'
              ? (data.invoicePatch?.efactura_status === 'in_processing' || data.invoicePatch?.efactura_status === 'uploaded' ? 'processing' : 'accepted')
              : 'rejected',
            error: data.error
          })
        } catch (e) {
          results.push({
            invoiceId: inv.id,
            invoiceRef: invoiceRef(inv),
            outcome: 'error',
            error: e instanceof Error ? e.message : 'Eroare e-Factura'
          })
        }
      }

      setBulkSummary({
        note: lastNote,
        results
      })
      setSelectedIds([])
      await loadInvoices()
    } finally {
      setBulkBusy(false)
      setBulkProgress(null)
    }
  }

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
  const unpaidCount = filteredInvoices.filter(inv => isOpenReceivable(inv.status)).length
  const today = calendarDateInBucharest(0)
  const monthStart = `${today.slice(0, 8)}01`
  const billedThisMonth = invoices
    .filter(inv =>
      !isDraftInvoice(inv.status)
      && !isCreditNote(inv.invoice_type_code)
      && inv.issue_date >= monthStart
      && inv.issue_date <= today
    )
    .reduce((sum, inv) => sum + Number(inv.total), 0)
  const selectedCount = visibleSelectedIds.length
  const summaryCounts = bulkSummary
    ? {
        accepted: bulkSummary.results.filter(r => r.outcome === 'accepted').length,
        rejected: bulkSummary.results.filter(r => r.outcome === 'rejected').length,
        skipped: bulkSummary.results.filter(r => r.outcome === 'skipped').length,
        error: bulkSummary.results.filter(r => r.outcome === 'error').length
      }
    : null

  return (
    <div className="app-shell">
      <AppNav active="invoices" />

      <div className={`max-w-7xl mx-auto px-6 py-8 ${selectedCount > 0 ? 'pb-28' : ''}`}>
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">Facturi emise</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              {company?.company_name ? `${company.company_name} · ` : ''}
              {filteredInvoices.length} facturi{filtersActive ? ` din ${invoices.length}` : ''} · {unpaidCount} neplătite
            </p>
          </div>
          <Link href="/invoices/new" className="btn btn-primary">
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
            <p className="text-3xl font-bold text-[color:var(--color-foreground)] mt-1">{formatRon(totalValue)}</p>
          </div>
          <div className="card p-6">
            <p className="text-sm text-[color:var(--color-muted-foreground)]">Total facturat luna în curs</p>
            <p className="text-3xl font-bold text-[color:var(--color-foreground)] mt-1">{formatRon(billedThisMonth)}</p>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
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
                  <label className="block text-xs font-medium text-[color:var(--color-muted-foreground)] mb-1">Status</label>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="input bg-white px-3 py-2.5"
                  >
                    {STATUS_FILTERS.map(opt => (
                      <option key={opt.id || 'all'} value={opt.id}>{opt.label}</option>
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
                <div className="flex gap-2 lg:justify-end">
                  <button
                    onClick={() => { setFilterClientId(''); setFilterStatus(''); setFilterFrom(''); setFilterTo('') }}
                    disabled={!filtersActive}
                    className="btn btn-outline disabled:opacity-50"
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
                  onClick={() => { setFilterClientId(''); setFilterStatus(''); setFilterFrom(''); setFilterTo('') }}
                  className="font-medium text-sm mt-2 inline-block hover:underline text-[color:var(--color-foreground)]"
                >
                  Resetează filtrele →
                </button>
              </div>
            ) : (
              <>
              <div className="card overflow-hidden">
                <div className={`${LIST_GRID} py-1.5 border-b border-gray-50 items-center`}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allEligibleSelected}
                    disabled={eligibleOnPage.length === 0 || bulkBusy}
                    onChange={toggleSelectAll}
                    aria-label="Selectează toate facturile emise din această pagină"
                    title={eligibleOnPage.length === 0 ? 'Nu există facturi emise, netransmise în SPV pe această pagină' : 'Selectează toate facturile emise, netransmise în SPV de pe această pagină'}
                    className="h-4 w-4 accent-[color:var(--color-foreground)] disabled:opacity-40"
                  />
                  <span className="text-xs font-medium text-gray-400">NUMĂR</span>
                  <span className="text-xs font-medium text-gray-400">CLIENT</span>
                  <span className="text-xs font-medium text-gray-400">DATA</span>
                  <span className="text-xs font-medium text-gray-400">STATUS</span>
                  <span className="text-xs font-medium text-gray-400 text-right">TOTAL</span>
                  <span className="text-xs font-medium text-gray-400 text-right">ACȚIUNI</span>
                </div>
                {pagedInvoices.map((invoice, i) => {
                  const eligible = canSendToEfactura(invoice)
                  const checked = selectedIds.includes(invoice.id)
                  const status = invoiceStatusAppearance(invoice)
                  const alreadySpv = alreadySentToSpv(invoice)
                  return (
                    <div key={invoice.id} className={`${LIST_GRID} py-1 items-center ${i !== pagedInvoices.length - 1 ? 'border-b border-gray-50' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!eligible || bulkBusy}
                        onChange={() => toggleSelected(invoice.id, eligible)}
                        aria-label={`Selectează ${invoiceRef(invoice)}`}
                        title={eligible ? `Selectează ${invoiceRef(invoice)}` : alreadySpv ? ALREADY_SENT_TO_SPV : 'Ciornele nu se trimit în e-Factura'}
                        className="h-4 w-4 accent-[color:var(--color-foreground)] disabled:opacity-40"
                      />
                      <Link href={`/invoices/${invoice.id}`} className="text-sm font-medium text-[color:var(--color-foreground)] hover:underline">
                        {invoice.series}{invoice.invoice_number}
                      </Link>
                      <span className="text-sm text-[color:var(--color-muted-foreground)] truncate" title={invoice.clients?.company_name || undefined}>
                        {invoice.clients?.company_name || '—'}
                      </span>
                      <span className="text-sm text-[color:var(--color-muted-foreground)]">{invoice.issue_date}</span>
                      <span>
                        <span className={`inline-block text-xs px-2 py-1 rounded-lg font-medium ${status.style}`}>
                          {status.label}
                        </span>
                        {invoice.efactura_status === 'rejected' && (
                          <p className="text-[10px] text-red-500 mt-1 font-medium">e-Factura TEST · respins</p>
                        )}
                        {isEfacturaProcessing(invoice) && (
                          <p className="text-[10px] text-amber-700 mt-1 font-medium">ANAF prelucrează</p>
                        )}
                        {invoice.efactura_index && alreadySentToSpv(invoice) && (
                          <p className="text-[10px] text-[color:var(--color-muted-foreground)] mt-1 font-mono">#{invoice.efactura_index}</p>
                        )}
                      </span>
                      <span className="text-sm font-medium text-[color:var(--color-foreground)] text-right whitespace-nowrap tabular-nums">
                        {formatRon(invoice.total)}
                      </span>
                      <div className="flex flex-nowrap items-center justify-end gap-1.5">
                        {isDraftInvoice(invoice.status) && (
                          <Link
                            href={`/invoices/${invoice.id}/edit`}
                            className="text-xs border border-gray-200 text-gray-600 px-2 py-0.5 rounded-lg hover:bg-gray-50 transition leading-tight"
                          >
                            Editează
                          </Link>
                        )}
                        <InvoiceOverflow
                          actions={[
                            ...(!isDraftInvoice(invoice.status) ? [{
                              label: 'PDF',
                              onClick: () => downloadInvoicePdf(invoice.id, userId)
                            }] : []),
                            {
                              label: 'XML e-Factura',
                              onClick: () => runXml(invoice)
                            },
                            {
                              label: 'Email',
                              onClick: () => sendInvoice(invoice),
                              disabled: isDraftInvoice(invoice.status)
                            },
                            {
                              label: isEfacturaProcessing(invoice) ? 'Actualizează stare ANAF' : 'Trimite în e-Factura TEST',
                              onClick: () => sendToSpvTest(invoice),
                              disabled: bulkBusy || spvBusyId === invoice.id || actionBusyId === invoice.id || (!canSendToEfactura(invoice) && !isEfacturaProcessing(invoice))
                            },
                            {
                              label: 'Copiază factură',
                              onClick: () => copyFromList(invoice),
                              disabled: actionBusyId === invoice.id
                            },
                            ...(canCreateStorno(invoice, hasStornoIds.has(invoice.id)) ? [{
                              label: 'Creează storno',
                              onClick: () => stornoFromList(invoice),
                              disabled: actionBusyId === invoice.id
                            }] : []),
                            ...(isDraftInvoice(invoice.status) ? [{
                              label: 'Șterge ciorna',
                              onClick: () => deleteInvoice(invoice.id),
                              danger: true
                            }] : [])
                          ]}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              {filteredInvoices.length > PAGE_SIZE && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
                  <p className="text-xs text-[color:var(--color-muted-foreground)]">
                    {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredInvoices.length)} din {filteredInvoices.length} facturi
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      aria-label="Înapoi"
                      className="btn btn-outline text-sm px-3 py-1.5 disabled:opacity-40"
                    >
                      ←
                    </button>
                    <span className="text-sm text-[color:var(--color-foreground)] tabular-nums">
                      Pagina {currentPage} din {pageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                      disabled={currentPage >= pageCount}
                      aria-label="Înainte"
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

      {selectedCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t border-[color:var(--color-border)] bg-white/95 px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center gap-3 justify-between">
            <div>
              <p className="text-sm font-medium text-[color:var(--color-foreground)]">
                {selectedCount === 1 ? '1 factură selectată' : `${selectedCount} facturi selectate`}
              </p>
              {bulkBusy && bulkProgress ? (
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">
                  Se trimite {bulkProgress.current} din {bulkProgress.total} · {bulkProgress.invoiceRef} (e-Factura TEST)
                </p>
              ) : (
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">
                  Trimitere în e-Factura TEST. Ciornele sunt omise.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={sendBulkToSpv}
                disabled={bulkBusy}
                className="btn btn-primary disabled:opacity-50"
              >
                {bulkBusy ? 'Se trimite...' : 'Trimite în e-Factura'}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={bulkBusy}
                className="btn btn-outline disabled:opacity-50"
              >
                Anulează selecția
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkSummary && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setBulkSummary(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">e-Factura TEST</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {summaryCounts
                    ? `${summaryCounts.accepted} acceptate · ${summaryCounts.rejected} respinse · ${summaryCounts.skipped} omise · ${summaryCounts.error} erori`
                    : ''}
                </p>
              </div>
              <button onClick={() => setBulkSummary(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
              {bulkSummary.note}
            </p>
            <ul className="space-y-2">
              {bulkSummary.results.map(item => (
                <li key={item.invoiceId} className="text-sm border border-gray-100 rounded-xl px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-gray-900">{item.invoiceRef}</span>
                    <span className={`text-xs font-medium ${OUTCOME_LABEL[item.outcome].style}`}>
                      {OUTCOME_LABEL[item.outcome].label}
                    </span>
                  </div>
                  {item.error && (
                    <p className="text-xs text-gray-500 mt-1">{item.error}</p>
                  )}
                </li>
              ))}
            </ul>
            <button onClick={() => setBulkSummary(null)} className="mt-5 btn btn-primary">Închide</button>
          </div>
        </div>
      )}

      {spvResult && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSpvResult(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">e-Factura TEST</h3>
                <p className="text-sm text-gray-500 mt-1">{spvResult.invoiceRef}</p>
              </div>
              <button onClick={() => setSpvResult(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
              {spvResult.note}
            </p>
            {spvResult.endpoint && (
              <>
                <p className="text-xs text-gray-500 mb-1">Endpoint ANAF</p>
                <p className="text-sm font-mono break-all mb-4">{spvResult.endpoint}</p>
              </>
            )}
            <p className={`text-sm font-medium mb-3 ${spvResult.executionStatus === '0' ? (spvResult.invoicePatch?.efactura_status === 'in_processing' ? 'text-amber-700' : 'text-green-600') : 'text-red-600'}`}>
              {spvResult.executionStatus === '0'
                ? `${spvResult.invoicePatch?.efactura_status === 'in_processing' ? 'În prelucrare' : 'Acceptat'} · index_incarcare ${spvResult.indexIncarcare || '—'} · stare ${spvResult.stare || '—'}`
                : spvResult.error}
            </p>
            {spvResult.uploadResponseXml && (
              <>
                <p className="text-xs text-gray-500 mb-1">Răspuns upload (XML ANAF)</p>
                <pre className="text-xs bg-gray-50 border border-gray-100 rounded-xl p-3 overflow-x-auto mb-3 whitespace-pre-wrap">{spvResult.uploadResponseXml}</pre>
              </>
            )}
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
