import { describe, expect, it } from 'vitest'
import { bnrSourcesFor, bnrYearUrl, BNR_10DAYS_URL, parseBnrRates, rateBefore } from './bnrRates'

const xml = `<?xml version="1.0" encoding="utf-8"?>
<DataSet xmlns="http://www.bnr.ro/xsd">
<Header><Publisher>National Bank of Romania</Publisher><PublishingDate>2026-09-25</PublishingDate><MessageType>DR</MessageType></Header>
<Body><Subject>Reference rates</Subject><OrigCurrency>RON</OrigCurrency>
<Cube date="2026-09-24"><Rate currency="EUR">5.0843</Rate><Rate currency="USD">4.3310</Rate><Rate currency="HUF" multiplier="100">1.3050</Rate></Cube>
<Cube date="2026-09-25"><Rate currency="EUR">5.0851</Rate><Rate currency="USD">4.3402</Rate></Cube>
<Cube date="2026-09-23"><Rate currency="EUR">5.0830</Rate></Cube>
</Body></DataSet>`

describe('BNR rates', () => {
  it('reads cubes in date order, per unit (multiplier)', () => {
    const cubes = parseBnrRates(xml)
    expect(cubes.map(c => c.date)).toEqual(['2026-09-23', '2026-09-24', '2026-09-25'])
    expect(cubes[1].rates).toEqual({ EUR: 5.0843, USD: 4.331, HUF: 0.01305 })
  })

  it('takes the last rate published before the VAT date (weekend falls back to Friday)', () => {
    const cubes = parseBnrRates(xml)
    expect(rateBefore(cubes, '2026-09-25')).toEqual({ rate: 5.0843, publishedOn: '2026-09-24' })
    // Monday 28.09: last publication before it is Friday 25.09
    expect(rateBefore(cubes, '2026-09-28')).toEqual({ rate: 5.0851, publishedOn: '2026-09-25' })
    expect(rateBefore(cubes, '2026-09-26', 'USD')).toEqual({ rate: 4.3402, publishedOn: '2026-09-25' })
    expect(rateBefore(cubes, '2026-09-23')).toBeNull()
  })

  it('uses the 10-day feed for recent dates and the yearly archive otherwise', () => {
    expect(bnrSourcesFor('2026-09-26', '2026-09-26')).toEqual([BNR_10DAYS_URL])
    expect(bnrSourcesFor('2026-06-10', '2026-09-26')).toEqual([bnrYearUrl(2026)])
    expect(bnrSourcesFor('2026-01-05', '2026-09-26')).toEqual([bnrYearUrl(2025), bnrYearUrl(2026)])
  })
})
