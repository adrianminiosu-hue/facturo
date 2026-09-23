'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { calendarDateInBucharest, formatRoDate } from '@/lib/dates'
import { formatRon } from '@/lib/money'
import { remainingOf } from '@/lib/invoiceMath'
import { useLocale } from '@/components/LocaleProvider'
import { isMessageKey, type MessageKey } from '@/lib/messages'

export const PAYMENT_METHODS = [
  { id: 'transfer' },
  { id: 'cash' },
  { id: 'card' },
  { id: 'compensation' },
  { id: 'other' }
] as const

export type PaymentRow = {
  id: string
  amount: number
  paid_on: string
  method: string
  reference?: string | null
  notes?: string | null
}

type InvoiceRef = {
  id: string
  series: string
  invoice_number: string
  total: number
  amount_paid?: number | null
  prepaid_amount?: number | null
  clients?: { company_name?: string } | null
}

function methodLabel(t: (key: MessageKey) => string, id: string) {
  const key = `pay.${id}`
  return isMessageKey(key) ? t(key) : id
}

function ron(n: number) {
  return formatRon(n)
}

export default function PaymentModal({
  invoice,
  userId,
  firmName,
  onClose,
  onSaved
}: {
  invoice: InvoiceRef
  userId: string
  firmName?: string
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useLocale()
  const rest = remainingOf(invoice)
  const [amount, setAmount] = useState(rest.toFixed(2))
  const [paidOn, setPaidOn] = useState(calendarDateInBucharest(0))
  const [method, setMethod] = useState('transfer')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [history, setHistory] = useState<PaymentRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadHistory = async () => {
      const { data } = await supabase
        .from('invoice_payments')
        .select('id, amount, paid_on, method, reference, notes')
        .eq('invoice_id', invoice.id)
        .order('paid_on', { ascending: false })
      setHistory((data || []) as PaymentRow[])
    }
    loadHistory()
  }, [invoice.id])

  const parsed = Number(String(amount).replace(',', '.'))
  const remainingAfter = useMemo(() => rest - (Number.isNaN(parsed) ? 0 : parsed), [rest, parsed])

  const save = async () => {
    setError('')
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError(t('pay.amountGt0'))
      return
    }
    if (parsed > rest + 0.009) {
      setError(t('pay.overRest', { amount: ron(rest) }))
      return
    }
    if (!paidOn) {
      setError(t('pay.needDate'))
      return
    }
    setSaving(true)
    const insert = await supabase.from('invoice_payments').insert({
      invoice_id: invoice.id,
      user_id: userId,
      amount: parsed,
      paid_on: paidOn,
      method,
      reference: reference.trim() || null,
      notes: notes.trim() || null
    })

    const paidSoFar = Number(invoice.amount_paid || 0) + parsed
    const fullyPaid = paidSoFar >= Number(invoice.total) - 0.009
    const invoiceUpdate: Record<string, unknown> = { amount_paid: paidSoFar }
    if (fullyPaid) invoiceUpdate.status = 'paid'

    if (insert.error) {
      const fallback = await supabase.from('invoices').update(invoiceUpdate).eq('id', invoice.id)
      setSaving(false)
      if (fallback.error) {
        setError(t('pay.saveFail'))
        return
      }
      onSaved()
      return
    }

    await supabase.from('invoices').update(invoiceUpdate).eq('id', invoice.id)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40" onClick={onClose}>
      <div className="card w-full max-w-lg p-7 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <p className="kicker mb-2">{t('pay.title')}</p>
        <h3 className="brand text-2xl mb-1">{invoice.series}{invoice.invoice_number}</h3>
        <p className="text-sm text-[color:var(--color-muted-foreground)] mb-5">
          {firmName ? `${firmName} · ` : ''}{invoice.clients?.company_name || t('common.client')}
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6 text-sm">
          <div className="rounded-xl bg-[color:var(--color-muted)] p-3">
            <p className="text-[11px] uppercase tracking-wide text-[color:var(--color-muted-foreground)]">{t('common.total')}</p>
            <p className="mt-1 font-medium">{ron(Number(invoice.total))}</p>
          </div>
          <div className="rounded-xl bg-[color:var(--color-muted)] p-3">
            <p className="text-[11px] uppercase tracking-wide text-[color:var(--color-muted-foreground)]">{t('pay.already')}</p>
            <p className="mt-1 font-medium">{ron(Number(invoice.amount_paid || 0))}</p>
          </div>
          <div className="rounded-xl bg-[color:var(--color-muted)] p-3">
            <p className="text-[11px] uppercase tracking-wide text-[color:var(--color-muted-foreground)]">{t('pay.rest')}</p>
            <p className="mt-1 font-medium">{ron(rest)}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1 text-[color:var(--color-muted-foreground)]">{t('pay.amountNow')}</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="input"
              />
              <button type="button" className="btn btn-outline shrink-0" onClick={() => setAmount(rest.toFixed(2))}>
                {t('pay.allRest')}
              </button>
            </div>
            {!Number.isNaN(parsed) && parsed > 0 && (
              <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
                {remainingAfter <= 0.009 ? t('pay.closes') : t('pay.left', { amount: ron(Math.max(0, remainingAfter)) })}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1 text-[color:var(--color-muted-foreground)]">{t('pay.date')}</label>
              <input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-sm mb-1 text-[color:var(--color-muted-foreground)]">{t('pay.method')}</label>
              <select value={method} onChange={e => setMethod(e.target.value)} className="input bg-white">
                {PAYMENT_METHODS.map(m => (
                  <option key={m.id} value={m.id}>{methodLabel(t, m.id)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1 text-[color:var(--color-muted-foreground)]">{t('pay.ref')}</label>
            <input
              value={reference}
              onChange={e => setReference(e.target.value)}
              className="input"
              placeholder={t('pay.refPh')}
            />
          </div>
          <div>
            <label className="block text-sm mb-1 text-[color:var(--color-muted-foreground)]">{t('pay.note')}</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="input"
              placeholder={t('common.optional')}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button onClick={save} disabled={saving} className="btn btn-primary disabled:opacity-50">
            {saving ? t('pay.saving') : t('pay.save')}
          </button>
          <button onClick={onClose} className="btn btn-outline">{t('common.cancel')}</button>
        </div>

        {history.length > 0 && (
          <div className="mt-8 border-t border-[color:var(--color-border)] pt-5">
            <p className="kicker mb-3">{t('pay.history')}</p>
            <div className="space-y-2">
              {history.map(p => (
                <div key={p.id} className="flex justify-between gap-3 text-sm">
                  <div>
                    <p>{formatRoDate(p.paid_on)} · {methodLabel(t, p.method)}</p>
                    <p className="text-xs text-[color:var(--color-muted-foreground)]">
                      {p.reference || p.notes || '—'}
                    </p>
                  </div>
                  <p className="font-medium shrink-0">{ron(Number(p.amount))}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
