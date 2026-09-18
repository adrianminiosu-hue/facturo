'use client'
import { useMemo, useState } from 'react'
import { formatRoDate } from '@/lib/dates'
import { formatAmount, formatRon } from '@/lib/money'

export type DailyAmount = {
  date: string
  invoiced: number
  collected: number
}

function weekdayLetter(isoDate: string) {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay()
  return ['D', 'L', 'Ma', 'Mi', 'J', 'V', 'S'][day]
}

function axisLabel(value: number) {
  if (value >= 1_000_000) return `${formatAmount(value / 1_000_000).replace(/\.00$/, '')} mil`
  if (value >= 1000) return `${formatAmount(value / 1000).replace(/\.00$/, '')}k`
  return formatAmount(value).replace(/\.00$/, '')
}

export default function DailyInvoicedChart({ days }: { days: DailyAmount[] }) {
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
          <p className="kicker mb-2">Volum zilnic</p>
          <h3 className="brand text-xl text-[color:var(--color-foreground)]">Ultimele 15 zile</h3>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
            Facturat {formatRon(invoicedTotal)} · Încasat {formatRon(collectedTotal)}
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#0e7490]" />
            Facturat
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#c2410c]" />
            Încasări
          </span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[260px]"
          role="img"
          aria-label="Sumă facturată și încasată pe zi, ultimele 15 zile"
        >
          <defs>
            <linearGradient id="facturoBarInvoiced" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#155e75" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
            <linearGradient id="facturoBarCollected" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#9a3412" />
              <stop offset="100%" stopColor="#fb923c" />
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
                  <title>{`${formatRoDate(day.date)} · facturat ${formatRon(day.invoiced)} · încasat ${formatRon(day.collected)}`}</title>
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
                    fill="url(#facturoBarInvoiced)"
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
                    fill="url(#facturoBarCollected)"
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
                  {weekdayLetter(day.date)}
                </text>
              </g>
            )
          })}
        </svg>

        {invoicedTotal === 0 && collectedTotal === 0 && (
          <p className="absolute inset-x-0 top-1/3 text-center text-sm text-[color:var(--color-muted-foreground)]">
            Nicio factură emisă și nicio încasare în ultimele 15 zile
          </p>
        )}

        {active !== null && days[active] && (
          <div className="pointer-events-none absolute right-0 top-0 rounded-xl bg-[color:var(--foreground)] text-[color:var(--primary-foreground)] px-3 py-2 text-xs shadow-elevated">
            <p className="uppercase tracking-wider opacity-70">{formatRoDate(days[active].date)}</p>
            <p className="mt-1">Facturat {formatRon(days[active].invoiced)}</p>
            <p>Încasat {formatRon(days[active].collected)}</p>
          </div>
        )}
      </div>
    </div>
  )
}
