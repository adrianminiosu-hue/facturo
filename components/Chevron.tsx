/** Thin chevron; points down, or right when `right`. Inherits the text colour. */
export default function Chevron({ right = false, className = '' }: { right?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      className={className}
      style={right ? { transform: 'rotate(-90deg)' } : undefined}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 4.5 6 7.5 9 4.5" />
    </svg>
  )
}
