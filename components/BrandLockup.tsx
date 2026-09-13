import Link from 'next/link'
import FacturoMark from '@/components/FacturoMark'

export default function BrandLockup({
  href,
  size = 'md'
}: {
  href?: string
  size?: 'sm' | 'md'
}) {
  const mark = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
  const type = size === 'sm' ? 'text-[1.25rem]' : 'text-[1.45rem]'
  const inner = (
    <span className="inline-flex items-center gap-2.5 shrink-0">
      <FacturoMark className={mark} />
      <span className={`brand leading-none ${type}`}>Facturo</span>
    </span>
  )
  if (!href) return inner
  return (
    <Link href={href} className="shrink-0 hover:opacity-90 transition">
      {inner}
    </Link>
  )
}
