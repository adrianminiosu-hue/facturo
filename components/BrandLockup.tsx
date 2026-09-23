import Link from 'next/link'
import FacturoMark from '@/components/FacturoMark'

export default function BrandLockup({
  href,
  size = 'md'
}: {
  href?: string
  size?: 'sm' | 'md'
}) {
  const inner = (
    <span className={`brand-lockup inline-flex items-center gap-2.5 shrink-0${size === 'sm' ? ' brand-lockup-sm' : ''}`}>
      <span className="brand-mark">
        <FacturoMark className="h-full w-full" />
      </span>
      <span className="flex flex-col items-start">
        <span className="brand-wordmark leading-none">facturo</span>
        <span className="brand-byline">BY FINSQUARE</span>
      </span>
    </span>
  )
  if (!href) return inner
  return (
    <Link href={href} className="shrink-0 hover:opacity-90 transition">
      {inner}
    </Link>
  )
}
