import { formatAmount } from '@/lib/money'

/**
 * An amount the way finance apps show it: whole part in full, decimals and currency quieter.
 * `size="lg"` for headline figures (smaller decimals and currency); default keeps one size, muted decimals.
 */
export default function Money({
  value,
  currency = 'RON',
  size = 'md',
  className = ''
}: {
  value: number | string | null | undefined
  currency?: string | null
  size?: 'md' | 'lg'
  className?: string
}) {
  const [whole, decimals] = formatAmount(value).split(',')
  return (
    <span className={`money${size === 'lg' ? ' money-lg' : ''}${className ? ` ${className}` : ''}`}>
      {whole}
      {decimals !== undefined && <span className="money-dec">,{decimals}</span>}
      {currency && <span className="money-cur">{' '}{currency}</span>}
    </span>
  )
}
