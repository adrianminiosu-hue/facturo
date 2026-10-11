/**
 * Veyro logo, direction A ("refined ribbon"): a folded ribbon V whose blades taper towards the point
 * (26 -> 20 units, like a nib cut), in two night-cobalt tones; it is also the first letter of "Veyro".
 * Letters "eyro" follow currentColor (ink or paper), 13-unit strokes, round letters overshoot the
 * x-height and baseline by 1 unit, and the arm of the "r" is a circular arc like the "e" and "o".
 * Drawn on a 100-unit cap height; the wordmark is 396 x 130 (the "y" descends to 128).
 * Ribbon colours come from --veyro-ribbon-light / --veyro-ribbon-deep (see globals.css), so the
 * mark switches to its lighter pair on dark surfaces (sidebar, nocturne theme).
 */
type Props = { className?: string; style?: React.CSSProperties; title?: string; mono?: boolean }

/** On light surfaces. */
export const VEYRO_RIBBON = { light: '#4357D9', deep: '#1A2580' }
/** On dark surfaces. */
export const VEYRO_RIBBON_ON_DARK = { light: '#8C9BFF', deep: '#4357D9' }

const LEFT_BLADE = '0,0 26,0 60,100 40,100'
const RIGHT_BLADE = '74,0 100,0 60,100 40,100'

/** The ribbon V. `mono`: one colour (currentColor) with a channel between the blades, for print and stamps. */
function RibbonV({ mono = false }: { mono?: boolean }) {
  if (mono) {
    return (
      <g fill="currentColor">
        <polygon points={LEFT_BLADE} />
        <polygon points="74,0 100,0 62.2,94.5 52.4,64.6" />
      </g>
    )
  }
  return (
    <>
      <polygon points={LEFT_BLADE} fill={`var(--veyro-ribbon-light, ${VEYRO_RIBBON.light})`} />
      <polygon points={RIGHT_BLADE} fill={`var(--veyro-ribbon-deep, ${VEYRO_RIBBON.deep})`} />
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
    <svg viewBox="0 0 396 130" className={className} style={style} role="img" aria-label={title} focusable="false">
      <RibbonV mono={mono} />
      <g fill="currentColor">
        <polygon points="198,30 213,30 235,100 220,100" />
        <polygon points="243,30 258,30 224,128 209,128" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth={13} strokeLinecap="butt" strokeLinejoin="miter">
        <path d="M120.5 65H179.5A29.5 29.5 0 1 0 172.6 84" />
        <path d="M276.5 100V30M276.5 66.5A30 30 0 0 1 306.5 36.5H311" />
        <circle cx="360" cy="65" r="29.5" />
      </g>
    </svg>
  )
}
