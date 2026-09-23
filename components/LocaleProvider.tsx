'use client'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  applyLocale,
  interpolate,
  parseLocale,
  persistLocaleLocal,
  readStoredLocale,
  type Locale
} from '@/lib/i18n'
import { messages, type MessageKey } from '@/lib/messages'

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => Promise<void>
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  useLayoutEffect(() => {
    const stored = readStoredLocale()
    setLocaleState(stored)
    applyLocale(stored)
  }, [])

  useEffect(() => {
    const hasLocalPreference = () => {
      try {
        return !!localStorage.getItem(LOCALE_STORAGE_KEY)
      } catch {
        return false
      }
    }

    const syncFromUser = (value: unknown) => {
      if (hasLocalPreference()) return
      const next = parseLocale(value)
      setLocaleState(next)
      persistLocaleLocal(next)
      applyLocale(next)
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.locale) syncFromUser(user.user_metadata.locale)
    })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return
      if (session?.user?.user_metadata?.locale) {
        syncFromUser(session.user.user_metadata.locale)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next)
    persistLocaleLocal(next)
    applyLocale(next)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.auth.updateUser({ data: { locale: next } })
  }, [])

  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => {
    const table = messages[locale] || messages.ro
    return interpolate(table[key] || messages.ro[key] || key, vars)
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}
