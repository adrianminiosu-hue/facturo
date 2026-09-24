'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppNav from '@/components/AppNav'
import StatementImportModal from '@/components/StatementImportModal'
import { useCompany } from '@/components/CompanyProvider'
import { supabase } from '@/lib/supabase'
import { formatRoDate } from '@/lib/dates'
import { formatRon } from '@/lib/money'
import { remainingOf } from '@/lib/invoiceMath'
import { confidenceKind, maskIban } from '@/lib/bank/labels'
import { isPurchaseInvoice } from '@/lib/invoiceStatus'
import { useLocale } from '@/components/LocaleProvider'
import type { MessageKey } from '@/lib/messages'

type Tx = {
  id: string
  booking_date: string
  amount: number
  currency?: string | null
  counterparty_name?: string | null
  counterparty_iban?: string | null
  description?: string | null
  match_status: string
  ignored_reason?: string | null
  source?: string | null
  fingerprint?: string | null
  value_date?: string | null
  bank_account_id?: string | null
}

type Suggestion = {
  bank_transaction_id: string
  invoice_id: string
  amount: number
  confidence: number
  rule: string
}

type InvoiceOpt = {
  id: string
  series: string
  invoice_number: string
  client_id?: string | null
  total: number
  amount_paid?: number | null
  prepaid_amount?: number | null
  direction?: string | null
  notes?: string | null
  clients?: { company_name?: string | null } | null
}

type PaymentRow = {
  invoice_id: string
  amount: number
  bank_transaction_id?: string | null
}

function paidOf(invoiceId: string, invoice: InvoiceOpt, payments: PaymentRow[]) {
  const paySum = payments.filter(row => row.invoice_id === invoiceId).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  return Math.max(paySum, Number(invoice.amount_paid || 0))
}

function restOf(invoice: InvoiceOpt, payments: PaymentRow[]) {
  return remainingOf({
    total: invoice.total,
    prepaid_amount: invoice.prepaid_amount,
    amount_paid: paidOf(invoice.id, invoice, payments)
  })
}

function canLink(invoice: InvoiceOpt, payments: PaymentRow[]) {
  return restOf(invoice, payments) <= 0.01
    && payments.some(row => row.invoice_id === invoice.id && !row.bank_transaction_id)
}

function BancaPageInner() {
  const router = useRouter()
  const search = useSearchParams()
  const { t } = useLocale()
  const { userId, company, ownerUserId, loading: companyLoading } = useCompany()
  const [tab, setTab] = useState<'inbox' | 'all'>(() => search.get('tab') === 'all' ? 'all' : 'inbox')
  const [txs, setTxs] = useState<Tx[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [invoices, setInvoices] = useState<InvoiceOpt[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [accounts, setAccounts] = useState<Array<{ id: string; iban: string }>>([])
  const [dir, setDir] = useState<'all' | 'in' | 'out'>('all')
  const [accountId, setAccountId] = useState('')
  const [status, setStatus] = useState('confirmed')
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const [openId, setOpenId] = useState(search.get('tx') || '')
  const [importOpen, setImportOpen] = useState(false)
  const [pickId, setPickId] = useState('')
  const [pickAlloc, setPickAlloc] = useState<Array<{ invoiceId: string; amount: string }>>([{ invoiceId: '', amount: '' }])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!company?.id) {
      setTxs([])
      setLoading(false)
      return
    }
    const txQuery = supabase.from('bank_transactions').select('*').eq('company_id', company.id).order('booking_date', { ascending: false })
    const [txRes, sugRes, invRes, payRes, accRes] = await Promise.all([
      txQuery,
      supabase.from('bank_match_suggestions').select('bank_transaction_id, invoice_id, amount, confidence, rule').eq('company_id', company.id),
      supabase.from('invoices').select('id, series, invoice_number, client_id, total, amount_paid, prepaid_amount, direction, notes, clients(company_name)').eq('company_id', company.id),
      supabase.from('invoice_payments').select('invoice_id, amount, bank_transaction_id').eq('company_id', company.id),
      supabase.from('bank_accounts').select('id, iban').eq('company_id', company.id)
    ])
    setTxs((txRes.data || []) as Tx[])
    setSuggestions((sugRes.data || []) as Suggestion[])
    setInvoices((invRes.data || []) as InvoiceOpt[])
    setPayments((payRes.data || []) as PaymentRow[])
    setAccounts((accRes.data || []) as Array<{ id: string; iban: string }>)
    setLoading(false)
  }

  useEffect(() => {
    if (companyLoading) return
    if (!userId || !company?.id) {
      setLoading(false)
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login')
      else load()
    })
  }, [companyLoading, userId, company?.id])

  const inbox = useMemo(
    () => txs.filter(tx => tx.match_status === 'suggested' || tx.match_status === 'unmatched'),
    [txs]
  )

  const visible = useMemo(() => {
    const base = tab === 'inbox' ? inbox : txs
    return base.filter(tx => {
      if (dir === 'in' && tx.amount <= 0) return false
      if (dir === 'out' && tx.amount >= 0) return false
      if (accountId && tx.bank_account_id !== accountId) return false
      if (tab === 'all') {
        if (status === 'ignored' && tx.match_status !== 'ignored') return false
        if (status === 'inbox' && !['suggested', 'unmatched'].includes(tx.match_status)) return false
        if (status === 'auto' && tx.match_status !== 'matched') return false
        if ((status === 'confirmed' || !status) && !['matched', 'partially_matched'].includes(tx.match_status)) return false
      }
      if (q) {
        const hay = `${tx.counterparty_name || ''} ${tx.description || ''}`.toLowerCase()
        if (!hay.includes(q.toLowerCase())) return false
      }
      return true
    })
  }, [tab, inbox, txs, dir, accountId, status, q])

  const sugFor = (id: string) => suggestions.filter(row => row.bank_transaction_id === id)

  const act = async (action: string, body: Record<string, unknown>) => {
    const res = await fetch('/api/bank/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, action, actorUserId: userId })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(data.error || t('imp.fail'))
      return
    }
    await load()
  }

  const confirmTx = async (tx: Tx) => {
    const sugs = sugFor(tx.id)
    if (!sugs.length) {
      setPickId(tx.id)
      return
    }
    await act('confirm', {
      transactionId: tx.id,
      allocations: sugs.map(row => ({ invoiceId: row.invoice_id, amount: row.amount }))
    })
  }

  const ignoreTx = async (tx: Tx, reason = 'altele') => {
    setTxs(current => current.map(row => (
      row.id === tx.id ? { ...row, match_status: 'ignored', ignored_reason: reason } : row
    )))
    await act('ignore', { transactionId: tx.id, reason })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === '/') {
        event.preventDefault()
        document.getElementById('bank-search')?.focus()
      }
      if (event.key === 'j') setCursor(c => Math.min(visible.length - 1, c + 1))
      if (event.key === 'k') setCursor(c => Math.max(0, c - 1))
      if (event.key === 'Enter' && visible[cursor]) confirmTx(visible[cursor])
      if (event.key === 'i' && visible[cursor]) ignoreTx(visible[cursor])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, cursor])

  const openTx = txs.find(tx => tx.id === openId)
  const pickTx = txs.find(tx => tx.id === pickId)

  return (
    <div className="app-shell">
      <AppNav active="banca" />
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-3xl">{t('bank.title')}</h2>
            <p className="text-[color:var(--color-muted-foreground)] mt-1">{t('bank.lead')}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}>{t('rec.importStatement')}</button>
        </div>

        <div className="flex gap-2 mb-4">
          <button type="button" className={tab === 'inbox' ? 'btn btn-primary' : 'btn btn-outline'} onClick={() => setTab('inbox')}>
            {t('bank.tab.inbox')}{inbox.length ? ` (${inbox.length})` : ''}
          </button>
          <button type="button" className={tab === 'all' ? 'btn btn-primary' : 'btn btn-outline'} onClick={() => setTab('all')}>
            {t('bank.tab.txs')}
          </button>
          <span className="btn btn-outline opacity-50 cursor-not-allowed">{t('bank.tab.overview')} · {t('bank.soon')}</span>
          <span className="btn btn-outline opacity-50 cursor-not-allowed">{t('bank.tab.accounts')} · {t('bank.soon')}</span>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <select className="select" value={dir} onChange={e => setDir(e.target.value as 'all' | 'in' | 'out')}>
            <option value="all">{t('bank.filter.all')}</option>
            <option value="in">{t('bank.filter.in')}</option>
            <option value="out">{t('bank.filter.out')}</option>
          </select>
          <select className="select" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">{t('bank.filter.account')}</option>
            {accounts.map(account => <option key={account.id} value={account.id}>{account.iban}</option>)}
          </select>
          {tab === 'all' && (
            <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="confirmed">{t('bank.status.confirmed')}</option>
              <option value="ignored">{t('bank.status.ignored')}</option>
              <option value="inbox">{t('bank.status.inbox')}</option>
              <option value="auto">{t('bank.status.auto')}</option>
              <option value="all">{t('bank.filter.all')}</option>
            </select>
          )}
          <input id="bank-search" className="input max-w-xs" value={q} onChange={e => setQ(e.target.value)} placeholder={t('common.search')} />
        </div>

        {tab === 'inbox' && visible.filter(tx => {
          const top = sugFor(tx.id)[0]
          return top && top.confidence >= 70
        }).length > 0 && (
          <button
            type="button"
            className="btn btn-outline mb-3"
            onClick={async () => {
              const rows = visible.filter(tx => (sugFor(tx.id)[0]?.confidence || 0) >= 70)
              for (const tx of rows) await confirmTx(tx)
            }}
          >
            {t('bank.bulk.confirm')}
          </button>
        )}

        {companyLoading || (loading && !!company?.id) ? (
          <p className="text-[color:var(--color-muted-foreground)] py-12 text-center">{t('common.loading')}</p>
        ) : visible.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="font-medium">{t('bank.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((tx, index) => {
              const sugs = sugFor(tx.id)
              const top = sugs[0]
              const inv = invoices.find(row => row.id === top?.invoice_id)
              const kind = confidenceKind(top?.confidence)
              return (
                <div
                  key={tx.id}
                  className={`card p-4 tabular-nums ${index === cursor ? 'ring-1 ring-[color:var(--color-foreground)]' : ''}`}
                  onClick={() => { setCursor(index); setOpenId(tx.id) }}
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                    <div className="min-w-0">
                      <p className="text-sm">{formatRoDate(tx.booking_date)} · {tx.counterparty_name || t('rec.unknownPayer')}</p>
                      <p className="text-xs text-[color:var(--color-muted-foreground)]">{maskIban(tx.counterparty_iban)}</p>
                      <p className="text-xs text-[color:var(--color-muted-foreground)] truncate" title={tx.description || ''}>{tx.description}</p>
                      {top && inv && (
                        <p className="text-xs mt-1">
                          {inv.series}{inv.invoice_number} · {inv.clients?.company_name} · {restOf(inv, payments) > 0.01 ? `${t('pay.rest')} ${formatRon(restOf(inv, payments))}` : t('bank.rest.none')} · {t(`bank.conf.${kind}` as MessageKey)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={tx.amount > 0 ? 'text-green-700 font-medium' : 'font-medium'}>{formatRon(tx.amount)}</span>
                      {tab === 'inbox' && (
                        <>
                          <button type="button" className="btn btn-success text-xs px-3 min-w-[5.75rem] bg-green-300 hover:bg-green-400 text-green-950 border-green-400" onClick={e => { e.stopPropagation(); confirmTx(tx) }}>{t('bank.action.confirm')}</button>
                          <button type="button" className="btn btn-outline text-xs px-2 py-1" onClick={e => { e.stopPropagation(); setPickId(tx.id) }}>{t('bank.action.pick')}</button>
                          <button
                            type="button"
                            className="btn btn-danger text-xs px-3 min-w-[5.75rem] bg-red-300 hover:bg-red-400 text-red-950 border-red-400"
                            onClick={e => { e.stopPropagation(); ignoreTx(tx) }}
                          >
                            {t('bank.action.ignore')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {openTx && tab === 'all' && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setOpenId('')}>
          <aside className="bg-[color:var(--color-background)] w-full max-w-md h-full p-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-3">{t('bank.tx.detail')}</h3>
            <p className="text-sm">{formatRoDate(openTx.booking_date)} · {formatRon(openTx.amount)}</p>
            <p className="text-sm mt-1">{openTx.counterparty_name} · {maskIban(openTx.counterparty_iban)}</p>
            <p className="text-sm mt-2 whitespace-pre-wrap">{openTx.description}</p>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-3">{t('bank.tx.source')}: {openTx.source} · {openTx.fingerprint}</p>
            <div className="flex gap-2 mt-4">
              <button type="button" className="btn btn-outline" onClick={() => act('undo', { transactionId: openTx.id })}>{t('bank.action.undo')}</button>
              <button type="button" className="btn btn-primary" onClick={() => setPickId(openTx.id)}>{t('bank.action.reallocate')}</button>
            </div>
          </aside>
        </div>
      )}

      {pickTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setPickId('')}>
          <div className="card w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-3">{t('bank.action.pick')}</h3>
            {pickAlloc.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_7rem] gap-2 mb-2">
                <select
                  className="select"
                  value={row.invoiceId}
                  onChange={e => {
                    const next = [...pickAlloc]
                    next[index] = { ...row, invoiceId: e.target.value }
                    setPickAlloc(next)
                  }}
                >
                  <option value="">{t('bank.pick.invoice')}</option>
                  {invoices
                    .filter(inv => pickTx.amount > 0 ? !isPurchaseInvoice(inv) : isPurchaseInvoice(inv))
                    .filter(inv => restOf(inv, payments) > 0.01 || canLink(inv, payments))
                    .map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.series}{inv.invoice_number} · {inv.clients?.company_name} · {restOf(inv, payments) > 0.01 ? formatRon(restOf(inv, payments)) : t('bank.rest.none')}
                      </option>
                    ))}
                </select>
                <input
                  className="input"
                  value={row.amount}
                  onChange={e => {
                    const next = [...pickAlloc]
                    next[index] = { ...row, amount: e.target.value }
                    setPickAlloc(next)
                  }}
                />
              </div>
            ))}
            <button type="button" className="text-xs underline mb-3" onClick={() => setPickAlloc([...pickAlloc, { invoiceId: '', amount: '' }])}>
              {t('bank.pick.add')}
            </button>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setPickId('')}>{t('common.cancel')}</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  const allocations = pickAlloc
                    .filter(row => row.invoiceId && Number(row.amount) > 0)
                    .map(row => ({ invoiceId: row.invoiceId, amount: Number(row.amount) }))
                  await act('confirm', { transactionId: pickTx.id, allocations })
                  setPickId('')
                }}
              >
                {t('bank.action.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && company?.id && (
        <StatementImportModal
          userId={ownerUserId || userId}
          companyId={company.id}
          companyName={company.company_name}
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false); load() }}
        />
      )}
    </div>
  )
}

export default function BancaPage() {
  return (
    <Suspense fallback={<div className="app-shell" />}>
      <BancaPageInner />
    </Suspense>
  )
}
