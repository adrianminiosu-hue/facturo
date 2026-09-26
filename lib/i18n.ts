export const LOCALE_STORAGE_KEY = 'facturo_locale'
export const DEFAULT_LOCALE = 'ro' as const

export const LOCALES = ['ro', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export function isLocale(value: unknown): value is Locale {
  return value === 'ro' || value === 'en'
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/**
 * A number as it goes before a plural noun. Romanian adds "de" from 20 up ("20 de zile",
 * "34 de facturi") but not for 1–19 or when the last two digits are 01–19 ("101 facturi").
 */
export function countWord(value: number, locale: Locale) {
  if (locale !== 'ro') return String(value)
  const rest = Math.abs(value) % 100
  return rest >= 20 || (rest === 0 && value !== 0) ? `${value} de` : String(value)
}

export function localeTag(locale: Locale) {
  return locale === 'en' ? 'en-GB' : 'ro-RO'
}

export function persistLocaleLocal(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    /* private mode */
  }
}

export function readStoredLocale(): Locale {
  try {
    return parseLocale(localStorage.getItem(LOCALE_STORAGE_KEY))
  } catch {
    return DEFAULT_LOCALE
  }
}

export function applyLocale(locale: Locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
}

export function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`))
}
