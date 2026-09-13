import { useId } from 'react'

export default function FacturoMark({ className = 'h-8 w-8' }: { className?: string }) {
  const uid = useId().replace(/:/g, '')
  const left = `fm-left-${uid}`
  const right = `fm-right-${uid}`
  const fold = `fm-fold-${uid}`

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={left} x1="6" y1="12" x2="24" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E4E8C" />
          <stop offset="100%" stopColor="#001F54" />
        </linearGradient>
        <linearGradient id={right} x1="24" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4C8DFF" />
          <stop offset="100%" stopColor="#123A7A" />
        </linearGradient>
        <linearGradient id={fold} x1="26" y1="6" x2="40" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#B7D2FF" />
          <stop offset="100%" stopColor="#2F6BFF" />
        </linearGradient>
      </defs>
      <path d="M8 16.5 24 8v31.2L8 31.7Z" fill={`url(#${left})`} />
      <path d="M24 8 40 16.5V31.7L24 39.2Z" fill={`url(#${right})`} />
      <path d="M24 8 38.2 15.4 24 19.6Z" fill={`url(#${fold})`} />
      <path d="M24 19.6 38.2 15.4 24 22.8Z" fill="#0A2A62" opacity="0.28" />
      <path d="M13.2 21.2h6.6" stroke="#E8F0FF" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M13.2 24.6h5.2" stroke="#E8F0FF" strokeWidth="1.7" strokeLinecap="round" opacity="0.85" />
      <path d="M13.2 28h4" stroke="#E8F0FF" strokeWidth="1.7" strokeLinecap="round" opacity="0.65" />
    </svg>
  )
}
