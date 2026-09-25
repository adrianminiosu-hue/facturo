import { describe, expect, it } from 'vitest'
import { formatFxRate, fxMention, fxRateLine, notesWithFxMention } from './invoiceFx'

describe('invoiceFx', () => {
  it('formats the rate with 4 decimals, Romanian style', () => {
    expect(formatFxRate(5.02)).toBe('5,0200')
    expect(formatFxRate(5.0851)).toBe('5,0851')
  })

  it('builds the rate line and the legal mention', () => {
    expect(fxRateLine(5.0851, 'BNR', '2026-09-23')).toBe('1 EUR = 5,0851 lei (BNR, 23.09.2026)')
    expect(fxRateLine(5.02)).toBe('1 EUR = 5,0200 lei')
    expect(fxMention(5.0851, 'BNR', '2026-09-23')).toBe(
      'Prețurile unitare sunt exprimate în EUR și convertite în lei la cursul BNR de 5,0851 lei/EUR din 23.09.2026. Plata se face în lei.'
    )
    expect(fxMention(5.02, null, null)).toContain('la cursul de 5,0200 lei/EUR. Plata')
  })

  it('appends the mention once, only for EUR invoices', () => {
    expect(notesWithFxMention('Plata în 15 zile', 0)).toBe('Plata în 15 zile')
    const once = notesWithFxMention('Plata în 15 zile', 5.0851, 'BNR', '2026-09-23')
    expect(once.split('\n')).toHaveLength(2)
    expect(notesWithFxMention(once, 5.0851, 'BNR', '2026-09-23')).toBe(once)
    expect(notesWithFxMention('', 5.0851, 'BNR')).toMatch(/^Prețurile unitare/)
  })
})
