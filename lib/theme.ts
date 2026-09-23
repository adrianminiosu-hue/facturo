export const THEME_STORAGE_KEY = 'facturo_theme'
export const DEFAULT_THEME = 'atelier' as const

export const THEMES = [
  {
    id: 'atelier',
    name: 'Atelier',
    badge: 'Implicit',
    description: 'Spațiu deschis, rail închis și accent albastru — interfață de atelier operațional.',
    swatches: {
      bg: '#f4f6f9',
      card: '#ffffff',
      ink: '#111827',
      accent: '#2563eb',
      nav: '#0b1220'
    }
  },
  {
    id: 'nocturne',
    name: 'Nocturn',
    badge: 'Seară',
    description: 'Cerneală adâncă și fildeș cald. Contrast blând, pentru lucru după program.',
    swatches: {
      bg: '#12151c',
      card: '#1b2029',
      ink: '#ece7dc',
      accent: '#c4a574',
      nav: '#0d1016'
    }
  },
  {
    id: 'pergament',
    name: 'Pergament',
    badge: 'Registru',
    description: 'Hârtie de birou, nuc și cărămiziu. Un registru de atelier, nu un dashboard.',
    swatches: {
      bg: '#f3eadc',
      card: '#fff8ee',
      ink: '#2b2118',
      accent: '#8a3b24',
      nav: '#3a2a20'
    }
  },
  {
    id: 'orizont',
    name: 'Orizont',
    badge: 'Aerisit',
    description: 'Piatră deschisă și teal. Mai contemporan, fără a pierde prestanța.',
    swatches: {
      bg: '#e8eef0',
      card: '#f7fbfb',
      ink: '#163038',
      accent: '#0f6f73',
      nav: '#0c3d42'
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
