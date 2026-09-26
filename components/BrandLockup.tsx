import Link from 'next/link'
import FacturoMark from '@/components/FacturoMark'
import { VeyroWordmark } from '@/components/VeyroLogo'
import { BRAND_ID } from '@/lib/brand'

export default function BrandLockup({
  href,
  size = 'md'
}: {
  href?: string
  size?: 'sm' | 'md'
}) {
  const inner = BRAND_ID === 'veyro' ? (
    <span className={`brand-lockup brand-lockup-veyro inline-flex items-center shrink-0${size === 'sm' ? ' brand-lockup-sm' : ''}`}>
      <VeyroWordmark className="brand-veyro-wordmark" />
    </span>
  ) : (
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
