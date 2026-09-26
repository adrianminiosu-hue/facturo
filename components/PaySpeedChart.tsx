'use client'
import { formatDecimal } from '@/lib/money'
import { useState } from 'react'
import { formatRoDate } from '@/lib/dates'
import { useLocale } from '@/components/LocaleProvider'

export type PaySpeedDay = {
  date: string
  days: number | null
  count: number
}

function weekdayLetter(isoDate: string, locale: string) {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay()
  return (locale === 'en' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['D', 'L', 'Ma', 'Mi', 'J', 'V', 'S'])[day]
}

function axisLabel(value: number) {
  return formatDecimal(value, 1)
}

function linePath(points: { x: number; y: number }[]) {
  return points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
}

export default function PaySpeedChart({
  days,
  average
}: {
  days: PaySpeedDay[]
  average: number | null
}) {
  const { t, locale } = useLocale()
  const [active, setActive] = useState<number | null>(null)
  const values = days.map(day => day.days).filter((value): value is number => value !== null)
  const max = Math.max(...values, average ?? 0, 0)
  const peak = max > 0 ? max * 1.18 : 1
  const ticks = max > 0 ? [0, max / 2, max] : [0]

  const width = 720
  const height = 260
  const pad = { top: 16, right: 12, bottom: 42, left: 52 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const slot = innerW / Math.max(days.length, 1)
  const baseY = pad.top + innerH
  const yFor = (value: number) => pad.top + innerH - (value / peak) * innerH
  const points = days
    .map((day, i) => (day.days === null ? null : {
      i,
      x: pad.left + i * slot + slot / 2,
      y: yFor(day.days)
    }))
    .filter((point): point is { i: number; x: number; y: number } => point !== null)
  const avgY = average !== null ? yFor(average) : null

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="kicker mb-2">{t('dash.collect.trend')}</p>
          <h3 className="text-lg font-semibold tracking-tight text-[color:var(--color-foreground)]">{t('dash.collect.trendTitle')}</h3>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">{t('dash.collect.trendLead')}</p>
        </div>
        <div className="flex items-center gap-4 text-xs uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-[color:var(--chart-1)]" />
            {t('chart.daysToPay')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-[color:var(--chart-2)]" />
            {t('chart.avgDays')}
          </span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[260px]"
          role="img"
          aria-label={t('dash.collect.trendTitle')}
        >
          {ticks.map((tick, i) => {
            const y = yFor(tick)
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

          {avgY !== null && (
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={avgY}
              y2={avgY}
              style={{ stroke: 'var(--chart-2)' }}
              strokeWidth="2"
              strokeDasharray="6 5"
              strokeLinecap="round"
            />
          )}

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

          {points.length > 1 && (
            <path d={linePath(points)} fill="none" style={{ stroke: 'var(--chart-1)' }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          )}

          {days.map((day, i) => {
            const point = points.find(entry => entry.i === i)
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
                  <title>
                    {formatRoDate(day.date)}
                    {day.days === null ? '' : ` · ${axisLabel(day.days)}`}
                  </title>
                </rect>
                {point && (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={active === i ? 5 : 3.2}
                    style={{ fill: 'var(--chart-1)' }}
                    stroke="#fff"
                    strokeWidth="1.5"
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

        {values.length === 0 && (
          <p className="absolute inset-x-0 top-1/3 text-center text-sm text-[color:var(--color-muted-foreground)]">
            {t('dash.collect.empty')}
          </p>
        )}

        {active !== null && days[active] && (
          <div className="pointer-events-none absolute right-0 top-0 rounded-xl bg-[color:var(--foreground)] text-[color:var(--primary-foreground)] px-3 py-2 text-xs shadow-elevated">
            <p className="uppercase tracking-wider opacity-70">{formatRoDate(days[active].date)}</p>
            <p className="mt-1">
              {days[active].days === null
                ? t('dash.collect.empty')
                : `${t('dash.collect.days', { n: axisLabel(days[active].days) })} · ${t('dash.collect.dayPaid', { count: days[active].count })}`}
            </p>
            {average !== null && <p>{t('chart.avgDays')} {t('dash.collect.days', { n: axisLabel(average) })}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
