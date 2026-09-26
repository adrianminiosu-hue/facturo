'use client'
import { useMemo, useState } from 'react'
import { formatRoDate } from '@/lib/dates'
import { formatAmount, formatRon } from '@/lib/money'
import { useLocale } from '@/components/LocaleProvider'
import Money from '@/components/Money'

export type DailyAmount = {
  date: string
  invoiced: number
  collected: number
}

function weekdayLetter(isoDate: string, locale: string) {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay()
  return (locale === 'en' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['D', 'L', 'Ma', 'Mi', 'J', 'V', 'S'])[day]
}

function axisLabel(value: number) {
  if (value >= 1_000_000) return `${formatAmount(value / 1_000_000).replace(/\.00$/, '')} mil`
  if (value >= 1000) return `${formatAmount(value / 1000).replace(/\.00$/, '')}k`
  return formatAmount(value).replace(/\.00$/, '')
}

export default function DailyInvoicedChart({
  days,
  title,
  kicker,
  emptyLabel,
  chartId = 'daily',
  labels
}: {
  days: DailyAmount[]
  title?: string
  kicker?: string
  emptyLabel?: string
  chartId?: string
  /** Series names when the chart is not sales (e.g. purchases: "Achiziționat" / "Plătit"). */
  labels?: { first: string; second: string }
}) {
  const { t, locale } = useLocale()
  const invoicedFill = `facturoBarInvoiced-${chartId}`
  const collectedFill = `facturoBarCollected-${chartId}`
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...days.flatMap(d => [d.invoiced, d.collected]), 0)
  const peak = max > 0 ? max * 1.12 : 1
  const ticks = max > 0 ? [0, max / 2, max] : [0]
  const invoicedTotal = useMemo(() => days.reduce((sum, d) => sum + d.invoiced, 0), [days])
  const collectedTotal = useMemo(() => days.reduce((sum, d) => sum + d.collected, 0), [days])

  const width = 720
  const height = 260
  const pad = { top: 16, right: 12, bottom: 42, left: 52 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const slot = innerW / days.length
  const pairGap = 3
  const barW = Math.max(5, (slot - 8 - pairGap) / 2)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="kicker mb-2">{kicker || t('dash.dailyVolume')}</p>
          <h3 className="text-lg font-semibold tracking-tight text-[color:var(--color-foreground)]">{title || t('dash.last15')}</h3>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
            {labels
              ? `${labels.first} ${formatRon(invoicedTotal)} · ${labels.second} ${formatRon(collectedTotal)}`
              : t('dash.invoicedCollected', { invoiced: formatRon(invoicedTotal), collected: formatRon(collectedTotal) })}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-[color:var(--color-muted-foreground)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[color:var(--chart-1)]" />
            {labels?.first || t('chart.invoiced')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[color:var(--chart-2)]" />
            {labels?.second || t('chart.collections')}
          </span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[260px]"
          role="img"
          aria-label={t('chart.ariaDaily')}
        >
          <defs>
            <linearGradient id={invoicedFill} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" style={{ stopColor: 'var(--chart-1)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--chart-1)' }} />
            </linearGradient>
            <linearGradient id={collectedFill} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" style={{ stopColor: 'var(--chart-2)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--chart-2)' }} />
            </linearGradient>
          </defs>

          {ticks.map((tick, i) => {
            const y = pad.top + innerH - (tick / peak) * innerH
            return (
              <g key={i}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-[color:var(--border)]"
                  strokeDasharray={i === 0 ? undefined : '3 5'}
                />
                <text
                  x={pad.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-[color:var(--color-muted-foreground)]"
                  fontSize="10"
                >
                  {axisLabel(tick)}
                </text>
              </g>
            )
          })}

          {days.map((day, i) => {
            const groupX = pad.left + i * slot + (slot - pairGap - barW * 2) / 2
            const invoicedH = Math.max(day.invoiced > 0 ? 4 : 0, (day.invoiced / peak) * innerH)
            const collectedH = Math.max(day.collected > 0 ? 4 : 0, (day.collected / peak) * innerH)
            const isActive = active === i
            const opacity = isActive || active === null ? 1 : 0.38
            return (
              <g key={day.date}>
                <rect
                  x={pad.left + i * slot}
                  y={pad.top}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                >
                  <title>{labels ? `${formatRoDate(day.date)} · ${labels.first} ${formatRon(day.invoiced)} · ${labels.second} ${formatRon(day.collected)}` : t('chart.tooltip', { date: formatRoDate(day.date), invoiced: formatRon(day.invoiced), collected: formatRon(day.collected) })}</title>
                </rect>
                {day.invoiced === 0 && (
                  <rect x={groupX} y={pad.top + innerH - 3} width={barW} height={3} rx={1.5} className="fill-[color:var(--muted)]" />
                )}
                {day.collected === 0 && (
                  <rect x={groupX + barW + pairGap} y={pad.top + innerH - 3} width={barW} height={3} rx={1.5} className="fill-[color:var(--muted)]" />
                )}
                {invoicedH > 0 && (
                  <rect
                    x={groupX}
                    y={pad.top + innerH - invoicedH}
                    width={barW}
                    height={invoicedH}
                    rx={3}
                    fill={`url(#${invoicedFill})`}
                    opacity={opacity}
                  />
                )}
                {collectedH > 0 && (
                  <rect
                    x={groupX + barW + pairGap}
                    y={pad.top + innerH - collectedH}
                    width={barW}
                    height={collectedH}
                    rx={3}
                    fill={`url(#${collectedFill})`}
                    opacity={opacity}
                  />
                )}
                <text
                  x={pad.left + i * slot + slot / 2}
                  y={height - 22}
                  textAnchor="middle"
                  fontSize="10"
                  className="fill-[color:var(--color-foreground)]"
                >
                  {day.date.slice(8)}
                </text>
                <text
                  x={pad.left + i * slot + slot / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="9"
                  className="fill-[color:var(--color-muted-foreground)]"
                >
                  {weekdayLetter(day.date, locale)}
                </text>
              </g>
            )
          })}
        </svg>

        {invoicedTotal === 0 && collectedTotal === 0 && (
          <p className="absolute inset-x-0 top-1/3 text-center text-sm text-[color:var(--color-muted-foreground)]">
            {emptyLabel || t('dash.noVolume15')}
          </p>
        )}

        {active !== null && days[active] && (
          <div className="pointer-events-none absolute right-0 top-0 rounded-xl bg-[color:var(--foreground)] text-[color:var(--primary-foreground)] px-3 py-2 text-xs shadow-elevated">
            <p className="uppercase tracking-wider opacity-70">{formatRoDate(days[active].date)}</p>
            <p className="mt-1">{labels?.first || t('chart.invoiced')} <Money value={days[active].invoiced} /></p>
            <p>{labels?.second || t('chart.collected')} <Money value={days[active].collected} /></p>
          </div>
        )}
      </div>
    </div>
  )
}
