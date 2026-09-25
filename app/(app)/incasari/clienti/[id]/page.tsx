'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import PaymentModal from '@/components/PaymentModal'
import PaymentBehaviourBadge from '@/components/PaymentBehaviourBadge'
import AnafStatusBadges from '@/components/AnafStatusBadges'
import { anafStatusFromRow } from '@/lib/anafStatus'
import { authHeaders } from '@/lib/authHeaders'
import { useLocale } from '@/components/LocaleProvider'
import { useCompany } from '@/components/CompanyProvider'
import { addDaysIso, calendarDateInBucharest, daysBetween, formatRoDate } from '@/lib/dates'
import { formatRon } from '@/lib/money'
import { loadBilledByClient, loadCollectionData, loadReminderData, type CollectionData, type ReminderData } from '@/lib/collectionsData'
import { paymentDelay, settledHistory, summarizeClient, LATE_AVERAGE_DAYS } from '@/lib/clientCollections'
import {
  FORMAL_NOTICE_OFFSET,
  RECOMMENDED_OFFSETS,
  REMINDER_OFFSET_CHOICES,
  effectiveSettings,
  nextScheduled,
  normalizeOffsets,
  offsetLabel
} from '@/lib/reminderSchedule'

type Invoice = CollectionData['invoices'][number]
type HistoryItem = { date: string; title: string; sub: string; tone: 'blue' | 'green' | 'gray' }
type ClientRow = {
  id: string
  user_id: string
  company_id?: string | null
  email?: string | null
  vat_registered?: boolean | null
  is_public_institution?: boolean | null
  cui?: string | null
  anaf_checked_at?: string | null
  anaf_inactive?: boolean | null
  anaf_deregistered_on?: string | null
  anaf_efactura_registered?: boolean | null
  anaf_vat_on_collection?: boolean | null
  anaf_split_vat?: boolean | null
  payment_terms_days?: number | null
}
type Draft = { enabled: boolean; offsets: number[]; recipient: string }

const CHART_BARS = 8
const HISTORY_PREVIEW = 6
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ANAF_STALE_MS = 7 * 86400000
/** Shorter term suggested for clients who pay later and later. */
const SUGGESTED_TERMS_DAYS = 7

export default function ClientCollectionPage() {
  const { t, locale } = useLocale()
  const fmtDays = (n: number) => n.toLocaleString(locale === 'en' ? 'en-GB' : 'ro-RO', { maximumFractionDigits: 1 })
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const clientId = String(params?.id || '')
  const { userId, company, companies, ownerUserId, loading: companyLoading } = useCompany()
  const [data, setData] = useState<CollectionData | null>(null)
  const [clientRow, setClientRow] = useState<ClientRow | null>(null)
  const [billedByClient, setBilledByClient] = useState<Record<string, number>>({})
  const [reminders, setReminders] = useState<ReminderData | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState('')
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [payRow, setPayRow] = useState<Invoice | null>(null)
  const today = calendarDateInBucharest(0)
  const year = today.slice(0, 4)

  const loadReminders = async (invoiceIds: string[]) => {
    const next = await loadReminderData(supabase, clientId, invoiceIds)
    setReminders(next)
    const eff = effectiveSettings(clientId, next.settings)
    setDraft({ enabled: eff.enabled, offsets: eff.offsets, recipient: eff.recipient_email || '' })
  }

  // Background re-check at ANAF; the page never waits for it and ignores failures.
  const refreshAnaf = async () => {
    try {
      const res = await fetch('/api/clients/anaf-status', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ clientId })
      })
      if (!res.ok) return
      const body = await res.json()
      if (body?.status) setClientRow(prev => (prev ? { ...prev, ...body.status } : prev))
    } catch {
      // ANAF unreachable: keep the stored status.
    }
  }

  const load = async () => {
    try {
      const scope = { companyId: company?.id, ownerUserId: ownerUserId || userId }
      const [collection, clientRes, billed] = await Promise.all([
        loadCollectionData(supabase, { ...scope, clientId }),
        supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
        loadBilledByClient(supabase, scope, `${year}-01-01`)
      ])
      setData(collection)
      const row = (clientRes.data as ClientRow) || null
      setClientRow(row)
      if (row?.cui && (!row.anaf_checked_at || Date.now() - Date.parse(row.anaf_checked_at) > ANAF_STALE_MS)) refreshAnaf()
      setBilledByClient(billed)
      await loadReminders(collection.invoices.map(inv => inv.id))
    } catch (e) {
      setError((e as { message?: string })?.message || String(e))
    }
  }

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId || !clientId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      load()
    }
    init()
  }, [userId, company?.id, companyLoading, clientId])

  const client = data?.clients[clientId]
  const invoices = useMemo(() => data?.invoices || [], [data])
  const summary = useMemo(() => summarizeClient(clientId, invoices, today), [clientId, invoices, today])
  const history = useMemo(() => settledHistory(invoices, today), [invoices, today])
  const bars = history.slice(-CHART_BARS).map(inv => ({ inv, delay: paymentDelay(inv) ?? 0 }))
  const maxDelay = Math.max(1, ...bars.map(b => b.delay))
  const open = invoices.filter(inv => inv.rest > 0.009).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const billedYear = invoices.filter(inv => (inv.issue_date || '').startsWith(year))
  const billedYearTotal = billedYear.reduce((s, inv) => s + inv.billed, 0)
  const firstIssue = invoices.reduce<string>((min, inv) => (inv.issue_date && (!min || inv.issue_date < min) ? inv.issue_date : min), '')
  const clientSince = firstIssue ? `${firstIssue.slice(5, 7)}.${firstIssue.slice(0, 4)}` : ''

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : 0)
  const recent = bars.slice(-3).map(b => b.delay)
  const earlier = bars.slice(-6, -3).map(b => b.delay)
  // Average delay of invoices settled 6–12 months ago, to compare with today's average.
  const pastDelays = invoices
    .filter(inv => inv.settled_on && inv.settled_on < addDaysIso(today, -182) && inv.settled_on >= addDaysIso(today, -365))
    .map(inv => paymentDelay(inv))
    .filter((d): d is number => d !== null)
  const pastAverage = pastDelays.length ? avg(pastDelays) : null

  const ranking = Object.entries(billedByClient).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const rank = ranking.findIndex(([id]) => id === clientId) + 1

  const settings = effectiveSettings(clientId, reminders?.settings)
  const recipient = settings.recipient_email || client?.email || ''
  const logByInvoice = useMemo(() => {
    const map: Record<string, ReminderData['log']> = {}
    for (const entry of reminders?.log || []) (map[entry.invoice_id] ||= []).push(entry)
    return map
  }, [reminders])

  const reminderInfo = (inv: Invoice) => {
    const log = logByInvoice[inv.id] || []
    const last = log[0]
    const parts: string[] = []
    if (last) {
      const date = formatRoDate(last.sent_at.slice(0, 10))
      parts.push(last.kind === 'manual' || last.offset_days === null ? t('cc.remLastManual', { date }) : t('cc.remLast', { label: offsetLabel(last.offset_days), date }))
    } else if (inv.reminder_sent_at) {
      parts.push(t('cc.reminderSent', { date: formatRoDate(inv.reminder_sent_at) }))
    }
    if (!settings.enabled) {
      parts.push(t('cc.remOff'))
    } else if (settings.custom || !inv.reminder_sent_at) {
      const sent = log.filter(e => e.kind === 'auto' && e.offset_days !== null).map(e => e.offset_days as number)
      const next = nextScheduled(inv.due_date, today, settings, sent)
      if (next) parts.push(t('cc.remNext', { label: offsetLabel(next.offset), date: formatRoDate(next.date) }))
    }
    if (inv.promised_pay_date) parts.unshift(t('cc.promisedOn', { date: formatRoDate(inv.promised_pay_date) }))
    return parts.length ? parts.join(' · ') : t('cc.reminderNever')
  }

  const timeline: HistoryItem[] = useMemo(() => {
    if (!data) return []
    const ref = (id: string) => {
      const inv = invoices.find(i => i.id === id)
      return inv ? `${inv.series}${inv.invoice_number}` : ''
    }
    const items: HistoryItem[] = []
    for (const p of data.payments) {
      const inv = invoices.find(i => i.id === p.invoice_id)
      const late = inv ? Math.max(0, daysBetween(inv.due_date, p.paid_on)) : 0
      items.push({
        date: p.paid_on,
        title: t('cc.hPayment', { amount: formatRon(p.amount), invoice: ref(p.invoice_id) }),
        sub: `${formatRoDate(p.paid_on)} · ${p.bank_transaction_id ? t('cc.srcBank') : t('cc.srcManual')}${late ? ` · ${t('cc.lateDays', { count: late })}` : ''}`,
        tone: 'green'
      })
    }
    for (const inv of invoices) {
      const invRef = `${inv.series}${inv.invoice_number}`
      const log = logByInvoice[inv.id] || []
      for (const entry of log) {
        const day = entry.sent_at.slice(0, 10)
        items.push({
          date: entry.sent_at,
          title: entry.kind === 'manual' || entry.offset_days === null
            ? t('cc.hReminderManual', { invoice: invRef })
            : t('cc.hReminderAuto', { label: offsetLabel(entry.offset_days), invoice: invRef }),
          sub: formatRoDate(day),
          tone: 'blue'
        })
      }
      if (!log.length && inv.reminder_sent_at) items.push({ date: inv.reminder_sent_at, title: t('cc.hReminder', { invoice: invRef }), sub: formatRoDate(inv.reminder_sent_at), tone: 'blue' })
      if (inv.issue_date) items.push({ date: inv.issue_date, title: t('cc.hIssued', { invoice: invRef }), sub: `${formatRoDate(inv.issue_date)} · ${formatRon(inv.billed)}`, tone: 'gray' })
    }
    return items.sort((a, b) => b.date.localeCompare(a.date))
  }, [data, invoices, logByInvoice, t])
  const visibleTimeline = showAllHistory ? timeline : timeline.slice(0, HISTORY_PREVIEW)

  const sendReminder = async (inv: Invoice) => {
    if (!confirm(t('rec.confirmReminder', { ref: `${inv.series}${inv.invoice_number}` }))) return
    setBusyId(inv.id)
    try {
      const res = await fetch('/api/receivables/reminder', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ invoiceId: inv.id })
      })
      const body = await res.json()
      if (!res.ok) { alert(body.error || t('rec.reminderFail')); return }
      await load()
    } finally {
      setBusyId('')
    }
  }

  const [termsBusy, setTermsBusy] = useState(false)
  const setPaymentTerms = async (days: number) => {
    setTermsBusy(true)
    try {
      const { error: termsError } = await supabase.from('clients').update({ payment_terms_days: days }).eq('id', clientId)
      if (termsError) { alert(termsError.message); return }
      setClientRow(prev => (prev ? { ...prev, payment_terms_days: days } : prev))
    } finally {
      setTermsBusy(false)
    }
  }

  const saveSettings = async (next: Draft) => {
    if (!clientRow) return
    const email = next.recipient.trim()
    const offsets = normalizeOffsets(next.offsets)
    if (email && !EMAIL_RE.test(email)) { setSettingsMsg(t('cc.remInvalidEmail')); return }
    if (next.enabled && !offsets.length) { setSettingsMsg(t('cc.remNoOffsets')); return }
    setSavingSettings(true)
    setSettingsMsg('')
    try {
      const { error: saveError } = await supabase.from('client_reminder_settings').upsert({
        client_id: clientId,
        user_id: clientRow.user_id,
        company_id: clientRow.company_id || null,
        enabled: next.enabled,
        offsets,
        recipient_email: email || null,
        updated_by: userId,
        updated_at: new Date().toISOString()
      })
      if (saveError) { setSettingsMsg(saveError.message); return }
      await loadReminders(invoices.map(inv => inv.id))
      setSettingsMsg(t('cc.remSaved'))
    } finally {
      setSavingSettings(false)
    }
  }

  const toggleOffset = (offset: number) => {
    if (!draft) return
    const has = draft.offsets.includes(offset)
    setDraft({ ...draft, offsets: has ? draft.offsets.filter(o => o !== offset) : [...draft.offsets, offset].sort((a, b) => a - b) })
    setSettingsMsg('')
  }

  const dueLabel = (inv: Invoice) => {
    const days = daysBetween(today, inv.due_date)
    if (days < 0) return <span className="text-xs font-semibold text-amber-800">{t('rec.overdueDays', { count: Math.abs(days) })}</span>
    if (days === 0) return <span className="text-xs text-[color:var(--color-muted-foreground)]">{t('rec.today')}</span>
    return <span className="text-xs text-[color:var(--color-muted-foreground)]">{t('rec.daysLeft', { count: days })}</span>
  }

  const firmName = companies.find(c => c.id === payRow?.company_id)?.company_name || company?.company_name
  const primaryOpen = open[0]
  const oldestOverdue = open.find(inv => inv.due_date < today)
  const settingsDirty = !!draft && (
    draft.enabled !== settings.enabled ||
    draft.recipient.trim() !== (settings.recipient_email || '') ||
    normalizeOffsets(draft.offsets).join(',') !== settings.offsets.join(',') ||
    !settings.custom
  )

  return (
    <div className="app-shell">
      <AppNav active="receivables" />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Link href="/incasari/clienti" className="text-sm font-medium hover:underline">{t('cc.back')}</Link>

        {error ? (
          <div className="card p-8 text-center text-red-700 mt-6">{error}</div>
        ) : !data ? (
          <p className="text-[color:var(--color-muted-foreground)] text-center py-12">{t('common.loading')}</p>
        ) : !client ? (
          <div className="card p-12 text-center text-[color:var(--color-muted-foreground)] mt-6">{t('cc.notFound')}</div>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mt-4 mb-6">
              <div className="min-w-0">
                <h2 className="text-3xl text-[color:var(--color-foreground)]">{client.company_name}</h2>
                <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
                  {[
                    client.cui ? t('cc.cui', { cui: client.cui }) : '',
                    client.city || '',
                    clientSince ? t('cc.clientSince', { date: clientSince }) : '',
                    clientRow?.payment_terms_days != null ? t('cc.termsLine', { days: clientRow.payment_terms_days }) : ''
                  ]
                    .filter(Boolean).join(' · ')}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <PaymentBehaviourBadge behaviour={summary.behaviour} promise={summary.nextPromise} />
                  {clientRow && (
                    <AnafStatusBadges
                      status={anafStatusFromRow(clientRow)}
                      vatRegistered={clientRow.vat_registered}
                      publicInstitution={clientRow.is_public_institution}
                    />
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary text-sm" disabled={!primaryOpen} onClick={() => primaryOpen && setPayRow(primaryOpen)}>
                  {t('cc.recordPayment')}
                </button>
                <Link href={`/invoices/new?client=${clientId}`} className="btn btn-outline text-sm">{t('cc.newInvoice')}</Link>
                <button
                  type="button"
                  className="btn btn-outline text-sm"
                  disabled={!primaryOpen || !recipient || busyId === primaryOpen?.id}
                  title={recipient ? '' : t('cc.noEmail')}
                  onClick={() => primaryOpen && sendReminder(primaryOpen)}
                >
                  {busyId && busyId === primaryOpen?.id ? '…' : t('cc.sendReminder')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="card p-5">
                <p className="kicker mb-2">{t('cc.kpiBalance')}</p>
                <p className="text-2xl brand">{formatRon(summary.openAmount)}</p>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">{t(summary.openCount === 1 ? 'cc.openInvoicesOne' : 'cc.openInvoices', { count: summary.openCount })}</p>
              </div>
              <div className={`card p-5 ${summary.overdueAmount > 0 ? 'bg-amber-50' : ''}`}>
                <p className="kicker mb-2">{t('cc.kpiOverdue')}</p>
                <p className={`text-2xl brand ${summary.overdueAmount > 0 ? 'text-amber-800' : ''}`}>{formatRon(summary.overdueAmount)}</p>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
                  {oldestOverdue ? `${oldestOverdue.series}${oldestOverdue.invoice_number} · ${t('cc.overdueFor', { count: summary.oldestOverdueDays })}` : '—'}
                </p>
              </div>
              <div className="card p-5">
                <p className="kicker mb-2">{t('cc.kpiDelay')}</p>
                <p className="text-2xl brand">{summary.averageDelay === null ? '—' : t('cc.days', { count: fmtDays(summary.averageDelay) })}</p>
                <p className={`text-xs mt-1 ${summary.trend === 'worse' ? 'text-amber-800 font-medium' : 'text-[color:var(--color-muted-foreground)]'}`}>
                  {summary.averageDelay === null
                    ? t('cc.noData')
                    : pastAverage !== null
                      ? t('cc.delayVsPast', { days: pastAverage })
                      : summary.trend === 'worse' ? t('cc.trendWorse') : summary.trend === 'better' ? t('cc.trendBetter') : t('cc.kpiDelaySub', { count: summary.settledSampleSize })}
                </p>
              </div>
              <div className="card p-5">
                <p className="kicker mb-2">{t('cc.kpiBilledYear', { year })}</p>
                <p className="text-2xl brand">{formatRon(billedYearTotal)}</p>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
                  {t(billedYear.length === 1 ? 'cc.kpiBilledYearSubOne' : 'cc.kpiBilledYearSub', { count: billedYear.length })}
                  {rank > 0 && ranking.length > 1 ? ` · ${rank === 1 ? t('cc.rankFirst') : t('cc.rankN', { n: rank })}` : ''}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] gap-5 items-start">
              <div className="flex flex-col gap-5">
                <section className="card p-5">
                  <div className="flex items-baseline justify-between gap-3 mb-4">
                    <h3 className="font-semibold">{t('cc.chartTitle')}</h3>
                    {bars.length > 0 && <span className="text-xs text-[color:var(--color-muted-foreground)]">{t('cc.chartSub', { count: bars.length })}</span>}
                  </div>
                  {bars.length === 0 ? (
                    <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('cc.chartEmpty')}</p>
                  ) : (
                    <>
                      <div className="h-40 flex items-end gap-3 border-b border-gray-200" role="img" aria-label={t('cc.chartTitle')}>
                        {bars.map(({ inv, delay }) => (
                          <div key={inv.id} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${inv.series}${inv.invoice_number}: ${t('cc.lateDays', { count: delay })}`}>
                            <span className="text-xs text-[color:var(--color-foreground)]">{delay}</span>
                            <div
                              className={`w-full rounded-t ${delay > LATE_AVERAGE_DAYS ? 'bg-amber-400' : 'bg-blue-300'}`}
                              style={{ height: `${Math.max(3, (delay / maxDelay) * 120)}px` }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-3 mt-1">
                        {bars.map(({ inv }) => (
                          <span key={inv.id} className="flex-1 text-center text-[10px] text-[color:var(--color-muted-foreground)] truncate">{inv.series}{inv.invoice_number}</span>
                        ))}
                      </div>
                      <p className="text-xs text-[color:var(--color-muted-foreground)] mt-3">{t('cc.chartLegend', { days: LATE_AVERAGE_DAYS })}</p>
                    </>
                  )}
                </section>

                {summary.trend === 'worse' && earlier.length > 0 && (
                  <section className="card p-5 bg-amber-50 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-amber-900">{t('cc.suggestWorse', { from: avg(earlier), to: avg(recent) })}</p>
                      <p className="text-sm text-amber-900 mt-1">{t('cc.suggestText')}</p>
                    </div>
                    {clientRow && (clientRow.payment_terms_days == null || clientRow.payment_terms_days > SUGGESTED_TERMS_DAYS) && (
                      <button
                        type="button"
                        className="btn btn-outline text-sm bg-white"
                        disabled={termsBusy}
                        onClick={() => setPaymentTerms(SUGGESTED_TERMS_DAYS)}
                      >
                        {t('cc.setTerms', { days: SUGGESTED_TERMS_DAYS })}
                      </button>
                    )}
                    {reminders?.available && !settings.custom && (
                      <button
                        type="button"
                        className="btn btn-outline text-sm bg-white"
                        disabled={savingSettings}
                        onClick={() => saveSettings({ enabled: true, offsets: RECOMMENDED_OFFSETS, recipient: draft?.recipient || '' })}
                      >
                        {t('cc.suggestAction')}
                      </button>
                    )}
                  </section>
                )}

                <section className="card overflow-hidden">
                  <h3 className="font-semibold px-5 pt-5 pb-3">{t('cc.openTitle')}</h3>
                  {open.length === 0 ? (
                    <p className="px-5 pb-5 text-sm text-[color:var(--color-muted-foreground)]">{t('cc.noOpen')}</p>
                  ) : open.map(inv => (
                    <div key={inv.id} className="grid grid-cols-2 md:grid-cols-[7rem_8rem_1fr_minmax(10rem,1.4fr)_auto] gap-3 px-5 py-3 items-center border-t border-gray-100 text-sm">
                      <Link href={`/invoices/${inv.id}`} className="font-semibold hover:underline">{inv.series}{inv.invoice_number}</Link>
                      <div>
                        <span className="block">{formatRoDate(inv.due_date)}</span>
                        {dueLabel(inv)}
                      </div>
                      <span className="font-semibold md:text-right">{formatRon(inv.rest)}</span>
                      <span className="text-xs text-[color:var(--color-muted-foreground)]">{reminderInfo(inv)}</span>
                      <div className="col-span-2 md:col-span-1 flex gap-2 md:justify-end">
                        <button
                          type="button"
                          onClick={() => sendReminder(inv)}
                          disabled={busyId === inv.id || !recipient}
                          title={recipient ? '' : t('cc.noEmail')}
                          className="text-xs border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                        >
                          {busyId === inv.id ? '…' : t('cc.remindAction')}
                        </button>
                        <button type="button" onClick={() => setPayRow(inv)} className="text-xs border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
                          {t('cc.payAction')}
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              </div>

              <div className="flex flex-col gap-5">
                <section className="card p-5">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="font-semibold">{t('cc.remTitle')}</h3>
                    {reminders?.available && draft && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={draft.enabled}
                        onClick={() => { setDraft({ ...draft, enabled: !draft.enabled }); setSettingsMsg('') }}
                        className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${draft.enabled ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                      >
                        {draft.enabled ? t('cc.remOn') : t('cc.remOffShort')}
                      </button>
                    )}
                  </div>
                  {!reminders ? (
                    <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('common.loading')}</p>
                  ) : !reminders.available ? (
                    <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('cc.remUnavailable')}</p>
                  ) : draft && (
                    <div className="flex flex-col gap-4">
                      {!settings.custom && <p className="text-xs text-[color:var(--color-muted-foreground)]">{t('cc.remLegacy')}</p>}
                      {draft.enabled ? (
                        <div>
                          <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] mb-2">{t('cc.remSchedule')}</p>
                          <div className="flex flex-wrap gap-2">
                            {REMINDER_OFFSET_CHOICES.map(offset => {
                              const on = draft.offsets.includes(offset)
                              return (
                                <button
                                  key={offset}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => toggleOffset(offset)}
                                  className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${on ? 'bg-[color:var(--color-foreground)] text-white border-transparent' : 'bg-white border-gray-200 text-gray-700'}`}
                                >
                                  {offsetLabel(offset)}{offset >= FORMAL_NOTICE_OFFSET ? ` ${t('cc.remFormal')}` : ''}
                                </button>
                              )
                            })}
                          </div>
                          {!settings.custom && (
                            <button type="button" className="text-xs font-medium text-blue-700 hover:underline mt-2" onClick={() => setDraft({ ...draft, offsets: RECOMMENDED_OFFSETS })}>
                              {t('cc.remRecommended')}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('cc.remOffHint')}</p>
                      )}
                      <label className="block">
                        <span className="text-xs font-medium text-[color:var(--color-muted-foreground)]">{t('cc.remRecipient')}</span>
                        <input
                          type="email"
                          className="input mt-1 w-full"
                          value={draft.recipient}
                          placeholder={client.email || t('cc.remRecipientHint')}
                          onChange={e => { setDraft({ ...draft, recipient: e.target.value }); setSettingsMsg('') }}
                        />
                        {!client.email && !draft.recipient && <span className="block text-xs text-amber-800 mt-1">{t('cc.remNoEmail')}</span>}
                      </label>
                      <div className="flex items-center gap-3">
                        <button type="button" className="btn btn-primary text-sm" disabled={savingSettings || !settingsDirty} onClick={() => saveSettings(draft)}>
                          {savingSettings ? '…' : t('cc.remSave')}
                        </button>
                        {settingsMsg && <span className="text-xs text-[color:var(--color-muted-foreground)]">{settingsMsg}</span>}
                      </div>
                    </div>
                  )}
                </section>

                <section className="card p-5">
                  <h3 className="font-semibold mb-4">{t('cc.historyTitle')}</h3>
                  {timeline.length === 0 ? (
                    <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('cc.hEmpty')}</p>
                  ) : (
                    <>
                      <ol className="flex flex-col gap-4">
                        {visibleTimeline.map((item, i) => (
                          <li key={i} className="flex gap-3">
                            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${item.tone === 'green' ? 'bg-green-600' : item.tone === 'blue' ? 'bg-blue-600' : 'bg-gray-400'}`} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{item.title}</p>
                              <p className="text-xs text-[color:var(--color-muted-foreground)]">{item.sub}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                      {timeline.length > HISTORY_PREVIEW && (
                        <button type="button" className="text-sm font-medium text-blue-700 hover:underline mt-4" onClick={() => setShowAllHistory(v => !v)}>
                          {showAllHistory ? t('cc.historyLess') : `${t('cc.historyAll')} (${timeline.length})`}
                        </button>
                      )}
                    </>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
        {payRow && (
          <PaymentModal
            invoice={payRow}
            userId={ownerUserId || userId}
            companyId={payRow.company_id}
            firmName={firmName}
            onClose={() => setPayRow(null)}
            onSaved={() => { setPayRow(null); load() }}
          />
        )}
      </div>
    </div>
  )
}
