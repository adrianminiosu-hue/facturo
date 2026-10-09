'use client'
import { useState } from 'react'
import RecurringFields from '@/components/RecurringFields'
import { useLocale } from '@/components/LocaleProvider'
import { defaultSchedule, validateSchedule, type RecurringSchedule } from '@/lib/recurring'

/** "Make it recurring" on an existing invoice: that invoice becomes the first of the series. */
export default function RecurringModal({
  issueDate,
  amount,
  title,
  onClose,
  onSave
}: {
  issueDate: string
  amount?: number
  title: string
  onClose: () => void
  onSave: (schedule: RecurringSchedule) => Promise<void>
}) {
  const { t } = useLocale()
  const [schedule, setSchedule] = useState<RecurringSchedule>(defaultSchedule(issueDate))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    const invalid = validateSchedule(schedule)
    if (invalid) { setError(t(invalid)); return }
    setBusy(true)
    setError('')
    try {
      await onSave(schedule)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('recur.saveError'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40" onClick={onClose}>
      <div className="card w-full max-w-lg p-7 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <p className="kicker mb-2">{t('recur.makeRecurring')}</p>
        <h3 className="text-xl font-semibold tracking-tight mb-1">{title}</h3>
        <p className="text-sm text-[color:var(--color-muted-foreground)] mb-5">{t('recur.modalLead')}</p>
        <RecurringFields value={schedule} onChange={setSchedule} amount={amount} />
        {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? t('common.saving') : t('recur.schedule')}
          </button>
        </div>
      </div>
    </div>
  )
}
