import { addDaysIso, startOfIsoWeek } from '@/lib/dates'
import { roundMoney } from '@/lib/invoiceMath'

export const FORECAST_WEEKS = 13

/** How sure we are that money comes in on the expected date. */
export type InflowConfidence = 'promised' | 'expected' | 'risk'

export type ForecastInflow = {
  id: string
  ref: string
  partyName: string
  amount: number
  /** Due date shifted by the client's average delay (or the promised date). */
  expectedOn: string
  dueDate: string
  confidence: InflowConfidence
}

export type ForecastOutflow = {
  id: string
  ref: string
  partyName: string
  amount: number
  dueDate: string
}

export type ForecastWeek = {
  index: number
  start: string
  end: string
  inflow: number
  /** Expected from clients flagged as risk: shown, but not counted in the balance. */
  riskInflow: number
  outflow: number
  net: number
  /** Opening balance + cumulated net (without risk inflows). */
  closing: number
  inflows: ForecastInflow[]
  outflows: ForecastOutflow[]
}

export type Forecast = {
  weeks: ForecastWeek[]
  openingBalance: number
  totalIn: number
  totalRiskIn: number
  totalOut: number
  /** Supplier invoices already past due, counted in the first week. */
  overdueOut: number
  /** Money expected after the horizon. */
  laterIn: number
  laterOut: number
  lowest: { week: ForecastWeek; closing: number } | null
  firstNegative: ForecastWeek | null
}

function weekIndex(date: string, firstStart: string) {
  const start = startOfIsoWeek(date)
  const [y1, m1, d1] = firstStart.split('-').map(Number)
  const [y2, m2, d2] = start.split('-').map(Number)
  const diff = (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000
  return Math.round(diff / 7)
}

/**
 * 13-week cash forecast: what clients should pay (due date + their usual delay) minus what we owe
 * suppliers, week by week, on top of today's bank balance. Anything already late lands in week 1.
 */
export function buildForecast(input: {
  today: string
  openingBalance: number
  inflows: ForecastInflow[]
  outflows: ForecastOutflow[]
  weeks?: number
}): Forecast {
  const count = input.weeks ?? FORECAST_WEEKS
  const firstStart = startOfIsoWeek(input.today)
  const weeks: ForecastWeek[] = Array.from({ length: count }, (_, index) => {
    const start = addDaysIso(firstStart, index * 7)
    return {
      index,
      start,
      end: addDaysIso(start, 6),
      inflow: 0,
      riskInflow: 0,
      outflow: 0,
      net: 0,
      closing: 0,
      inflows: [],
      outflows: []
    }
  })

  let laterIn = 0
  let laterOut = 0
  let overdueOut = 0

  for (const item of input.inflows) {
    if (!(item.amount > 0)) continue
    const date = item.expectedOn < input.today ? input.today : item.expectedOn
    const i = Math.max(0, weekIndex(date, firstStart))
    if (i >= count) { laterIn += item.amount; continue }
    const week = weeks[i]
    if (item.confidence === 'risk') week.riskInflow += item.amount
    else week.inflow += item.amount
    week.inflows.push(item)
  }

  for (const item of input.outflows) {
    if (!(item.amount > 0)) continue
    if (item.dueDate < input.today) overdueOut += item.amount
    const date = item.dueDate < input.today ? input.today : item.dueDate
    const i = Math.max(0, weekIndex(date, firstStart))
    if (i >= count) { laterOut += item.amount; continue }
    weeks[i].outflow += item.amount
    weeks[i].outflows.push(item)
  }

  let running = input.openingBalance
  for (const week of weeks) {
    week.inflow = roundMoney(week.inflow)
    week.riskInflow = roundMoney(week.riskInflow)
    week.outflow = roundMoney(week.outflow)
    week.net = roundMoney(week.inflow - week.outflow)
    running = roundMoney(running + week.net)
    week.closing = running
    week.inflows.sort((a, b) => a.expectedOn.localeCompare(b.expectedOn))
    week.outflows.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }

  const lowestWeek = weeks.reduce<ForecastWeek | null>((min, w) => (!min || w.closing < min.closing ? w : min), null)
  return {
    weeks,
    openingBalance: roundMoney(input.openingBalance),
    totalIn: roundMoney(weeks.reduce((s, w) => s + w.inflow, 0)),
    totalRiskIn: roundMoney(weeks.reduce((s, w) => s + w.riskInflow, 0)),
    totalOut: roundMoney(weeks.reduce((s, w) => s + w.outflow, 0)),
    overdueOut: roundMoney(overdueOut),
    laterIn: roundMoney(laterIn),
    laterOut: roundMoney(laterOut),
    lowest: lowestWeek ? { week: lowestWeek, closing: lowestWeek.closing } : null,
    firstNegative: weeks.find(w => w.closing < 0) || null
  }
}
