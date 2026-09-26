'use client'
import { useEffect, useMemo, useState } from 'react'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { useLocale } from '@/components/LocaleProvider'

type KpiDraft = { name: string; unit: string; target: string }
type Draft = {
  title: string
  period: 'month' | 'quarter' | 'year'
  notes: string
  kpis: KpiDraft[]
}

const EMPTY_KPIS: KpiDraft[] = [
  { name: '', unit: '', target: '' },
  { name: '', unit: '', target: '' },
  { name: '', unit: '', target: '' },
  { name: '', unit: '', target: '' }
]

function storageKey(companyId: string | undefined, slot: number) {
  return `facturo_dash_${slot}_${companyId || 'none'}`
}

export default function DashboardWorkspace({ slot }: { slot: 1 | 2 | 3 | 4 | 5 }) {
  const { t } = useLocale()
  const { company } = useCompany()
  const fallbackTitle = t(`nav.dashboard${slot}`)
  const initial = useMemo<Draft>(
    () => ({ title: fallbackTitle, period: 'month', notes: '', kpis: EMPTY_KPIS }),
    [fallbackTitle]
  )
  const [draft, setDraft] = useState<Draft>(initial)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(company?.id, slot))
      if (!raw) {
        setDraft(initial)
        return
      }
      const parsed = JSON.parse(raw) as Partial<Draft>
      setDraft({
        title: parsed.title || initial.title,
        period: parsed.period === 'quarter' || parsed.period === 'year' ? parsed.period : 'month',
        notes: parsed.notes || '',
        kpis: Array.isArray(parsed.kpis) && parsed.kpis.length ? parsed.kpis.slice(0, 4).map(row => ({
          name: row?.name || '',
          unit: row?.unit || '',
          target: row?.target || ''
        })) : EMPTY_KPIS
      })
    } catch {
      setDraft(initial)
    }
    setSaved(false)
  }, [company?.id, slot, initial])

  const setKpi = (index: number, key: keyof KpiDraft, value: string) => {
    setDraft(current => ({
      ...current,
      kpis: current.kpis.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    }))
    setSaved(false)
  }

  const save = () => {
    try {
      localStorage.setItem(storageKey(company?.id, slot), JSON.stringify(draft))
      setSaved(true)
    } catch {
      setSaved(false)
    }
  }

  return (
    <div className="app-shell">
      <AppNav active={`dashboard-${slot}`} />
      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="page-toolbar">
          <div>
            <h2 className="page-title text-[color:var(--color-foreground)]">{draft.title || fallbackTitle}</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">{t('dash.workspace.lead')}</p>
          </div>
        </div>

        <form
          className="card p-8 space-y-6"
          onSubmit={event => {
            event.preventDefault()
            save()
          }}
        >
          <label className="block">
            <span className="block text-sm mb-1.5 text-[color:var(--color-foreground)]">{t('dash.workspace.name')}</span>
            <input
              className="input"
              value={draft.title}
              onChange={e => {
                setDraft(current => ({ ...current, title: e.target.value }))
                setSaved(false)
              }}
            />
          </label>

          <label className="block">
            <span className="block text-sm mb-1.5 text-[color:var(--color-foreground)]">{t('dash.workspace.period')}</span>
            <select
              className="select"
              value={draft.period}
              onChange={e => {
                setDraft(current => ({ ...current, period: e.target.value as Draft['period'] }))
                setSaved(false)
              }}
            >
              <option value="month">{t('dash.workspace.periodMonth')}</option>
              <option value="quarter">{t('dash.workspace.periodQuarter')}</option>
              <option value="year">{t('dash.workspace.periodYear')}</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-sm mb-1.5 text-[color:var(--color-foreground)]">{t('dash.workspace.notes')}</span>
            <textarea
              className="input min-h-28"
              value={draft.notes}
              placeholder={t('dash.workspace.notesPh')}
              onChange={e => {
                setDraft(current => ({ ...current, notes: e.target.value }))
                setSaved(false)
              }}
            />
          </label>

          <fieldset>
            <legend className="text-sm font-medium mb-3 text-[color:var(--color-foreground)]">{t('dash.workspace.kpis')}</legend>
            <div className="space-y-3">
              {draft.kpis.map((row, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    className="input"
                    placeholder={t('dash.workspace.kpiName')}
                    value={row.name}
                    onChange={e => setKpi(index, 'name', e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder={t('dash.workspace.kpiUnit')}
                    value={row.unit}
                    onChange={e => setKpi(index, 'unit', e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder={t('dash.workspace.kpiTarget')}
                    value={row.target}
                    onChange={e => setKpi(index, 'target', e.target.value)}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary">
              {t('dash.workspace.save')}
            </button>
            {saved && <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('dash.workspace.saved')}</p>}
          </div>
        </form>
      </div>
    </div>
  )
}
