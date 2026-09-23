'use client'
import { useLocale } from '@/components/LocaleProvider'
import type { Locale } from '@/lib/i18n'

const OPTIONS: { id: Locale; label: string }[] = [
  { id: 'ro', label: 'RO' },
  { id: 'en', label: 'EN' }
]

export default function LocaleSwitch() {
  const { locale, setLocale, t } = useLocale()

  return (
    <div className="locale-switch" role="group" aria-label={t('nav.language')}>
      {OPTIONS.map(option => (
        <button
          key={option.id}
          type="button"
          className="locale-switch-btn"
          data-active={locale === option.id}
          onClick={() => setLocale(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
