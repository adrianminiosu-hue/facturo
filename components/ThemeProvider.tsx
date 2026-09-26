'use client'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { getCurrentUser, supabase } from '@/lib/supabase'
import {
  DEFAULT_THEME,
  applyTheme,
  parseTheme,
  persistThemeLocal,
  readStoredTheme,
  type ThemeId
} from '@/lib/theme'

type ThemeContextValue = {
  theme: ThemeId
  setTheme: (theme: ThemeId) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME)

  useLayoutEffect(() => {
    const stored = readStoredTheme()
    setThemeState(stored)
    applyTheme(stored)
  }, [])

  useEffect(() => {
    const syncFromUser = (value: unknown) => {
      const next = parseTheme(value)
      setThemeState(next)
      persistThemeLocal(next)
      applyTheme(next)
    }

    getCurrentUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.theme) syncFromUser(user.user_metadata.theme)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.user_metadata?.theme) {
        syncFromUser(session.user.user_metadata.theme)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const setTheme = useCallback(async (next: ThemeId) => {
    setThemeState(next)
    persistThemeLocal(next)
    applyTheme(next)
    const { data: { user } } = await getCurrentUser()
    if (user) await supabase.auth.updateUser({ data: { theme: next } })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
