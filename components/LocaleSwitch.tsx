'use client'
import { useId } from 'react'
import { useLocale } from '@/components/LocaleProvider'
import type { Locale } from '@/lib/i18n'

function FlagRO() {
  return (
    <svg viewBox="0 0 3 3" aria-hidden="true" focusable="false">
      <rect width="1" height="3" x="0" fill="#002B7F" />
      <rect width="1" height="3" x="1" fill="#FCD116" />
      <rect width="1" height="3" x="2" fill="#CE1126" />
    </svg>
  )
}

/** Union Jack, cropped square around the centre. */
function FlagGB() {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="15 0 30 30" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id}-d`}>
          <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
        </clipPath>
      </defs>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" clipPath={`url(#${id}-d)`} />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  )
}

const OPTIONS: { id: Locale; name: string; Flag: () => React.ReactElement }[] = [
  { id: 'ro', name: 'Română', Flag: FlagRO },
  { id: 'en', name: 'English', Flag: FlagGB }
]

/** Language slider: two round flags, the active one sits on a thumb that slides between them. */
export default function LocaleSwitch() {
  const { locale, setLocale, t } = useLocale()

  return (
    <div className="locale-switch" role="radiogroup" aria-label={t('nav.language')} data-locale={locale}>
      <span className="locale-switch-thumb" aria-hidden="true" />
      {OPTIONS.map(({ id, name, Flag }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={locale === id}
          aria-label={name}
          title={name}
          className="locale-switch-btn"
          data-active={locale === id}
          onClick={() => setLocale(id)}
        >
          <span className="locale-flag"><Flag /></span>
        </button>
      ))}
    </div>
  )
}
