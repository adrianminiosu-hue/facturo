import { describe, expect, it } from 'vitest'
import { formatAmount, formatDecimal, formatRon, parseAmount } from './money'

describe('money', () => {
  it('formats amounts the Romanian way', () => {
    expect(formatAmount(1726042.68)).toBe('1.726.042,68')
    expect(formatAmount(-2783)).toBe('-2.783,00')
    expect(formatAmount(0.001)).toBe('0,00')
    expect(formatAmount(-0.004)).toBe('0,00')
    expect(formatAmount('abc')).toBe('0,00')
    expect(formatRon(33408.1)).toBe('33.408,10 RON')
  })

  it('formats small decimals with a comma', () => {
    expect(formatDecimal(4.34)).toBe('4,3')
    expect(formatDecimal(12)).toBe('12')
    expect(formatDecimal(79.4, 0)).toBe('79')
  })

  it('parses what people type', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('1234,56')).toBe(1234.56)
    expect(parseAmount('1234.56')).toBe(1234.56)
    expect(parseAmount('1 234,56 lei')).toBe(1234.56)
    expect(parseAmount('1.234.567')).toBe(1234567)
    expect(parseAmount('18150,00')).toBe(18150)
    expect(parseAmount('')).toBeNaN()
    expect(parseAmount('abc')).toBeNaN()
  })
})
