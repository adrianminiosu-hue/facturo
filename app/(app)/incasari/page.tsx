'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { agingKey, calendarDateInBucharest, daysUntilDue, formatRoDate, type AgingKey } from '@/lib/dates'
import PaymentModal from '@/components/PaymentModal'
import StatementImportModal from '@/components/StatementImportModal'

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

const buckets: { id: '' | AgingKey | 'week_risk'; label: string }[] = [
  { id: '', label: 'Toate' },
  { id: 'due_0_2', label: '0–2 zile' },
  { id: 'due_week', label: 'Săptămâna aceasta' },
  { id: 'overdue_1_30', label: 'Restanță 1–30' },
  { id: 'overdue_30', label: 'Restanță 30+' },
  { id: 'week_risk', label: 'La risc (7 zile)' }
]

function outstanding(row: Row) {
  return Math.max(0, Number(row.total) - Number(row.amount_paid || 0))
}

function ron(n: number) {
  return `${Math.round(n).toLocaleString('ro-RO')} RON`
}

export default function IncasariPage() {
  const router = useRouter()
  const { userId, companies, company, loading: companyLoading } = useCompany()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [firmId, setFirmId] = useState('')
  const [clientId, setClientId] = useState('')
  const [reminderFilter, setReminderFilter] = useState<'all' | 'sent' | 'never'>('all')
  const [minAmount, setMinAmount] = useState('')
  const [bucket, setBucket] = useState<'' | AgingKey | 'week_risk'>('')
  const [busyId, setBusyId] = useState('')
  const [payRow, setPayRow] = useState<Row | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [unallocated, setUnallocated] = useState<Unallocated[]>([])

  const today = calendarDateInBucharest(0)
  const companyName = (id?: string | null) =>
    companies.find(c => c.id === id)?.company_name || 'Firmă'

  const load = async () => {
    let query = supabase
      .from('invoices')
      .select('id, user_id, company_id, client_id, series, invoice_number, due_date, total, status, reminder_sent_at, promised_pay_date, amount_paid, invoice_type_code, clients(company_name, email)')
      .eq('user_id', userId)
      .in('status', ['sent', 'overdue'])
      .order('due_date', { ascending: true })
    const { data, error } = await query
    if (error) {
      const fallback = await supabase
        .from('invoices')
        .select('id, user_id, company_id, client_id, series, invoice_number, due_date, total, status, clients(company_name, email)')
        .eq('user_id', userId)
        .in('status', ['sent', 'overdue'])
        .order('due_date', { ascending: true })
      setRows((fallback.data || []) as unknown as Row[])
    } else {
      setRows(((data || []) as unknown as Row[]).filter(row => (row as Row & { invoice_type_code?: string }).invoice_type_code !== '381'))
    }
    const extras = await supabase
      .from('invoice_payments')
      .select('id, amount, paid_on, counterpart_name, counterpart_iban, notes, reference, company_id')
      .eq('user_id', userId)
      .is('invoice_id', null)
      .order('paid_on', { ascending: false })
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
  }, [userId, companyLoading])

  const decorated = useMemo(() => rows.map(row => {
    const days = daysUntilDue(row.due_date || today, today)
    return { ...row, days, aging: agingKey(days), rest: outstanding(row) }
  }), [rows, today])

  const filtered = decorated.filter(row => {
    if (firmId && row.company_id !== firmId) return false
    if (clientId && row.client_id !== clientId) return false
    if (reminderFilter === 'sent' && !row.reminder_sent_at) return false
    if (reminderFilter === 'never' && row.reminder_sent_at) return false
    const min = Number(minAmount)
    if (minAmount && !Number.isNaN(min) && row.rest < min) return false
    if (bucket === 'week_risk') return row.days <= 7
    if (bucket === 'due_week') return row.days >= 0 && row.days <= 7
    if (bucket && row.aging !== bucket) return false
    return true
  })

  const totalOpen = decorated.reduce((s, r) => s + r.rest, 0)
  const weekRisk = decorated.filter(r => r.days <= 7).reduce((s, r) => s + r.rest, 0)
  const overdueAmt = decorated.filter(r => r.days < 0).reduce((s, r) => s + r.rest, 0)

  const clientOptions = Array.from(
    new Map(
      decorated
        .filter(r => r.client_id && r.clients?.company_name)
        .map(r => [r.client_id as string, r.clients?.company_name as string])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1], 'ro'))

  const sendReminder = async (row: Row) => {
    if (!confirm(`Trimiți reminder de plată pentru ${row.series}${row.invoice_number}?`)) return
    setBusyId(row.id)
    try {
      const res = await fetch('/api/receivables/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: row.id, userId })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Reminderul nu a plecat'); return }
      await load()
    } finally {
      setBusyId('')
    }
  }

  const savePromise = async (id: string, date: string) => {
    const { error } = await supabase.from('invoices').update({ promised_pay_date: date || null }).eq('id', id)
    if (error) alert('Rulează migrarea receivables în Supabase pentru data promisă.')
    else load()
  }

  const daysLabel = (days: number) => {
    if (days < 0) return `${Math.abs(days)} z restant`
    if (days === 0) return 'astăzi'
    return `${days} z`
  }

  return (
    <div className="app-shell">
      <AppNav active="receivables" />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="kicker mb-2">Portofoliu</p>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">Încasări</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              Toate firmele · facturi emise, încă neîncasate · sortate după scadență
            </p>
          </div>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            disabled={!company?.id}
            className="btn btn-primary disabled:opacity-40"
          >
            Importă extras
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          <div className="card p-6">
            <p className="kicker mb-3">La risc săptămâna asta</p>
            <p className="text-3xl brand">{ron(weekRisk)}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">scadente în 7 zile + restante</p>
          </div>
          <div className="card p-6">
            <p className="kicker mb-3">Restant acum</p>
            <p className={`text-3xl brand ${overdueAmt > 0 ? 'text-amber-800' : ''}`}>{ron(overdueAmt)}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">după scadență</p>
          </div>
          <div className="card p-6">
            <p className="kicker mb-3">De încasat</p>
            <p className="text-3xl brand">{ron(totalOpen)}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">{decorated.length} facturi deschise</p>
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
              {b.label}
            </button>
          ))}
        </div>

        <div className="card p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select value={firmId} onChange={e => setFirmId(e.target.value)} className="input bg-white py-2.5">
              <option value="">Toate firmele</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
            <select value={clientId} onChange={e => setClientId(e.target.value)} className="input bg-white py-2.5">
              <option value="">Toți clienții</option>
              {clientOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <select value={reminderFilter} onChange={e => setReminderFilter(e.target.value as typeof reminderFilter)} className="input bg-white py-2.5">
              <option value="all">Reminder: toate</option>
              <option value="never">Niciodată trimis</option>
              <option value="sent">Deja trimis</option>
            </select>
            <input
              type="number"
              min={0}
              value={minAmount}
              onChange={e => setMinAmount(e.target.value)}
              className="input py-2.5"
              placeholder="Sumă min. (RON)"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-[color:var(--color-muted-foreground)] text-center py-12">Se încarcă...</p>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-[color:var(--color-muted-foreground)]">Nicio factură deschisă pe filtrul curent.</p>
            <Link href="/invoices" className="text-sm mt-3 inline-block hover:underline">Mergi la facturi →</Link>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[minmax(8rem,1fr)_minmax(9rem,1.2fr)_6.5rem_6.5rem_5.5rem_7rem_7rem_minmax(14rem,auto)] px-5 py-3 border-b border-gray-100 bg-gray-50/80 text-[11px] uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
                <span>Firmă</span>
                <span>Client</span>
                <span>Factură</span>
                <span>Scadență</span>
                <span>Zile</span>
                <span>Rest</span>
                <span>Promisiune</span>
                <span className="text-right">Acțiuni</span>
              </div>
              {filtered.map(row => (
                <div key={row.id} className="grid grid-cols-[minmax(8rem,1fr)_minmax(9rem,1.2fr)_6.5rem_6.5rem_5.5rem_7rem_7rem_minmax(14rem,auto)] px-5 py-3.5 border-b border-gray-50 last:border-0 items-center gap-2">
                  <span className="text-sm truncate">{companyName(row.company_id)}</span>
                  <span className="text-sm truncate">{row.clients?.company_name || '—'}</span>
                  <span className="text-sm font-medium">{row.series}{row.invoice_number}</span>
                  <span className="text-sm text-[color:var(--color-muted-foreground)]">{formatRoDate(row.due_date)}</span>
                  <span className={`text-xs font-medium ${row.days < 0 ? 'text-amber-800' : 'text-[color:var(--color-muted-foreground)]'}`}>
                    {daysLabel(row.days)}
                  </span>
                  <span className="text-sm font-medium">
                    {ron(row.rest)}
                    {Number(row.amount_paid) > 0 && (
                      <span className="block text-[11px] font-normal text-[color:var(--color-muted-foreground)]">
                        din {ron(Number(row.total))}
                      </span>
                    )}
                  </span>
                  <input
                    type="date"
                    value={row.promised_pay_date || ''}
                    onChange={e => savePromise(row.id, e.target.value)}
                    className="input py-1.5 px-2 text-xs"
                    title="Data promisă de client"
                  />
                  <div className="flex justify-end gap-1.5 flex-wrap">
                    <button
                      onClick={() => sendReminder(row)}
                      disabled={busyId === row.id || !row.clients?.email}
                      className="text-xs border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                      title={row.reminder_sent_at ? `Ultimul reminder: ${row.reminder_sent_at.slice(0, 10)}` : 'Niciun reminder'}
                    >
                      {busyId === row.id ? '...' : row.reminder_sent_at ? 'Reminder din nou' : 'Reminder'}
                    </button>
                    <button
                      onClick={() => setPayRow(row)}
                      className="text-xs border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50"
                    >
                      Încasare
                    </button>
                    <Link href={`/invoices/${row.id}`} className="text-xs border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
                      Deschide
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {unallocated.filter(p => !firmId || p.company_id === firmId).length > 0 && (
          <div className="card p-5 mt-6">
            <p className="kicker mb-3">Încasări nealocate</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mb-3">
              Din extras, fără factură — nu modifică restul unei facturi până le înregistrezi manual pe document.
            </p>
            <div className="space-y-2">
              {unallocated.filter(p => !firmId || p.company_id === firmId).map(p => (
                <div key={p.id} className="flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{p.counterpart_name || 'Plătitor necunoscut'}</p>
                    <p className="text-xs text-[color:var(--color-muted-foreground)] truncate">
                      {p.paid_on} · {p.counterpart_iban || p.reference || p.notes || 'extras XML 940'}
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
            userId={userId}
            firmName={companyName(payRow.company_id)}
            onClose={() => setPayRow(null)}
            onSaved={() => { setPayRow(null); load() }}
          />
        )}
        {importOpen && company?.id && (
          <StatementImportModal
            userId={userId}
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
