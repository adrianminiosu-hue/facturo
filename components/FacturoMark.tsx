export default function FacturoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg
      viewBox="4 6 56 52"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <polygon points="32,6 39,19 25,19" fill="var(--accent)" />
      <polygon points="22.31,24 41.69,24 46.72,33.33 17.28,33.33" fill="currentColor" />
      <polygon points="15.67,36.33 48.33,36.33 53.36,45.67 10.64,45.67" fill="currentColor" />
      <polygon points="9.03,48.67 54.97,48.67 60,58 4,58" fill="currentColor" />
    </svg>
  )
}
