/**
 * Veyro logo, direction "Interval": a full left blade and a short, detached right blade.
 * Drawn on a 100-unit cap height; colour = currentColor, so it follows light and dark themes.
 */
type Props = { className?: string; style?: React.CSSProperties; title?: string }

const V_PATHS = (
  <>
    <polygon points="0,0 15,0 44.5,100 29.5,100" />
    <polygon points="59,0 74,0 56,60 41,60" />
  </>
)

export function VeyroMark({ className, style, title }: Props) {
  return (
    <svg viewBox="0 0 74 100" className={className} style={style} fill="currentColor" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      {V_PATHS}
    </svg>
  )
}

export function VeyroWordmark({ className, style, title = 'Veyro' }: Props) {
  return (
    <svg viewBox="0 0 388 100" className={className} style={style} fill="currentColor" role="img" aria-label={title} focusable="false">
      {V_PATHS}
      <path d="M85 0H139V13H98V43.5H134V56.5H98V87H139V100H85Z" />
      <polygon points="148,0 163,0 182,36 201,0 216,0 188.5,53 188.5,100 175.5,100 175.5,53" />
      <path fillRule="evenodd" d="M227 0H264A28.5 28.5 0 0 1 264 57H240V100H227Z M240 13H264A15.5 15.5 0 0 1 264 44H240Z" />
      <polygon points="256,50 271,50 293,100 278,100" />
      <path fillRule="evenodd" d="M345 0A43 50 0 1 1 344.99 0Z M345 13A30 37 0 1 0 345.01 13Z" />
    </svg>
  )
}
