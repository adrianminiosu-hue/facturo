import { describe, expect, it } from 'vitest'
import { invoiceNumberValue, nextNumberAfter } from './invoiceNumber'

describe('invoice numbers', () => {
  it('reads the numeric part', () => {
    expect(invoiceNumberValue('0031')).toBe(31)
    expect(invoiceNumberValue('')).toBeNaN()
    expect(invoiceNumberValue(null)).toBeNaN()
  })

  it('continues after the highest issued number, whatever the order', () => {
    expect(nextNumberAfter(['0030', '0031', '0012'])).toBe('0032')
    expect(nextNumberAfter(['0012', '0031', '0030'])).toBe('0032')
  })

  it('ignores drafts without a number and starts from the company start number', () => {
    expect(nextNumberAfter(['', null, undefined], 100)).toBe('0100')
    expect(nextNumberAfter([], null)).toBe('0001')
  })
})
