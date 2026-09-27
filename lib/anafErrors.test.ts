import { expect, it } from 'vitest'
import { anafErrorHint } from '@/lib/anafErrors'

it('explains common ANAF messages in plain words', () => {
  expect(anafErrorHint('[BR-RO-110] CountrySubentity must be RO-xx')).toBe('efd.hint.county')
  expect(anafErrorHint('Factura a fost deja transmisă.')).toBe('efd.hint.duplicate')
  expect(anafErrorHint('HTTP 503 Service Unavailable')).toBe('efd.hint.outage')
  expect(anafErrorHint('')).toBeNull()
})
