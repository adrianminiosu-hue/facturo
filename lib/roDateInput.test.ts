import { describe, expect, it } from 'vitest'
import { isoToRo, roToIso } from './roDateInput'

describe('roDateInput', () => {
  it('shows ISO dates as zz.ll.aaaa', () => {
    expect(isoToRo('2026-09-25')).toBe('25.09.2026')
    expect(isoToRo('2026-09-25T10:00:00Z')).toBe('25.09.2026')
    expect(isoToRo('')).toBe('')
  })

  it('accepts the ways people type a date', () => {
    expect(roToIso('25.09.2026')).toBe('2026-09-25')
    expect(roToIso('5.9.2026')).toBe('2026-09-05')
    expect(roToIso('25/09/2026')).toBe('2026-09-25')
    expect(roToIso('25-09-26')).toBe('2026-09-25')
    expect(roToIso('25092026')).toBe('2026-09-25')
  })

  it('rejects impossible or partial dates', () => {
    expect(roToIso('31.02.2026')).toBe('')
    expect(roToIso('29.02.2027')).toBe('')
    expect(roToIso('29.02.2028')).toBe('2028-02-29')
    expect(roToIso('25.09')).toBe('')
    expect(roToIso('abc')).toBe('')
  })
})
