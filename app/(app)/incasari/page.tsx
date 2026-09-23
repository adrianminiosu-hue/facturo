'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { useLocale } from '@/components/LocaleProvider'
import { useCompany } from '@/components/CompanyProvider'
import { agingKey, calendarDateInBucharest, daysUntilDue, formatRoDate, type AgingKey } from '@/lib/dates'
import PaymentModal from '@/components/PaymentModal'
import StatementImportModal from '@/components/StatementImportModal'
import { RECEIVABLE_LIST_STATUSES, isPurchaseInvoice } from '@/lib/invoiceStatus'
import { formatRon } from '@/lib/money'
import { remainingOf } from '@/lib/invoiceMath'
import type { MessageKey } from '@/lib/messages'

type Row = {
  id: string
  user_id: string
  company_id?: string | null
  client_id?: string
  series: string
  invoice_number: string
  due_date: string
  total: number
  status: string
  reminder_sent_at?: string | null
  promised_pay_date?: string | null
  amount_paid?: number | null
  prepaid_amount?: number | null
  clients?: { company_name?: string; email?: string } | null
}

type Unallocated = {
  id: string
  amount: number
  paid_on: string
  counterpart_name?: string | null
  counterpart_iban?: string | null
  notes?: string | null
  reference?: string | null
  company_id?: string | null
}

const buckets: { id: '' | AgingKey | 'week_risk' | 'paid'; key: MessageKey }[] = [
  { id: '', key: 'rec.all' },
  { id: 'due_0_2', key: 'rec.due02' },
  { id: 'due_week', key: 'rec.thisWeek' },
  { id: 'overdue_1_30', key: 'rec.overdue130' },
  { id: 'overdue_30', key: 'rec.overdue30' },
  { id: 'week_risk', key: 'rec.weekRisk' },
  { id: 'paid', key: 'rec.paid' }
]

const PAGE_SIZE = 20

function outstanding(row: Row) {
  return remainingOf(row)
}

function ron(n: number) {
  return formatRon(n)
}

export default function IncasariPage() {
  const { t } = useLocale()
  const router = useRouter()
  const { userId, companies, company, ownerUserId, accessibleOwnerIds, loading: companyLoading } = useCompany()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState('')
  const [reminderFilter, setReminderFilter] = useState<'all' | 'sent' | 'never'>('all')
  const [minAmount, setMinAmount] = useState('')
  const [bucket, setBucket] = useState<'' | AgingKey | 'week_risk' | 'paid'>('')
  const [busyId, setBusyId] = useState('')
  const [payRow, setPayRow] = useState<Row | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [unallocated, setUnallocated] = useState<Unallocated[]>([])
  const [page, setPage] = useState(1)

  const today = calendarDateInBucharest(0)
  const companyName = (id?: string | null) =>
    companies.find(c => c.id === id)?.company_name || t('rec.firm')

  const load = async () => {
    let query = supabase
      .from('invoices')
      .select('id, user_id, company_id, client_id, series, invoice_number, due_date, total, status, reminder_sent_at, promised_pay_date, amount_paid, prepaid_amount, invoice_type_code, notes, clients(company_name, email)')
      .in('status', [...RECEIVABLE_LIST_STATUSES])
      .order('due_date', { ascending: true })
    query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', ownerUserId || userId)
    const { data, error } = await query
    if (error) {
      const fallbackQuery = company?.id
        ? supabase.from('invoices').select('id, user_id, company_id, client_id, series, invoice_number, due_date, total, status, notes, clients(company_name, email)').eq('company_id', company.id).in('status', [...RECEIVABLE_LIST_STATUSES]).order('due_date', { ascending: true })
        : supabase.from('invoices').select('id, user_id, company_id, client_id, series, invoice_number, due_date, total, status, notes, clients(company_name, email)').eq('user_id', ownerUserId || userId).in('status', [...RECEIVABLE_LIST_STATUSES]).order('due_date', { ascending: true })
      const fallback = await fallbackQuery
      setRows(((fallback.data || []) as unknown as Row[]).filter(row => !isPurchaseInvoice(row as Row & { notes?: string; direction?: string })))
    } else {
      setRows(((data || []) as unknown as Row[]).filter(row => {
        const typed = row as Row & { invoice_type_code?: string; notes?: string; direction?: string }
        return typed.invoice_type_code !== '381' && !isPurchaseInvoice(typed)
      }))
    }
    let extrasQuery = supabase
      .from('invoice_payments')
      .select('id, amount, paid_on, counterpart_name, counterpart_iban, notes, reference, company_id')
      .in('user_id', accessibleOwnerIds.length ? accessibleOwnerIds : [ownerUserId || userId])
      .is('invoice_id', null)
      .order('paid_on', { ascending: false })
    if (company?.id) extrasQuery = extrasQuery.eq('company_id', company.id)
    const extras = await extrasQuery
    if (!extras.error) setUnallocated((extras.data || []) as Unallocated[])
    else setUnallocated([])
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      load()
    }
    init()
  }, [userId, company?.id, companyLoading])

  const decorated = useMemo(() => rows.map(row => {
    const rest = outstanding(row)
    const settled = row.status === 'paid' || rest < 0.009
    const days = daysUntilDue(row.due_date || today, today)
    return { ...row, days, aging: settled ? 'paid' as const : agingKey(days), rest, settled }
  }).sort((a, b) => {
    if (a.settled !== b.settled) return a.settled ? 1 : -1
    return String(a.due_date || '').localeCompare(String(b.due_date || ''))
  }), [rows, today])

  const filtered = decorated.filter(row => {
    if (clientId && row.client_id !== clientId) return false
    if (reminderFilter === 'sent' && !row.reminder_sent_at) return false
    if (reminderFilter === 'never' && row.reminder_sent_at) return false
    const min = Number(minAmount)
    if (minAmount && !Number.isNaN(min) && row.rest < min) return false
    if (bucket === 'paid') return row.settled
    if (bucket === 'week_risk') return !row.settled && row.days <= 7
    if (bucket === 'due_week') return !row.settled && row.days >= 0 && row.days <= 7
    if (bucket && row.aging !== bucket) return false
    return true
  })

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [clientId, reminderFilter, minAmount, bucket])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const openRows = decorated.filter(r => !r.settled)
  const totalOpen = openRows.reduce((s, r) => s + r.rest, 0)
  const weekRisk = openRows.filter(r => r.days <= 7).reduce((s, r) => s + r.rest, 0)
  const overdueAmt = openRows.filter(r => r.days < 0).reduce((s, r) => s + r.rest, 0)

  const clientOptions = Array.from(
    new Map(
      decorated
        .filter(r => r.client_id && r.clients?.company_name)
        .map(r => [r.client_id as string, r.clients?.company_name as string])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1], 'ro'))

  const sendReminder = async (row: Row) => {
    if (!confirm(t('rec.confirmReminder', { ref: `${row.series}${row.invoice_number}` }))) return
    setBusyId(row.id)
    try {
      const res = await fetch('/api/receivables/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: row.id, userId })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || t('rec.reminderFail')); return }
      await load()
    } finally {
      setBusyId('')
    }
  }

  const savePromise = async (id: string, date: string) => {
    const { error } = await supabase.from('invoices').update({ promised_pay_date: date || null }).eq('id', id)
    if (error) alert(t('rec.promiseMigrate'))
    else load()
  }

  const daysLabel = (days: number, settled?: boolean) => {
    if (settled) return t('rec.paidLabel')
    if (days < 0) return t('rec.overdueDays', { count: Math.abs(days) })
    if (days === 0) return t('rec.today')
    return t('rec.daysLeft', { count: days })
  }

  return (
    <div className="app-shell">
      <AppNav active="receivables" />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="kicker mb-2">{t('rec.portfolio')}</p>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">{t('rec.title')}</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              {company?.company_name ? `${company.company_name} · ` : ''}
              {t('rec.lead')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            disabled={!company?.id}
            className="btn btn-primary disabled:opacity-40"
          >
            {t('rec.importStatement')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          <div className="card p-6">
            <p className="kicker mb-3">{t('rec.weekRiskCard')}</p>
            <p className="text-3xl brand">{ron(weekRisk)}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">{t('rec.weekRiskSub')}</p>
          </div>
          <div className="card p-6">
            <p className="kicker mb-3">{t('rec.overdueNow')}</p>
            <p className={`text-3xl brand ${overdueAmt > 0 ? 'text-amber-800' : ''}`}>{ron(overdueAmt)}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">{t('rec.overdueSub')}</p>
          </div>
          <div className="card p-6">
            <p className="kicker mb-3">{t('rec.toCollect')}</p>
            <p className="text-3xl brand">{ron(totalOpen)}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">{t('rec.openCount', { count: openRows.length })}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {buckets.map(b => (
            <button
              key={b.id || 'all'}
              onClick={() => setBucket(b.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                bucket === b.id
                  ? 'bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] border-transparent'
                  : 'border-[color:var(--color-border)] text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]'
              }`}
            >
              {t(b.key)}
            </button>
          ))}
        </div>

        <div className="card p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select value={clientId} onChange={e => setClientId(e.target.value)} className="input bg-white py-2.5">
              <option value="">{t('rec.allClients')}</option>
              {clientOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <select value={reminderFilter} onChange={e => setReminderFilter(e.target.value as typeof reminderFilter)} className="input bg-white py-2.5">
              <option value="all">{t('rec.reminderAll')}</option>
              <option value="never">{t('rec.reminderNever')}</option>
              <option value="sent">{t('rec.reminderSent')}</option>
            </select>
            <input
              type="number"
              min={0}
              value={minAmount}
              onChange={e => setMinAmount(e.target.value)}
              className="input py-2.5"
              placeholder={t('rec.minAmount')}
            />
          </div>
        </div>

        {loading ? (
          <p className="text-[color:var(--color-muted-foreground)] text-center py-12">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-[color:var(--color-muted-foreground)]">{t('rec.empty')}</p>
            <Link href="/invoices" className="text-sm mt-3 inline-block hover:underline">{t('rec.goIssued')}</Link>
          </div>
        ) : (
          <>
          <div className="card overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[minmax(9rem,1.2fr)_6.5rem_6.5rem_5.5rem_9.5rem_7rem_minmax(14rem,auto)] px-5 py-1.5 border-b border-gray-50 items-center text-[11px] uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
                <span>{t('common.client')}</span>
                <span>{t('rec.invoice')}</span>
                <span>{t('rec.due')}</span>
                <span>{t('rec.days')}</span>
                <span className="whitespace-nowrap">{t('rec.rest')}</span>
                <span>{t('rec.promise')}</span>
                <span className="text-right">{t('common.actions')}</span>
              </div>
              {paged.map((row, i) => (
                <div key={row.id} className={`grid grid-cols-[minmax(9rem,1.2fr)_6.5rem_6.5rem_5.5rem_9.5rem_7rem_minmax(14rem,auto)] px-5 py-1 items-center gap-2 ${i !== paged.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <span className="text-sm truncate">{row.clients?.company_name || '—'}</span>
                  <span className="text-sm font-medium">{row.series}{row.invoice_number}</span>
                  <span className="text-sm text-[color:var(--color-muted-foreground)]">{formatRoDate(row.due_date)}</span>
                  <span className={`text-xs font-medium ${!row.settled && row.days < 0 ? 'text-amber-800' : 'text-[color:var(--color-muted-foreground)]'}`}>
                    {daysLabel(row.days, row.settled)}
                  </span>
                  <span className="text-sm font-medium">
                    {ron(row.rest)}
                    {Number(row.amount_paid) > 0 && (
                      <span className="block text-[11px] font-normal text-[color:var(--color-muted-foreground)]">
                        {t('rec.fromTotal', { amount: ron(Number(row.total)) })}
                      </span>
                    )}
                  </span>
                  <input
                    type="date"
                    value={row.promised_pay_date || ''}
                    onChange={e => savePromise(row.id, e.target.value)}
                    className="input py-0.5 px-2 text-xs"
                    title={t('rec.promisedTitle')}
                  />
                  <div className="flex justify-end gap-1.5 flex-wrap">
                    {!row.settled && (
                      <>
                    <button
                      onClick={() => sendReminder(row)}
                      disabled={busyId === row.id || !row.clients?.email}
                      className="text-xs border border-gray-200 px-2.5 py-0.5 rounded-lg hover:bg-gray-50 disabled:opacity-40 leading-tight"
                      title={row.reminder_sent_at ? t('rec.lastReminder', { date: row.reminder_sent_at.slice(0, 10) }) : t('rec.noReminder')}
                    >
                      {busyId === row.id ? '...' : row.reminder_sent_at ? t('rec.reminderAgain') : t('rec.reminder')}
                    </button>
                    <button
                      onClick={() => setPayRow(row)}
                      className="text-xs border border-gray-200 px-2.5 py-0.5 rounded-lg hover:bg-gray-50 leading-tight"
                    >
                      {t('inv.collection')}
                    </button>
                      </>
                    )}
                    <Link href={`/invoices/${row.id}`} className="text-xs border border-gray-200 px-2.5 py-0.5 rounded-lg hover:bg-gray-50 leading-tight">
                      {t('common.open')}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {filtered.length > PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
              <p className="text-xs text-[color:var(--color-muted-foreground)]">
                {t('rec.range', {
                  from: (currentPage - 1) * PAGE_SIZE + 1,
                  to: Math.min(currentPage * PAGE_SIZE, filtered.length),
                  total: filtered.length
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
        {unallocated.length > 0 && (
          <div className="card p-5 mt-6">
            <p className="kicker mb-3">{t('rec.unallocated')}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mb-3">
              {t('rec.unallocatedLead')}
            </p>
            <div className="space-y-2">
              {unallocated.map(p => (
                <div key={p.id} className="flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{p.counterpart_name || t('rec.unknownPayer')}</p>
                    <p className="text-xs text-[color:var(--color-muted-foreground)] truncate">
                      {p.paid_on} · {p.counterpart_iban || p.reference || p.notes || t('rec.xml940')}
                    </p>
                  </div>
                  <p className="font-medium shrink-0">{ron(Number(p.amount))}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {payRow && (
          <PaymentModal
            invoice={payRow}
            userId={ownerUserId || userId}
            firmName={companyName(payRow.company_id)}
            onClose={() => setPayRow(null)}
            onSaved={() => { setPayRow(null); load() }}
          />
        )}
        {importOpen && company?.id && (
          <StatementImportModal
            userId={ownerUserId || userId}
            companyId={company.id}
            companyName={company.company_name}
            onClose={() => setImportOpen(false)}
            onImported={() => { load() }}
          />
        )}
      </div>
    </div>
  )
}
