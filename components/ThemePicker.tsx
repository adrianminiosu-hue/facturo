'use client'
import { THEMES } from '@/lib/theme'
import { useTheme } from '@/components/ThemeProvider'
import { useLocale } from '@/components/LocaleProvider'
import type { MessageKey } from '@/lib/messages'

export default function ThemePicker() {
  const { theme, setTheme } = useTheme()
  const { t } = useLocale()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {THEMES.map(item => {
        const selected = theme === item.id
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setTheme(item.id)}
            aria-pressed={selected}
            className={`text-left rounded-2xl border p-3 transition ${
              selected
                ? 'border-[color:var(--color-accent)] shadow-[0_0_0_4px_var(--ring)]'
                : 'border-[color:var(--color-border)] hover:border-[color:color-mix(in_srgb,var(--color-accent)_40%,var(--color-border))]'
            }`}
          >
            <div
              className="rounded-xl overflow-hidden mb-3 border"
              style={{
                background: item.swatches.bg,
                borderColor: 'color-mix(in srgb, transparent 70%, #000)'
              }}
            >
              <div className="h-7 flex items-center px-2.5" style={{ background: item.swatches.nav }}>
                <span className="h-1.5 w-8 rounded-full" style={{ background: item.id === 'atelier' ? '#f8fafc' : item.swatches.ink, opacity: 0.7 }} />
                <span className="ml-auto h-3 w-8 rounded-md" style={{ background: item.swatches.accent }} />
              </div>
              <div className="p-2.5">
                <div className="rounded-lg p-2 shadow-sm" style={{ background: item.swatches.card }}>
                  <div className="h-1.5 w-14 rounded-full mb-1.5" style={{ background: item.swatches.ink, opacity: 0.8 }} />
                  <div className="h-1 w-20 rounded-full mb-2" style={{ background: item.swatches.ink, opacity: 0.28 }} />
                  <div className="h-4 w-10 rounded-md" style={{ background: item.swatches.accent }} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <p className="font-medium text-[color:var(--color-foreground)]">{t(`theme.${item.id}` as MessageKey)}</p>
              <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
                {t(`theme.${item.id}Badge` as MessageKey)}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-[color:var(--color-muted-foreground)]">
              {t(`theme.${item.id}Desc` as MessageKey)}
            </p>
          </button>
        )
      })}
    </div>
  )
}
