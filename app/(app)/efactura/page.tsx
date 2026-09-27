'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import Money from '@/components/Money'
import EfacturaStatsCard from '@/components/EfacturaStatsCard'
import { useCompany } from '@/components/CompanyProvider'
import { useLocale } from '@/components/LocaleProvider'
import { getCurrentUser, supabase } from '@/lib/supabase'
import {
  disconnectEfactura,
  importPurchaseInvoicesFromEfactura,
  loadEfacturaConnection,
  loadEfacturaStats,
  simulateSpvUploads,
  startEfacturaConnect,
  syncEfactura,
  type EfacturaConnection,
  type EfacturaStatsResponse
} from '@/lib/invoiceClient'
import { buildEfacturaDashboard, EFACTURA_STAGES, type DashboardInvoice, type DashboardRow, type EfacturaStage } from '@/lib/efacturaDashboard'
import { anafErrorHint } from '@/lib/anafErrors'
import { addDaysIso, calendarDateInBucharest, formatRoDate } from '@/lib/dates'
import { isPurchaseInvoice } from '@/lib/invoiceStatus'
import { countWord } from '@/lib/i18n'

const PERIODS = [7, 30, 90] as const
const INVOICE_COLUMNS: string = 'id, series, invoice_number, issue_date, status, notes, invoice_type_code, total, direction, efactura_status, efactura_error, efactura_attempts, efactura_next_attempt_at, efactura_uploaded_at, efactura_index, clients(company_name, cui, country)'
/** Before the retry-queue migration the two queue columns do not exist. */
const INVOICE_COLUMNS_FALLBACK: string = 'id, series, invoice_number, issue_date, status, notes, invoice_type_code, total, direction, efactura_status, efactura_error, efactura_uploaded_at, efactura_index, clients(company_name, cui, country)'
/** Warn this many days before the ANAF token expires. */
const TOKEN_WARN_DAYS = 7
/** Remind to fetch received invoices when the last import is older than this. */
const IMPORT_STALE_DAYS = 3
const LIST_LIMIT = 200

type Filter = 'open' | 'all' | 'due' | EfacturaStage
type Tone = 'danger' | 'warn' | 'info'
type Action = {
  key: string
  tone: Tone
  title: string
  detail?: string
  refs?: DashboardRow[]
  buttons: Array<{ label: string; onClick: () => void; primary?: boolean }>
}
type Translate = (key: string, vars?: Record<string, string | number>) => string

const STAGE_STYLE: Record<EfacturaStage, string> = {
  todo: 'bg-gray-100 text-gray-700',
  queued: 'bg-amber-50 text-amber-800',
  anaf: 'bg-blue-50 text-blue-700',
  accepted: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700'
}

const TONE_DOT: Record<Tone, string> = {
  danger: 'bg-red-500',
  warn: 'bg-amber-500',
  info: 'bg-[color:var(--color-muted-foreground)]'
}

function wholeDaysFrom(iso: string | null | undefined, sign: 1 | -1) {
  if (!iso) return null
  const ms = (Date.parse(iso) - Date.now()) * sign
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null
}

function timeAgo(iso: string | null | undefined, t: Translate) {
  if (!iso) return t('efd.never')
  const date = new Date(iso)
  const today = calendarDateInBucharest(0)
  const day = date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
  const time = date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' })
  if (day === today) return t('efd.todayAt', { time })
  if (day === addDaysIso(today, -1)) return t('efd.yesterdayAt', { time })
  return `${formatRoDate(day)} ${time}`
}

export default function EfacturaDashboardPage() {
  const router = useRouter()
  const { t, locale } = useLocale()
  const { userId, ownerUserId, isOwner, company, loading: companyLoading } = useCompany()
  const [connection, setConnection] = useState<EfacturaConnection | null>(null)
  const [invoices, setInvoices] = useState<DashboardInvoice[]>([])
  const [purchases, setPurchases] = useState<Array<{ issue_date?: string | null; total?: number | null; efactura_index?: string | null }>>([])
  const [stats, setStats] = useState<EfacturaStatsResponse | null>(null)
  const [period, setPeriod] = useState<number>(30)
  const [filter, setFilter] = useState<Filter>('open')
  const [focus, setFocus] = useState<string[] | null>(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showConnection, setShowConnection] = useState(false)
  const n = (value: number) => countWord(value, locale)

  const loadConnection = async () => {
    try {
      setConnection(await loadEfacturaConnection(userId, ownerUserId || userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('set.readFail'))
    }
  }

  const loadInvoices = async () => {
    if (!company?.id) return
    let res = await supabase.from('invoices').select(INVOICE_COLUMNS).eq('company_id', company.id)
    if (res.error && /efactura_(attempts|next_attempt_at)/.test(res.error.message || '')) {
      res = await supabase.from('invoices').select(INVOICE_COLUMNS_FALLBACK).eq('company_id', company.id)
    }
    if (res.error) {
      setError(res.error.message)
      return
    }
    const rows = (res.data || []) as unknown as Array<DashboardInvoice & { direction?: string | null }>
    setInvoices(rows.filter(row => !isPurchaseInvoice(row)))
    setPurchases(rows.filter(row => isPurchaseInvoice(row)))
  }

  const loadStats = async (days = period) => {
    try {
      setStats(await loadEfacturaStats(days, company?.id))
    } catch {
      setStats(null)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') setMessage(t('set.connectedMsg'))
    if (params.get('error')) setError(params.get('error') || '')
  }, [])

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId) return
      const { data: { user } } = await getCurrentUser()
      if (!user) {
        router.push('/login')
        return
      }
      await Promise.all([loadConnection(), loadInvoices(), loadStats()])
      setLoading(false)
    }
    init()
  }, [userId, ownerUserId, companyLoading, company?.id])

  const today = calendarDateInBucharest(0)
  const model = useMemo(() => buildEfacturaDashboard(invoices, { today, periodDays: period }), [invoices, today, period])
  const since = addDaysIso(today, -period)
  const received = purchases.filter(row => row.efactura_index && (row.issue_date || '') >= since)
  const receivedValue = received.reduce((sum, row) => sum + Number(row.total || 0), 0)

  const run = async (key: string, work: () => Promise<string | void>) => {
    setBusy(key)
    setError('')
    setMessage('')
    try {
      const note = await work()
      if (note) setMessage(note)
      await Promise.all([loadInvoices(), loadStats()])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy('')
  }

  const sendNow = (rows: DashboardRow[]) => run('send', async () => {
    const result = await simulateSpvUploads(rows.map(row => row.invoice.id), userId)
    const ok = result.results.filter(item => item.outcome === 'accepted' || item.outcome === 'processing').length
    return t('efd.sent', { ok, total: rows.length })
  })
  const checkNow = () => run('sync', async () => {
    const result = await syncEfactura(true)
    return result.skipped || t('efs.synced', { count: result.changed })
  })
  const importNow = () => run('import', async () => {
    const result = await importPurchaseInvoicesFromEfactura(userId, company)
    return t('efd.imported', { added: result.added ?? result.count, skipped: result.skipped ?? 0 })
  })
  const connect = async () => {
    setError('')
    try {
      await startEfacturaConnect(ownerUserId || userId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const disconnect = async () => {
    if (!confirm(t('set.connectConfirm'))) return
    await run('disconnect', async () => {
      await disconnectEfactura(userId, ownerUserId || userId)
      await loadConnection()
      return t('set.disconnectedMsg')
    })
  }
  const choosePeriod = (days: number) => {
    setPeriod(days)
    loadStats(days)
  }
  const show = (next: Filter, ids?: string[]) => {
    setFilter(next)
    setFocus(ids && ids.length ? ids : null)
    requestAnimationFrame(() => document.getElementById('efd-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const connected = !!connection?.connected
  const isTest = (connection?.environment || 'test') !== 'prod'
  const tokenDays = wholeDaysFrom(connection?.expiresAt, 1)
  const importAge = wholeDaysFrom(stats?.last?.import, -1)
  const plural = (count: number, one: string, many: string) => count === 1 ? t(one) : t(many, { count: n(count) })

  const actions: Action[] = []
  if (connection && !connected) {
    actions.push({ key: 'conn', tone: 'danger', title: t('efd.act.notConnected'), detail: t('efd.act.notConnectedHint'), buttons: [{ label: t('set.connect'), onClick: connect, primary: true }] })
  } else if (connected && tokenDays !== null && tokenDays <= TOKEN_WARN_DAYS) {
    actions.push({
      key: 'token',
      tone: tokenDays < 0 ? 'danger' : 'warn',
      title: tokenDays < 0 ? t('efd.act.tokenExpired') : t('efd.act.tokenSoon', { days: n(tokenDays) }),
      detail: t('efd.act.tokenHint'),
      buttons: [{ label: t('set.reconnect'), onClick: connect, primary: true }]
    })
  }
  if (model.rejected.length) {
    actions.push({
      key: 'rejected',
      tone: 'danger',
      title: plural(model.rejected.length, 'efd.act.rejectedOne', 'efd.act.rejected'),
      detail: t('efd.act.rejectedHint'),
      refs: model.rejected,
      buttons: [{ label: t('efd.showErrors'), onClick: () => show('rejected'), primary: true }]
    })
  }
  if (model.overdue.length) {
    actions.push({
      key: 'overdue',
      tone: 'danger',
      title: plural(model.overdue.length, 'efd.act.overdueOne', 'efd.act.overdue'),
      detail: t('efd.act.overdueHint'),
      refs: model.overdue,
      buttons: [
        { label: t('efd.sendNow', { count: model.overdue.length }), onClick: () => sendNow(model.overdue), primary: true },
        { label: t('efd.show'), onClick: () => show('due', model.overdue.map(row => row.invoice.id)) }
      ]
    })
  }
  if (model.dueSoon.length) {
    actions.push({
      key: 'soon',
      tone: 'warn',
      title: plural(model.dueSoon.length, 'efd.act.dueSoonOne', 'efd.act.dueSoon'),
      detail: t('efd.act.dueSoonHint'),
      refs: model.dueSoon,
      buttons: [
        { label: t('efd.sendNow', { count: model.dueSoon.length }), onClick: () => sendNow(model.dueSoon), primary: true },
        { label: t('efd.show'), onClick: () => show('due', model.dueSoon.map(row => row.invoice.id)) }
      ]
    })
  }
  if (model.queueGaveUp.length) {
    actions.push({
      key: 'gaveup',
      tone: 'warn',
      title: plural(model.queueGaveUp.length, 'efd.act.queueGaveUpOne', 'efd.act.queueGaveUp'),
      detail: t('efd.act.queueGaveUpHint'),
      refs: model.queueGaveUp,
      buttons: [{ label: t('efd.resend'), onClick: () => sendNow(model.queueGaveUp), primary: true }]
    })
  }
  if (model.stuck.length) {
    actions.push({
      key: 'stuck',
      tone: 'warn',
      title: plural(model.stuck.length, 'efd.act.stuckOne', 'efd.act.stuck'),
      detail: t('efd.act.stuckHint'),
      refs: model.stuck,
      buttons: [{ label: t('efd.checkNow'), onClick: checkNow, primary: true }]
    })
  }
  if (connected && (importAge === null || importAge >= IMPORT_STALE_DAYS)) {
    actions.push({
      key: 'import',
      tone: 'info',
      title: importAge === null ? t('efd.act.importNever') : t('efd.act.importStale', { days: n(importAge) }),
      detail: t('efd.act.importHint'),
      buttons: [{ label: t('efd.importNow'), onClick: importNow, primary: true }]
    })
  }

  const term = q.trim().toLowerCase()
  const visible = model.rows
    .filter(row => {
      if (focus) return focus.includes(row.invoice.id)
      if (filter === 'all') return true
      if (filter === 'open') return row.stage !== 'accepted'
      if (filter === 'due') return row.deadline !== null
      if (filter === 'accepted') return row.stage === 'accepted' && (row.invoice.issue_date || '') >= since
      return row.stage === filter
    })
    .filter(row => !term || row.ref.toLowerCase().includes(term) || row.clientName.toLowerCase().includes(term))
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999) || String(b.invoice.issue_date || '').localeCompare(String(a.invoice.issue_date || '')))

  const deadlineText = (row: DashboardRow) => {
    if (row.daysLeft === null) return row.buyer === 'foreign' && row.stage !== 'accepted' ? t('efd.optional') : '—'
    if (row.daysLeft < 0) return row.daysLeft === -1 ? t('efd.lateOne') : t('efd.late', { days: n(-row.daysLeft) })
    if (row.daysLeft === 0) return t('efd.dueToday')
    return row.daysLeft === 1 ? t('efd.dueInOne') : t('efd.dueIn', { days: n(row.daysLeft) })
  }
  const deadlineTone = (row: DashboardRow) => {
    if (row.daysLeft === null) return 'text-[color:var(--color-muted-foreground)]'
    if (row.daysLeft < 0) return 'text-red-600 font-medium'
    return row.daysLeft <= 2 ? 'text-amber-700 font-medium' : ''
  }

  if (loading || companyLoading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    )
  }

  const tokenWarn = tokenDays !== null && tokenDays <= TOKEN_WARN_DAYS

  return (
    <div className="app-shell">
      <AppNav active="efactura" />
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="page-toolbar">
          <div>
            <h2 className="page-title">{t('efd.title')}</h2>
            <p className="text-[color:var(--color-muted-foreground)] mt-1">{t('efd.lead')}</p>
          </div>
        </div>

        {message && <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2 mb-4">{message}</p>}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">{error}</p>}

        {/* 1. Connection */}
        <div className="card p-4 mb-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${connected ? (tokenWarn ? 'bg-amber-500' : 'bg-green-600') : 'bg-red-500'}`} />
            <p className="text-sm font-medium">
              {connected ? t('efd.conn.on') : t('efd.conn.off')}
              {connected && (
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-md ${isTest ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-700'}`}>
                  {isTest ? t('efd.conn.test') : t('efd.conn.prod')}
                </span>
              )}
            </p>
            {connected && tokenDays !== null && (
              <p className="text-sm text-[color:var(--color-muted-foreground)]">
                {tokenDays >= 0 ? t('efd.conn.tokenDays', { days: n(tokenDays) }) : t('efd.act.tokenExpired')}
              </p>
            )}
            <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('efd.conn.lastCheck')}: {timeAgo(stats?.last?.check, t)}</p>
            <div className="ml-auto flex gap-2">
              {connected && (
                <button type="button" className="btn btn-outline text-sm disabled:opacity-50" disabled={!!busy} onClick={checkNow}>
                  {busy === 'sync' ? t('efs.syncing') : t('efs.syncNow')}
                </button>
              )}
              <button type="button" className="btn btn-outline text-sm" aria-expanded={showConnection} onClick={() => setShowConnection(value => !value)}>
                {showConnection ? t('efd.conn.hide') : t('efd.conn.details')}
              </button>
            </div>
          </div>
          {connected && isTest && <p className="text-xs text-amber-800 mt-2">{t('efd.conn.testHint')}</p>}
          {showConnection && (
            <div className="mt-4 pt-4 border-t border-[color:var(--color-border)]">
              {connection?.missingTable && <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">{t('set.missingTable')}</p>}
              {!connection?.configured && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">{t('set.envMissing')}</p>
              )}
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                <div>
                  <dt className="text-[color:var(--color-muted-foreground)]">{t('set.environment')}</dt>
                  <dd className="font-medium">{connection?.environment || 'test'}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--color-muted-foreground)]">{t('set.expires')}</dt>
                  <dd className="font-medium">{connection?.expiresAt ? new Date(connection.expiresAt).toLocaleString('ro-RO') : '—'}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--color-muted-foreground)]">{t('set.certSerial')}</dt>
                  <dd className="font-mono text-xs break-all">{connection?.certSerial || '—'}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={connect} disabled={!connection?.configured || !!busy} className="btn btn-primary disabled:opacity-50">
                  {connected ? t('set.reconnect') : t('set.connect')}
                </button>
                {connected && isOwner && (
                  <button type="button" onClick={disconnect} disabled={!!busy} className="btn btn-outline disabled:opacity-50">{t('set.disconnect')}</button>
                )}
              </div>
              <ol className="mt-4 text-sm text-[color:var(--color-muted-foreground)] space-y-1 list-decimal pl-5">
                <li>{t('set.step1')}</li>
                <li>{t('set.step2')}</li>
                <li>{t('set.step3')}</li>
                <li>{t('set.step4')}</li>
              </ol>
            </div>
          )}
        </div>

        {/* 2. What needs doing now */}
        <div className="card p-5 mb-4">
          <h3 className="font-semibold mb-3">{t('efd.todo.title')}</h3>
          {actions.length === 0 ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-600" />
              <span>{t('efd.todo.clear')}</span>
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--color-border)]">
              {actions.map(action => (
                <li key={action.key} className="py-3 flex flex-wrap items-start gap-3">
                  <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full shrink-0 ${TONE_DOT[action.tone]}`} />
                  <div className="flex-1 min-w-[14rem]">
                    <p className="text-sm font-medium">{action.title}</p>
                    {action.detail && <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">{action.detail}</p>}
                    {action.refs && action.refs.length > 0 && (
                      <p className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        {action.refs.slice(0, 6).map(row => (
                          <Link key={row.invoice.id} href={`/invoices/${row.invoice.id}`} className="underline underline-offset-2">
                            {row.ref}{row.daysLeft !== null && action.key !== 'rejected' ? ` · ${deadlineText(row)}` : ''}
                          </Link>
                        ))}
                        {action.refs.length > 6 && <span className="text-[color:var(--color-muted-foreground)]">+{action.refs.length - 6}</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {action.buttons.map(button => (
                      <button
                        key={button.label}
                        type="button"
                        disabled={!!busy}
                        onClick={button.onClick}
                        className={`btn text-sm disabled:opacity-50 ${button.primary ? 'btn-primary' : 'btn-outline'}`}
                      >
                        {button.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 3. Where the issued invoices are */}
        <div className="card p-5 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-semibold">{t('efd.flow.title')}</h3>
            <div className="segmented" role="radiogroup" aria-label={t('efd.period')}>
              {PERIODS.map(p => (
                <button key={p} type="button" role="radio" aria-checked={period === p} data-active={period === p} className="segmented-btn" onClick={() => choosePeriod(p)}>
                  {t('dash.sales.days', { count: n(p) })}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {EFACTURA_STAGES.map((stage, index) => (
              <button
                key={stage}
                type="button"
                onClick={() => show(stage)}
                className={`text-left rounded-xl border p-3 transition hover:border-[color:var(--color-foreground)] ${filter === stage && !focus ? 'border-[color:var(--color-foreground)]' : 'border-[color:var(--color-border)]'}`}
              >
                <p className="text-xs text-[color:var(--color-muted-foreground)] flex items-center gap-1">
                  {index > 0 && index < 4 && <span aria-hidden>→</span>}
                  {t(`efd.stage.${stage}`)}
                </p>
                <p className={`text-2xl font-medium tabular-nums mt-1 ${stage === 'rejected' && model.flow.rejected ? 'text-red-600' : stage === 'accepted' ? 'text-green-700' : ''}`}>
                  {model.flow[stage]}
                </p>
                <p className="text-[11px] text-[color:var(--color-muted-foreground)] mt-0.5">
                  {stage === 'accepted' ? t('efd.inPeriod', { count: n(period) }) : t('efd.now')}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* 4. Received invoices + deadlines */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{t('efd.in.title')}</h3>
              {connected && (
                <button type="button" className="btn btn-outline text-xs disabled:opacity-50" disabled={!!busy} onClick={importNow}>
                  {busy === 'import' ? t('efs.syncing') : t('efd.importNow')}
                </button>
              )}
            </div>
            <p className="kpi mt-3">{received.length}</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('efd.in.count', { count: n(period) })}</p>
            <p className="text-sm mt-3">{t('efd.in.value')}: <Money value={receivedValue} /></p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">{t('efd.in.last')}: {timeAgo(stats?.last?.import, t)}</p>
            <Link href="/facturi-achizitie" className="text-xs underline underline-offset-2 mt-2 inline-block">{t('efd.in.open')}</Link>
          </div>
          <div className="card p-5">
            <h3 className="font-semibold">{t('efd.cal.title')}</h3>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">{t('efd.cal.hint')}</p>
            <div className="grid grid-cols-6 gap-2 mt-4">
              <button
                type="button"
                onClick={() => model.overdue.length && show('due', model.overdue.map(row => row.invoice.id))}
                className="rounded-xl border border-[color:var(--color-border)] p-2 text-center"
              >
                <p className="text-[11px] text-[color:var(--color-muted-foreground)]">{t('efd.cal.late')}</p>
                <p className={`text-xl font-medium tabular-nums ${model.overdue.length ? 'text-red-600' : ''}`}>{model.overdue.length}</p>
                <p className="text-[10px] text-[color:var(--color-muted-foreground)]">&nbsp;</p>
              </button>
              {model.calendar.map(day => {
                const ids = model.rows.filter(row => row.deadline === day.date).map(row => row.invoice.id)
                const weekday = new Date(`${day.date}T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'ro-RO', { weekday: 'short', timeZone: 'UTC' })
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => ids.length && show('due', ids)}
                    className={`rounded-xl border p-2 text-center ${day.date === today ? 'border-[color:var(--color-foreground)]' : 'border-[color:var(--color-border)]'}`}
                  >
                    <p className="text-[11px] text-[color:var(--color-muted-foreground)] capitalize">{day.date === today ? t('efd.cal.today') : weekday}</p>
                    <p className={`text-xl font-medium tabular-nums ${day.count && day.date === today ? 'text-amber-700' : ''}`}>{day.count}</p>
                    <p className="text-[10px] text-[color:var(--color-muted-foreground)]">{formatRoDate(day.date).slice(0, 5)}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 5. Invoices, filtered by any of the above */}
        <div id="efd-list" className="card p-5 mb-4 scroll-mt-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h3 className="font-semibold mr-2">{t('efd.list.title')}</h3>
            {(['open', 'all', ...EFACTURA_STAGES] as Filter[]).map(key => (
              <button
                key={key}
                type="button"
                onClick={() => show(key)}
                className={`text-xs px-2.5 py-1 rounded-lg border ${filter === key && !focus ? 'bg-[color:var(--color-foreground)] text-[color:var(--color-background)] border-transparent' : 'border-[color:var(--color-border)]'}`}
              >
                {t(`efd.filter.${key}`)}
              </button>
            ))}
            {focus && (
              <button type="button" onClick={() => setFocus(null)} className="text-xs px-2.5 py-1 rounded-lg bg-[color:var(--color-foreground)] text-[color:var(--color-background)]">
                {t('efd.filter.selection', { count: focus.length })} ×
              </button>
            )}
            <input className="input max-w-xs ml-auto px-3 py-1.5" value={q} onChange={e => setQ(e.target.value)} placeholder={t('common.search')} />
          </div>
          {visible.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted-foreground)] py-6 text-center">{t('efd.list.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[color:var(--color-muted-foreground)] border-b border-[color:var(--color-border)]">
                    <th className="py-2 pr-3 font-medium">{t('efd.col.invoice')}</th>
                    <th className="py-2 pr-3 font-medium">{t('efd.col.client')}</th>
                    <th className="py-2 pr-3 font-medium">{t('efd.col.issued')}</th>
                    <th className="py-2 pr-3 font-medium">{t('efd.col.deadline')}</th>
                    <th className="py-2 pr-3 font-medium">{t('efd.col.status')}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t('efd.col.total')}</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {visible.slice(0, LIST_LIMIT).map(row => {
                    const hint = anafErrorHint(row.invoice.efactura_error)
                    const canSend = row.stage === 'todo' || row.queueGaveUp
                    return (
                      <tr key={row.invoice.id} className="align-top">
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <Link href={`/invoices/${row.invoice.id}`} className="font-medium hover:underline">{row.ref}</Link>
                          {row.invoice.invoice_type_code === '381' && <span className="ml-1 text-[11px] text-[color:var(--color-muted-foreground)]">{t('efd.creditNote')}</span>}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span>{row.clientName || '—'}</span>
                          {row.buyer !== 'company' && (
                            <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 whitespace-nowrap">{t(`efd.buyer.${row.buyer}`)}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">{row.invoice.issue_date ? formatRoDate(row.invoice.issue_date) : '—'}</td>
                        <td className={`py-2.5 pr-3 whitespace-nowrap ${deadlineTone(row)}`}>{deadlineText(row)}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`text-xs px-2 py-0.5 rounded-md whitespace-nowrap ${STAGE_STYLE[row.stage]}`}>{t(`efd.stage.${row.stage}`)}</span>
                          {row.invoice.efactura_index && (
                            <span className="block text-[11px] text-[color:var(--color-muted-foreground)] mt-1 tabular-nums">{t('efd.index')} {row.invoice.efactura_index}</span>
                          )}
                          {row.invoice.efactura_error && row.stage !== 'accepted' && (
                            <span className="block text-xs mt-1 max-w-md">
                              {hint && <span className="block font-medium">{t(hint)}</span>}
                              <span className="block text-[color:var(--color-muted-foreground)] break-words">{row.invoice.efactura_error}</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-right whitespace-nowrap"><Money value={Number(row.invoice.total || 0)} /></td>
                        <td className="py-2.5 whitespace-nowrap text-right">
                          {row.stage === 'rejected' ? (
                            <Link href={`/invoices/${row.invoice.id}`} className="text-xs underline underline-offset-2">{t('efd.fix')}</Link>
                          ) : canSend ? (
                            <button type="button" disabled={!!busy || !connected} onClick={() => sendNow([row])} className="text-xs underline underline-offset-2 disabled:opacity-40">
                              {t('efd.send')}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {visible.length > LIST_LIMIT && (
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">{t('efd.list.more', { count: visible.length - LIST_LIMIT })}</p>
              )}
            </div>
          )}
        </div>

        {/* 6. Health and journal: for diagnosis, closed by default */}
        <details>
          <summary className="card p-4 cursor-pointer text-sm font-medium">{t('efd.health.title')}</summary>
          <EfacturaStatsCard companyId={company?.id} />
        </details>
      </div>
    </div>
  )
}
