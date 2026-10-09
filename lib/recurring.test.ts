import { describe, expect, it } from 'vitest'
import {
  advanceAfter,
  billingPeriod,
  defaultSchedule,
  fillPlaceholders,
  initialState,
  nextOccurrenceAfter,
  occurrenceDate,
  periodLabel,
  plannedTotal,
  templateLinesFor,
  upcomingDates,
  validateSchedule,
  withinEnd,
  type RecurringSchedule
} from './recurring'

const monthly = (start: string, extra: Partial<RecurringSchedule> = {}): RecurringSchedule => ({
  ...defaultSchedule(start),
  ...extra
})

describe('recurring schedule', () => {
  it('keeps the day of the month and clamps 29–31 to shorter months', () => {
    const s = monthly('2026-01-31')
    expect(s.anchor_day).toBe(31)
    expect([0, 1, 2, 3].map(i => occurrenceDate(s, i))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
    const leap = monthly('2028-01-30')
    expect(occurrenceDate(leap, 1)).toBe('2028-02-29')
    expect(occurrenceDate(leap, 2)).toBe('2028-03-30')
  })

  it('treats the last day of a month as "last day" (30 Sep → 31 Oct)', () => {
    const s = monthly('2026-09-30')
    expect(s.anchor_day).toBe(31)
    expect(occurrenceDate(s, 1)).toBe('2026-10-31')
    expect(occurrenceDate(s, 2)).toBe('2026-11-30')
  })

  it('steps quarterly and yearly, across years', () => {
    expect(occurrenceDate(monthly('2026-11-15', { frequency: 'quarterly' }), 1)).toBe('2027-02-15')
    expect(occurrenceDate(monthly('2026-11-15', { frequency: 'yearly' }), 2)).toBe('2028-11-15')
  })

  it('finds the next date strictly after a day, never the first invoice', () => {
    const s = monthly('2026-08-01')
    expect(nextOccurrenceAfter(s, '2026-09-29')).toEqual({ index: 2, date: '2026-10-01' })
    expect(nextOccurrenceAfter(s, '2026-07-01')).toEqual({ index: 1, date: '2026-09-01' })
  })

  it('initial state: series made today from today\'s invoice starts next month', () => {
    const s = monthly('2026-09-29')
    expect(initialState(s, '2026-09-29')).toMatchObject({ next_index: 1, next_run_date: '2026-10-29', generated_count: 1, status: 'active' })
  })

  it('initial state: from an older invoice, missed dates are not back-filled', () => {
    const s = monthly('2026-08-01')
    expect(initialState(s, '2026-09-29')).toMatchObject({ next_index: 2, next_run_date: '2026-10-01' })
  })

  it('"after N invoices" counts the first invoice', () => {
    const s = monthly('2026-01-10', { end_mode: 'count', end_count: 3 })
    expect(withinEnd(s, 1, '2026-02-10')).toBe(true)
    expect(withinEnd(s, 3, '2026-04-10')).toBe(false)
    expect(upcomingDates(s, 1, 1, 5)).toEqual(['2026-02-10', '2026-03-10'])
    expect(plannedTotal(s)).toBe(3)
    // second invoice produced → third is the last
    const after2 = advanceAfter({ ...s, generated_count: 1 }, 1)
    expect(after2).toMatchObject({ generated_count: 2, next_index: 2, next_run_date: '2026-03-10', status: 'active' })
    const after3 = advanceAfter({ ...s, generated_count: 2 }, 2)
    expect(after3).toMatchObject({ generated_count: 3, next_run_date: null, status: 'ended' })
  })

  it('"until" is inclusive', () => {
    const s = monthly('2026-01-10', { end_mode: 'until', end_date: '2026-04-10' })
    expect(upcomingDates(s, 1, 1, 10)).toEqual(['2026-02-10', '2026-03-10', '2026-04-10'])
    expect(plannedTotal(s)).toBe(4)
  })

  it('validates the end', () => {
    expect(validateSchedule(monthly('2026-01-10'))).toBeNull()
    expect(validateSchedule(monthly('2026-01-10', { end_mode: 'count', end_count: 1 }))).toBe('recur.err.count')
    expect(validateSchedule(monthly('2026-01-10', { end_mode: 'until', end_date: '' }))).toBe('recur.err.until')
    expect(validateSchedule(monthly('2026-01-10', { end_mode: 'until', end_date: '2026-02-01' }))).toBe('recur.err.untilEarly')
  })
})

describe('recurring billing period (in advance)', () => {
  it('bills the month of issue, or the quarter / year starting then', () => {
    expect(billingPeriod('2026-11-01', 'monthly')).toEqual({ start: '2026-11-01', end: '2026-11-30' })
    expect(billingPeriod('2026-11-15', 'quarterly')).toEqual({ start: '2026-11-01', end: '2027-01-31' })
    expect(billingPeriod('2026-03-05', 'yearly')).toEqual({ start: '2026-03-01', end: '2027-02-28' })
  })

  it('labels the period', () => {
    expect(periodLabel('2026-11-01', 'monthly')).toBe('noiembrie 2026')
    expect(periodLabel('2026-11-01', 'quarterly')).toBe('noiembrie 2026 – ianuarie 2027')
    expect(periodLabel('2026-04-01', 'quarterly')).toBe('aprilie – iunie 2026')
    expect(periodLabel('2027-01-01', 'yearly')).toBe('2027')
  })

  it('fills {luna}, {an}, {perioada} and leaves other braces alone', () => {
    expect(fillPlaceholders('Mentenanță {luna} {an}', '2026-11-01', 'monthly')).toBe('Mentenanță noiembrie 2026')
    expect(fillPlaceholders('Abonament {perioada} {x}', '2026-11-01', 'quarterly')).toBe('Abonament noiembrie 2026 – ianuarie 2027 {x}')
    expect(fillPlaceholders(null, '2026-11-01', 'monthly')).toBe('')
  })

  it('maps template lines with placeholders and defaults', () => {
    const lines = templateLinesFor({ lines: [{ description: 'Chirie {luna}', quantity: 1, unit_price: 1000, tva_rate: 21 }] }, '2026-12-01', 'monthly')
    expect(lines[0]).toMatchObject({ description: 'Chirie decembrie', unit_code: 'H87', vat_category: 'S', discount_percent: 0 })
  })
})
