'use client'
import DateField from '@/components/DateField'
import { useLocale } from '@/components/LocaleProvider'
import { formatRoDate } from '@/lib/dates'
import { formatRon } from '@/lib/money'
import {
  plannedTotal,
  RECURRING_FREQUENCIES,
  upcomingDates,
  type RecurringEndMode,
  type RecurringSchedule
} from '@/lib/recurring'

const END_MODES: RecurringEndMode[] = ['never', 'count', 'until']

/** Schedule of a recurring invoice: how often, until when, and a preview of the next dates. */
export default function RecurringFields({
  value,
  onChange,
  amount,
  editDay = false,
  fromIndex = 1,
  generatedCount = 1
}: {
  value: RecurringSchedule
  onChange: (next: RecurringSchedule) => void
  /** One invoice of the series, in lei, for the preview. */
  amount?: number
  /** Lets the day of the month be changed (editing an existing series). */
  editDay?: boolean
  fromIndex?: number
  generatedCount?: number
}) {
  const { t } = useLocale()
  const set = (patch: Partial<RecurringSchedule>) => onChange({ ...value, ...patch })
  const next = upcomingDates(value, fromIndex, generatedCount, 3)
  const planned = plannedTotal(value)
  const dayLabel = value.anchor_day >= 31 ? t('recur.dayLast') : t('recur.dayN', { day: value.anchor_day })

  return (
    <div className="space-y-4">
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-1">{t('recur.frequency')}</p>
        <div className="segmented" role="radiogroup" aria-label={t('recur.frequency')}>
          {RECURRING_FREQUENCIES.map(f => (
            <button key={f} type="button" role="radio" aria-checked={value.frequency === f} data-active={value.frequency === f}
              className="segmented-btn" onClick={() => set({ frequency: f })}>
              {t(`recur.freq.${f}`)}
            </button>
          ))}
        </div>
        {editDay ? (
          <label className="flex items-center gap-2 mt-2 text-sm text-[color:var(--color-muted-foreground)]">
            {t('recur.issuedOn')}
            <select className="input w-auto py-1" value={value.anchor_day >= 31 ? 31 : value.anchor_day}
              onChange={e => set({ anchor_day: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
              <option value={31}>{t('recur.dayLastShort')}</option>
            </select>
          </label>
        ) : (
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">
            {t(`recur.cadence.${value.frequency}`, { day: dayLabel })}
          </p>
        )}
      </div>

      <div>
        <p className="block text-sm font-medium text-gray-700 mb-1">{t('recur.ends')}</p>
        <div className="segmented" role="radiogroup" aria-label={t('recur.ends')}>
          {END_MODES.map(mode => (
            <button key={mode} type="button" role="radio" aria-checked={value.end_mode === mode} data-active={value.end_mode === mode}
              className="segmented-btn" onClick={() => set({
                end_mode: mode,
                end_count: mode === 'count' ? (value.end_count || 12) : value.end_count,
                end_date: mode === 'until' ? (value.end_date || '') : value.end_date
              })}>
              {t(`recur.end.${mode}`)}
            </button>
          ))}
        </div>
        {value.end_mode === 'count' && (
          <label className="flex items-center gap-2 mt-2 text-sm">
            <input type="number" min={2} max={600} className="input w-24 py-1"
              value={value.end_count || ''}
              onChange={e => set({ end_count: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
            <span className="text-[color:var(--color-muted-foreground)]">{t('recur.countHint')}</span>
          </label>
        )}
        {value.end_mode === 'until' && (
          <div className="mt-2 max-w-[12rem]">
            <DateField value={value.end_date || ''} onChange={e => set({ end_date: e.target.value })} aria-label={t('recur.end.until')} />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[color:var(--color-border)] p-3 text-sm">
        {next.length ? (
          <p>
            <span className="text-[color:var(--color-muted-foreground)]">{t('recur.nextDates')} </span>
            {next.map(formatRoDate).join(' · ')}
            {planned ? <span className="text-[color:var(--color-muted-foreground)]"> · {t('recur.plannedTotal', { count: planned })}{amount ? `, ${formatRon(amount * planned)}` : ''}</span> : null}
          </p>
        ) : (
          <p className="text-[color:var(--color-muted-foreground)]">{t('recur.noNext')}</p>
        )}
        <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">{t('recur.draftMode')}</p>
        <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">{t('recur.placeholdersHint')}</p>
      </div>
    </div>
  )
}
