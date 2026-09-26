'use client'
import { useMemo, useState } from 'react'
import { formatRoDate } from '@/lib/dates'
import { formatAmount, formatRon } from '@/lib/money'
import type { DailyAmount } from '@/components/DailyInvoicedChart'
import { useLocale } from '@/components/LocaleProvider'

function weekdayLetter(isoDate: string, locale: string) {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay()
  return (locale === 'en' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['D', 'L', 'Ma', 'Mi', 'J', 'V', 'S'])[day]
}

function axisLabel(value: number) {
  if (value >= 1_000_000) return `${formatAmount(value / 1_000_000).replace(/\.00$/, '')} mil`
  if (value >= 1000) return `${formatAmount(value / 1000).replace(/\.00$/, '')}k`
  return formatAmount(value).replace(/\.00$/, '')
}

function seriesPoints(
  days: DailyAmount[],
  key: 'invoiced' | 'collected',
  pad: { top: number; left: number },
  slot: number,
  innerH: number,
  peak: number
) {
  return days.map((day, i) => ({
    x: pad.left + i * slot + slot / 2,
    y: pad.top + innerH - (day[key] / peak) * innerH
  }))
}

function linePath(points: { x: number; y: number }[]) {
  return points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
}

function areaPath(points: { x: number; y: number }[], baseY: number) {
  if (!points.length) return ''
  const start = points[0]
  const end = points[points.length - 1]
  return `${linePath(points)} L${end.x.toFixed(1)} ${baseY} L${start.x.toFixed(1)} ${baseY} Z`
}

export default function DailyTrendChart({ days }: { days: DailyAmount[] }) {
  const { t, locale } = useLocale()
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
  const slot = innerW / Math.max(days.length, 1)
  const baseY = pad.top + innerH
  const invoicedPts = seriesPoints(days, 'invoiced', pad, slot, innerH, peak)
  const collectedPts = seriesPoints(days, 'collected', pad, slot, innerH, peak)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="kicker mb-2">{t('dash.trend')}</p>
          <h3 className="text-lg font-semibold tracking-tight text-[color:var(--color-foreground)]">{t('dash.evolution')}</h3>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
            {t('dash.invoicedCollected', { invoiced: formatRon(invoicedTotal), collected: formatRon(collectedTotal) })}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-[color:var(--color-muted-foreground)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-[color:var(--chart-1)]" />
            {t('chart.invoiced')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-[color:var(--chart-2)]" />
            {t('chart.collections')}
          </span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[260px]"
          role="img"
          aria-label={t('chart.ariaTrend')}
        >
          <defs>
            <linearGradient id="facturoTrendInvoicedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--chart-1)' }} stopOpacity="0.28" />
              <stop offset="100%" style={{ stopColor: 'var(--chart-1)' }} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="facturoTrendCollectedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--chart-2)' }} stopOpacity="0.28" />
              <stop offset="100%" style={{ stopColor: 'var(--chart-2)' }} stopOpacity="0" />
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

          {active !== null && (
            <line
              x1={pad.left + active * slot + slot / 2}
              x2={pad.left + active * slot + slot / 2}
              y1={pad.top}
              y2={baseY}
              stroke="currentColor"
              strokeOpacity="0.18"
            />
          )}

          <path d={areaPath(invoicedPts, baseY)} fill="url(#facturoTrendInvoicedFill)" />
          <path d={areaPath(collectedPts, baseY)} fill="url(#facturoTrendCollectedFill)" />
          <path d={linePath(invoicedPts)} fill="none" style={{ stroke: 'var(--chart-1)' }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={linePath(collectedPts)} fill="none" style={{ stroke: 'var(--chart-2)' }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {days.map((day, i) => (
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
                <title>{t('chart.tooltip', { date: formatRoDate(day.date), invoiced: formatRon(day.invoiced), collected: formatRon(day.collected) })}</title>
              </rect>
              <circle
                cx={invoicedPts[i].x}
                cy={invoicedPts[i].y}
                r={active === i ? 5 : 3.2}
                style={{ fill: 'var(--chart-1)', stroke: 'var(--card)' }}
                strokeWidth="1.5"
              />
              <circle
                cx={collectedPts[i].x}
                cy={collectedPts[i].y}
                r={active === i ? 5 : 3.2}
                style={{ fill: 'var(--chart-2)', stroke: 'var(--card)' }}
                strokeWidth="1.5"
              />
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
          ))}
        </svg>

        {invoicedTotal === 0 && collectedTotal === 0 && (
          <p className="absolute inset-x-0 top-1/3 text-center text-sm text-[color:var(--color-muted-foreground)]">
            {t('dash.noVolume15')}
          </p>
        )}

        {active !== null && days[active] && (
          <div className="pointer-events-none absolute right-0 top-0 rounded-xl bg-[color:var(--foreground)] text-[color:var(--primary-foreground)] px-3 py-2 text-xs shadow-elevated">
            <p className="uppercase tracking-wider opacity-70">{formatRoDate(days[active].date)}</p>
            <p className="mt-1">{t('chart.invoiced')} {formatRon(days[active].invoiced)}</p>
            <p>{t('chart.collected')} {formatRon(days[active].collected)}</p>
          </div>
        )}
      </div>
    </div>
  )
}
