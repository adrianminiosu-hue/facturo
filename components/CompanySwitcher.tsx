'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Chevron from '@/components/Chevron'
import { useCompany } from '@/components/CompanyProvider'
import { useLocale } from '@/components/LocaleProvider'

function initials(name: string) {
  const words = name
    .replace(/\b(s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?|pfa|ii|if)\b\.?/gi, '')
    .split(/[\s\-.&]+/)
    .filter(Boolean)
  return ((words[0]?.[0] || '') + (words[1]?.[0] || words[0]?.[1] || '')).toUpperCase() || '·'
}

/** Workspace switcher at the top of the sidebar: the active company, and a menu to change or add one. */
export default function CompanySwitcher() {
  const router = useRouter()
  const { t } = useLocale()
  const { companies, company, setActiveCompanyId, createCompany, isOwner } = useCompany()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const name = company?.company_name || (companies.length ? t('nav.unnamedCompany') : t('nav.noCompany'))

  return (
    <div className="company-switch" ref={rootRef}>
      <button
        type="button"
        className="company-switch-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('nav.activeCompany')}
        onClick={() => setOpen(v => !v)}
      >
        <span className="company-switch-tile" aria-hidden="true">{initials(name)}</span>
        <span className="company-switch-text">
          <span className="company-switch-name">{name}</span>
          <span className="company-switch-role">{isOwner ? t('nav.activeCompany') : t('nav.operator')}</span>
        </span>
        <Chevron className="company-switch-caret" />
      </button>

      {open && (
        <div className="company-switch-menu" role="listbox" aria-label={t('nav.activeCompany')}>
          {companies.map(c => {
            const label = c.company_name || t('nav.unnamedCompany')
            const selected = c.id === company?.id
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={selected}
                className="company-switch-option"
                onClick={() => {
                  setOpen(false)
                  if (!selected) setActiveCompanyId(c.id)
                }}
              >
                <span className="company-switch-tile company-switch-tile-sm" aria-hidden="true">{initials(label)}</span>
                <span className="company-switch-option-name">{label}</span>
                {selected && (
                  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.2 5 8.5 9.5 3.5" />
                  </svg>
                )}
              </button>
            )
          })}
          <div className="company-switch-sep" />
          <button
            type="button"
            className="company-switch-option company-switch-new"
            onClick={async () => {
              setOpen(false)
              const created = await createCompany()
              if (created) router.push('/profile')
            }}
          >
            {t('nav.newCompany')}
          </button>
        </div>
      )}
    </div>
  )
}
