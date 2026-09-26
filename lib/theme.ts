export const THEME_STORAGE_KEY = 'facturo_theme'
export const DEFAULT_THEME = 'atelier' as const

export const THEMES = [
  {
    id: 'atelier',
    name: 'Luminos',
    badge: 'Implicit',
    description: 'Hârtie caldă și cerneală. Tema de zi.',
    swatches: {
      bg: '#f6f5f1',
      card: '#ffffff',
      ink: '#0b0d12',
      accent: '#2f45c6',
      nav: '#0b0d12'
    }
  },
  {
    id: 'nocturne',
    name: 'Întunecat',
    badge: 'Seară',
    description: 'Cerneală adâncă și text cald. Pentru lucru seara.',
    swatches: {
      bg: '#0b0d12',
      card: '#14161c',
      ink: '#f1efe9',
      accent: '#8e9cff',
      nav: '#08090c'
    }
  }
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some(theme => theme.id === value)
}

export function parseTheme(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME
}

export function applyTheme(theme: ThemeId) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

export function persistThemeLocal(theme: ThemeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* private mode */
  }
}

export function readStoredTheme(): ThemeId {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}
