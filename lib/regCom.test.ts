import { describe, expect, it } from 'vitest'
import { formatRegCom, pickRegCom } from '@/lib/regCom'

describe('formatRegCom', () => {
  it('keeps official slashes', () => {
    expect(formatRegCom('J40/1234/2020')).toBe('J40/1234/2020')
    expect(formatRegCom('j23/8/1991')).toBe('J23/8/1991')
  })

  it('turns backslashes into slashes', () => {
    expect(formatRegCom('J40\\1234\\2020')).toBe('J40/1234/2020')
    expect(formatRegCom('J40\\\\1234\\\\2020')).toBe('J40/1234/2020')
  })

  it('inserts slashes into a classic compact token', () => {
    expect(formatRegCom('J4012342020')).toBe('J40/1234/2020')
    expect(formatRegCom('J2381991')).toBe('J23/8/1991')
    expect(formatRegCom('F40 12 2015')).toBe('F40/12/2015')
  })

  it('converts the new ONRC id using the county', () => {
    expect(formatRegCom('J2002000372404', { countyCode: 'B' })).toBe('J40/3724/2002')
    expect(formatRegCom('J2018018184401', { county: 'Municipiul București' })).toBe('J40/181844/2018')
  })

  it('strips the ROONRC prefix', () => {
    expect(formatRegCom('ROONRC.J40/1234/2020')).toBe('J40/1234/2020')
  })
})

describe('pickRegCom', () => {
  it('prefers a value that already has separators', () => {
    expect(pickRegCom(['J4012342020', 'J40/1234/2020', 'ROONRC.J40/1234/2020'])).toBe('J40/1234/2020')
  })
})
