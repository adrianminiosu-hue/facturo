import { describe, expect, it } from 'vitest'
import { dueOffset, effectiveSettings, nextScheduled, normalizeOffsets, offsetLabel } from './reminderSchedule'

const on = { enabled: true, offsets: [-3, 1, 7, 15, 30] }

describe('reminderSchedule', () => {
  it('falls back to the legacy single reminder without a settings row', () => {
    const s = effectiveSettings('c1', null)
    expect(s.custom).toBe(false)
    expect(s.offsets).toEqual([-2])
    expect(dueOffset('2026-10-10', '2026-10-08', s, [])).toBe(-2)
  })

  it('sends the step that matches today', () => {
    expect(dueOffset('2026-09-18', '2026-09-19', on, [])).toBe(1)
    expect(dueOffset('2026-09-18', '2026-09-25', on, [1])).toBe(7)
  })

  it('catches up a missed run by at most 2 days and never repeats a step', () => {
    expect(dueOffset('2026-09-18', '2026-09-27', on, [1])).toBe(7)
    expect(dueOffset('2026-09-18', '2026-09-28', on, [1])).toBeNull()
    expect(dueOffset('2026-09-18', '2026-09-25', on, [1, 7])).toBeNull()
  })

  it('does not send an older step after a newer one went out', () => {
    expect(dueOffset('2026-09-18', '2026-09-19', on, [7])).toBeNull()
  })

  it('respects the off switch', () => {
    expect(dueOffset('2026-09-18', '2026-09-19', { ...on, enabled: false }, [])).toBeNull()
    expect(nextScheduled('2026-09-18', '2026-09-19', { ...on, enabled: false }, [])).toBeNull()
  })

  it('computes the next scheduled reminder', () => {
    expect(nextScheduled('2026-10-10', '2026-09-25', on, [])).toEqual({ offset: -3, date: '2026-10-07' })
    expect(nextScheduled('2026-09-18', '2026-09-24', on, [1])).toEqual({ offset: 7, date: '2026-09-25' })
    expect(nextScheduled('2026-08-01', '2026-09-25', on, [30])).toBeNull()
  })

  it('normalizes offsets and labels them', () => {
    expect(normalizeOffsets([7, '1', -3, 7, 200, 1.5])).toEqual([-3, 1, 7])
    expect(offsetLabel(-3)).toBe('−3')
    expect(offsetLabel(7)).toBe('+7')
  })
})
