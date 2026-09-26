/**
 * Veyro logo, direction E ("ribbon V in the word"): a flat folded ribbon V in two cobalt tones,
 * which is also the first letter of "Veyro". Letters "eyro" follow currentColor (ink or paper).
 * Drawn on a 100-unit cap height; the wordmark is 366 × 130 (the "y" descends to 128).
 */
type Props = { className?: string; style?: React.CSSProperties; title?: string; mono?: boolean }

export const VEYRO_RIBBON = { light: '#6C7BFF', deep: '#2F45C6' }

/** The ribbon V. `mono`: one colour (currentColor) with a channel between the blades, for print and stamps. */
function RibbonV({ mono = false }: { mono?: boolean }) {
  if (mono) {
    return (
      <g fill="currentColor">
        <polygon points="0,0 30,0 64,100 34,100" />
        <polygon points="70,0 100,0 67.1,91.4 52.5,48.6" />
      </g>
    )
  }
  return (
    <>
      <polygon points="0,0 30,0 64,100 34,100" fill={VEYRO_RIBBON.light} />
      <polygon points="70,0 100,0 64,100 34,100" fill={VEYRO_RIBBON.deep} />
    </>
  )
}

export function VeyroMark({ className, style, title, mono }: Props) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <RibbonV mono={mono} />
    </svg>
  )
}

export function VeyroWordmark({ className, style, title = 'Veyro', mono }: Props) {
  return (
    <svg viewBox="0 0 366 130" className={className} style={style} role="img" aria-label={title} focusable="false">
      <RibbonV mono={mono} />
      <g fill="currentColor">
        <polygon points="178,30 194,30 218.3,100 202.3,100" />
        <polygon points="226,30 242,30 208,128 192,128" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth={15} strokeLinecap="butt" strokeLinejoin="miter">
        <path d="M109.5 65H164.5A27.5 27.5 0 1 0 158.1 82.7" />
        <path d="M253.5 100V30M253.5 62C253.5 42 264 36.5 288 36.5" />
        <circle cx="331" cy="65" r="27.5" />
      </g>
    </svg>
  )
}
