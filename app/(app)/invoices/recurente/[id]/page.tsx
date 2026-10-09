'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import RecurringFields from '@/components/RecurringFields'
import InvoiceLineItems, { type InvoiceLineItem } from '@/components/InvoiceLineItems'
import { useCompany } from '@/components/CompanyProvider'
import { useLocale } from '@/components/LocaleProvider'
import { supabase } from '@/lib/supabase'
import { addDaysIso, calendarDateInBucharest } from '@/lib/dates'
import { computeInvoiceTotals } from '@/lib/invoiceMath'
import { emptyInvoiceFx, type InvoiceFxValue } from '@/lib/invoiceFx'
import {
  nextOccurrenceAfter,
  occurrenceDate,
  validateSchedule,
  withinEnd,
  type RecurringRow,
  type RecurringSchedule
} from '@/lib/recurring'
import { buildTemplate, loadRecurring } from '@/lib/recurringClient'

function scheduleOf(row: RecurringRow): RecurringSchedule {
  return {
    frequency: row.frequency,
    anchor_day: row.anchor_day,
    start_date: row.start_date,
    end_mode: row.end_mode,
    end_count: row.end_count ?? null,
    end_date: row.end_date ?? null
  }
}

/**
 * Where the series continues after an edit. A new frequency or day re-anchors the schedule on the
 * last invoice already produced, so nothing already issued is re-dated.
 */
function rescheduled(row: RecurringRow, next: RecurringSchedule, today: string) {
  const before = scheduleOf(row)
  const cadenceChanged = before.frequency !== next.frequency || before.anchor_day !== next.anchor_day
  let schedule = next
  let nextIndex = row.next_index
  let nextDate = row.next_run_date || occurrenceDate(before, row.next_index)
  if (cadenceChanged) {
    const lastDate = occurrenceDate(before, Math.max(0, row.next_index - 1))
    schedule = { ...next, start_date: lastDate }
    const upcoming = nextOccurrenceAfter(schedule, lastDate > addDaysIso(today, -1) ? lastDate : addDaysIso(today, -1))
    nextIndex = upcoming.index
    nextDate = upcoming.date
  }
  const open = withinEnd(schedule, row.generated_count, nextDate)
  return {
    ...schedule,
    next_index: nextIndex,
    next_run_date: open ? nextDate : null,
    status: row.status === 'paused' ? 'paused' : (open ? 'active' : 'ended')
  }
}

export default function EditRecurringPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const { t } = useLocale()
  const { userId, loading: companyLoading } = useCompany()
  const [row, setRow] = useState<RecurringRow | null>(null)
  const [schedule, setSchedule] = useState<RecurringSchedule | null>(null)
  const [items, setItems] = useState<InvoiceLineItem[]>([])
  const [fx, setFx] = useState<InvoiceFxValue>(emptyInvoiceFx())
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const today = calendarDateInBucharest(0)

  useEffect(() => {
    if (companyLoading || !userId) return
    loadRecurring(id).then(found => {
      if (!found) { router.replace('/invoices/recurente'); return }
      setRow(found)
      setSchedule(scheduleOf(found))
      setNotes(found.template?.notes || '')
      setTerms(found.template?.payment_terms_days == null ? '' : String(found.template.payment_terms_days))
      setFx({ enabled: !!found.template?.fx_eur, rate: Number(found.template?.fx_rate || 0), source: 'BNR', date: '' })
      setItems((found.template?.lines || []).map(line => ({
        description: line.description,
        quantity: Number(line.quantity) || 0,
        unit_price: Number(line.unit_price) || 0,
        tva_rate: Number(line.tva_rate) || 0,
        total: 0,
        unit_code: line.unit_code || 'H87',
        vat_category: line.vat_category || (Number(line.tva_rate) > 0 ? 'S' : 'Z'),
        vat_exemption_reason: line.vat_exemption_reason || '',
        discount_percent: Number(line.discount_percent) || 0
      })))
      setLoading(false)
    }).catch(() => router.replace('/invoices/recurente'))
  }, [id, userId, companyLoading, router])

  if (loading || !row || !schedule) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-[color:var(--color-muted-foreground)]">{t('common.loading')}</p>
      </div>
    )
  }

  const totals = computeInvoiceTotals(items, {
    discount_percent: Number(row.template?.discount_percent || 0),
    exchange_rate: fx.enabled ? fx.rate : 0
  })
  const preview = rescheduled(row, schedule, today)

  const save = async () => {
    const invalid = validateSchedule(preview)
    if (invalid && invalid !== 'recur.err.untilEarly') { alert(t(invalid)); return }
    if (!items.length || items.some(i => !i.description)) { alert(t('inv.completeLines')); return }
    if (fx.enabled && !(fx.rate > 0)) { alert(t('inv.fxRequired')); return }
    const termDays = terms.trim() === '' ? null : Math.max(0, Math.min(365, parseInt(terms, 10) || 0))
    const template = {
      ...buildTemplate({
        header: { ...row.template, notes },
        items,
        fxRate: fx.enabled ? fx.rate : null
      }),
      payment_terms_days: termDays
    }
    setSaving(true)
    const { error } = await supabase.from('recurring_invoices').update({
      ...preview,
      template,
      updated_at: new Date().toISOString()
    }).eq('id', row.id)
    setSaving(false)
    if (error) { alert(error.message); return }
    router.push('/invoices/recurente')
  }

  return (
    <div className="app-shell">
      <AppNav active="recurring" />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="kicker mb-2">{t('recur.editKicker')}</p>
            <h2 className="page-title text-[color:var(--color-foreground)]">{row.clients?.company_name || t('recur.clientMissing')}</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">{t('recur.editLead')}</p>
          </div>
          <Link href="/invoices/recurente" className="text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]">
            {t('recur.back')}
          </Link>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="font-bold mb-4">{t('recur.scheduleTitle')}</h3>
            <RecurringFields
              value={{ ...schedule, start_date: preview.start_date }}
              onChange={next => setSchedule({ ...next, start_date: schedule.start_date })}
              amount={totals.total}
              editDay
              fromIndex={preview.next_index}
              generatedCount={row.generated_count}
            />
          </div>

          <InvoiceLineItems items={items} onChange={setItems} fx={fx} onFxChange={setFx} taxPointDate={today} />

          <div className="card p-6 grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-bold mb-2">{t('recur.terms')}</h3>
              <input type="number" min={0} max={365} className="input w-32" value={terms}
                placeholder={t('recur.termsClient')}
                onChange={e => setTerms(e.target.value)} />
              <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">{t('recur.termsHint')}</p>
            </div>
            <div>
              <h3 className="font-bold mb-2">{t('inv.notes')}</h3>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input text-sm" rows={3} />
            </div>
          </div>

          <div className="card px-6 py-4 flex flex-wrap gap-3 items-center">
            <button onClick={save} disabled={saving} className="btn btn-primary disabled:opacity-50">
              {saving ? t('common.saving') : t('recur.saveTemplate')}
            </button>
            <p className="text-xs text-[color:var(--color-muted-foreground)]">{t('recur.futureOnly')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
