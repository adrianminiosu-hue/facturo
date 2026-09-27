import { describe, expect, it } from 'vitest'
import { addWorkingDays, efacturaDeadline, isWorkingDay, orthodoxEaster, workingDaysBetween } from '@/lib/workingDays'

describe('working days (Romania)', () => {
  it('knows Orthodox Easter', () => {
    expect(orthodoxEaster(2025)).toBe('2025-04-20')
    expect(orthodoxEaster(2026)).toBe('2026-04-12')
    expect(orthodoxEaster(2027)).toBe('2027-05-02')
  })

  it('skips weekends and legal holidays', () => {
    expect(isWorkingDay('2026-09-26')).toBe(false) // Saturday
    expect(isWorkingDay('2026-12-01')).toBe(false) // Ziua Națională
    expect(isWorkingDay('2026-04-10')).toBe(false) // Vinerea Mare
    expect(isWorkingDay('2026-04-13')).toBe(false) // a doua zi de Paște
    expect(isWorkingDay('2026-06-01')).toBe(false) // Rusalii (a doua zi) + Ziua Copilului
    expect(isWorkingDay('2026-09-28')).toBe(true)
  })

  it('computes the e-Factura deadline: 5 working days after issue', () => {
    expect(efacturaDeadline('2026-09-21')).toBe('2026-09-28') // Mon → next Mon
    expect(efacturaDeadline('2026-09-25')).toBe('2026-10-02') // Fri → next Fri
    expect(efacturaDeadline('2026-11-26')).toBe('2026-12-07') // 30 Nov and 1 Dec are holidays
    expect(addWorkingDays('2026-12-23', 2)).toBe('2026-12-28')
  })

  it('counts working days between two dates, negative when past', () => {
    expect(workingDaysBetween('2026-09-24', '2026-09-24')).toBe(0)
    expect(workingDaysBetween('2026-09-25', '2026-09-28')).toBe(1)
    expect(workingDaysBetween('2026-09-28', '2026-09-25')).toBe(-1)
    expect(workingDaysBetween('2026-11-27', '2026-12-02')).toBe(1)
  })
})
