import { describe, expect, it } from 'vitest'
import { buildForecast, type ForecastInflow, type ForecastOutflow } from './forecast'

const inflow = (id: string, amount: number, expectedOn: string, confidence: ForecastInflow['confidence'] = 'expected'): ForecastInflow => ({
  id, ref: id, partyName: 'Client', amount, expectedOn, dueDate: expectedOn, confidence
})
const outflow = (id: string, amount: number, dueDate: string): ForecastOutflow => ({ id, ref: id, partyName: 'Furnizor', amount, dueDate })

describe('buildForecast', () => {
  // Friday 25.09.2026 → week 1 starts Monday 21.09
  const today = '2026-09-25'

  it('buckets by ISO week and carries the balance forward', () => {
    const f = buildForecast({
      today,
      openingBalance: 10000,
      inflows: [inflow('a', 5000, '2026-09-26'), inflow('b', 3000, '2026-10-05')],
      outflows: [outflow('x', 2000, '2026-10-01')]
    })
    expect(f.weeks).toHaveLength(13)
    expect(f.weeks[0].start).toBe('2026-09-21')
    expect(f.weeks[0].end).toBe('2026-09-27')
    expect(f.weeks[0].closing).toBe(15000)
    expect(f.weeks[1].outflow).toBe(2000)
    expect(f.weeks[1].closing).toBe(13000)
    expect(f.weeks[2].inflow).toBe(3000)
    expect(f.weeks[12].closing).toBe(16000)
    expect(f.totalIn).toBe(8000)
    expect(f.totalOut).toBe(2000)
  })

  it('puts late items in week 1 and flags overdue supplier invoices', () => {
    const f = buildForecast({
      today,
      openingBalance: 0,
      inflows: [inflow('late', 1000, '2026-09-01')],
      outflows: [outflow('owed', 4000, '2026-09-10')]
    })
    expect(f.weeks[0].inflow).toBe(1000)
    expect(f.weeks[0].outflow).toBe(4000)
    expect(f.overdueOut).toBe(4000)
    expect(f.firstNegative?.index).toBe(0)
    expect(f.lowest?.closing).toBe(-3000)
  })

  it('keeps risky inflows out of the balance and counts items past the horizon separately', () => {
    const f = buildForecast({
      today,
      openingBalance: 500,
      inflows: [inflow('r', 9000, '2026-10-01', 'risk'), inflow('far', 7000, '2027-03-01')],
      outflows: [outflow('far-out', 1000, '2027-02-01')]
    })
    expect(f.weeks[1].riskInflow).toBe(9000)
    expect(f.weeks[1].closing).toBe(500)
    expect(f.totalRiskIn).toBe(9000)
    expect(f.laterIn).toBe(7000)
    expect(f.laterOut).toBe(1000)
    expect(f.firstNegative).toBeNull()
  })
})
