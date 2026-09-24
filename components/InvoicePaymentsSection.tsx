'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRoDate } from '@/lib/dates'
import { formatRon } from '@/lib/money'
import { remainingOf } from '@/lib/invoiceMath'
import { maskIban, paymentSourceKey } from '@/lib/bank/labels'
import { useLocale } from '@/components/LocaleProvider'
import type { MessageKey } from '@/lib/messages'

type Payment = {
  id: string
  amount: number
  paid_on: string
  source?: string | null
  method?: string | null
  match_rule?: string | null
  match_confidence?: number | null
  counterpart_name?: string | null
  counterpart_iban?: string | null
  bank_transaction_id?: string | null
}

export default function InvoicePaymentsSection({
  invoice,
  actorUserId,
  onChanged
}: {
  invoice: { id: string; total: number; amount_paid?: number | null; prepaid_amount?: number | null }
  actorUserId: string
  onChanged: () => void
}) {
  const { t } = useLocale()
  const [rows, setRows] = useState<Payment[]>([])
  const [busy, setBusy] = useState('')

  const load = async () => {
    const { data } = await supabase
      .from('invoice_payments')
      .select('id, amount, paid_on, source, method, match_rule, match_confidence, counterpart_name, counterpart_iban, bank_transaction_id')
      .eq('invoice_id', invoice.id)
      .order('paid_on', { ascending: false })
    setRows((data || []) as Payment[])
  }

  useEffect(() => {
    let cancelled = false
    supabase
      .from('invoice_payments')
      .select('id, amount, paid_on, source, method, match_rule, match_confidence, counterpart_name, counterpart_iban, bank_transaction_id')
      .eq('invoice_id', invoice.id)
      .order('paid_on', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setRows((data || []) as Payment[])
      })
    return () => { cancelled = true }
  }, [invoice.id])

  const undo = async (row: Payment) => {
    const whole = !row.bank_transaction_id
    const message = t('bank.pay.undoConfirm')
    if (!confirm(message)) return
    setBusy(row.id)
    const res = await fetch('/api/bank/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row.bank_transaction_id
        ? { action: 'undo', transactionId: row.bank_transaction_id, actorUserId }
        : { action: 'undo', paymentId: row.id, actorUserId })
    })
    setBusy('')
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || t('pay.saveFail'))
      return
    }
    void whole
    await load()
    onChanged()
  }

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-bold">{t('bank.pay.title')}</h3>
          <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
            {t('inv.collectedOf', { paid: formatRon(Number(invoice.amount_paid || 0)), total: formatRon(Number(invoice.total)) })}
            {remainingOf(invoice) > 0.01 ? ` · ${t('inv.remaining', { amount: formatRon(remainingOf(invoice)) })}` : ''}
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('bank.pay.empty')}</p>
      ) : (
        <div className="space-y-3 tabular-nums">
          {rows.map(row => (
            <div key={row.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm border-t border-gray-50 pt-3 first:border-0 first:pt-0">
              <div className="min-w-0">
                <p className="font-medium">{formatRon(row.amount)} · {formatRoDate(row.paid_on)}</p>
                <p className="text-xs text-[color:var(--color-muted-foreground)]">
                  {t(paymentSourceKey(row.source, row.method) as MessageKey)}
                  {row.counterpart_name ? ` · ${row.counterpart_name}` : ''}
                  {row.counterpart_iban ? ` · ${maskIban(row.counterpart_iban)}` : ''}
                </p>
                {row.match_rule && (
                  <p className="text-xs text-[color:var(--color-muted-foreground)]">{t('bank.pay.autoRule', { rule: row.match_rule })}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {row.bank_transaction_id && (
                  <Link href={`/banca?tx=${row.bank_transaction_id}`} className="text-xs underline">
                    {t('bank.pay.openTx')}
                  </Link>
                )}
                <button
                  type="button"
                  className="text-xs border border-gray-200 px-2 py-0.5 rounded-lg disabled:opacity-50"
                  disabled={busy === row.id}
                  onClick={() => undo(row)}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
