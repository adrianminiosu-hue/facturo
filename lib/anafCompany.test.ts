import { describe, expect, it, vi } from 'vitest'
import { anafCity, cleanCui, fetchAnafCompanies, parseAnafRecord } from './anafCompany'

const bucharest = {
  date_generale: {
    cui: 5450286,
    data: '2026-09-25',
    denumire: 'EXEMPLU CONSTRUCT SRL',
    adresa: 'MUNICIPIUL BUCUREŞTI, SECTOR 3, STR. EXEMPLU, NR.10',
    nrRegCom: 'J40/1234/2015',
    telefon: '0212223344',
    codPostal: '030000',
    stare_inregistrare: 'INREGISTRAT din data 10.03.2015',
    cod_CAEN: '4120',
    statusRO_e_Factura: true
  },
  inregistrare_scop_Tva: { scpTVA: true, perioade_TVA: [] },
  inregistrare_RTVAI: { statusTvaIncasare: false },
  stare_inactiv: { dataInactivare: '', dataReactivare: '', dataPublicare: '', dataRadiere: '', statusInactivi: false },
  inregistrare_SplitTVA: { statusSplitTVA: false },
  adresa_sediu_social: {
    sdenumire_Strada: 'Str. Exemplu',
    snumar_Strada: '10',
    sdenumire_Localitate: 'Sector 3 Mun. Bucureşti',
    sdenumire_Judet: 'MUNICIPIUL BUCUREŞTI',
    scod_JudetAuto: 'B',
    sdetalii_Adresa: 'Bl. A, Ap. 2',
    scod_Postal: '031234'
  },
  adresa_domiciliu_fiscal: {}
}

const inactiveCluj = {
  date_generale: { cui: '123456', denumire: 'VECHE SRL', nrRegCom: 'J12/99/2010', stare_inregistrare: 'RADIERE din data 01.02.2026', statusRO_e_Factura: false },
  inregistrare_scop_Tva: { scpTVA: false },
  inregistrare_RTVAI: { statusTvaIncasare: true },
  stare_inactiv: { dataInactivare: '2025-06-01', dataRadiere: '2026-02-01', statusInactivi: true },
  inregistrare_SplitTVA: { statusSplitTVA: false },
  adresa_sediu_social: {},
  adresa_domiciliu_fiscal: { ddenumire_Strada: 'Str. Mare', dnumar_Strada: '1', ddenumire_Localitate: 'Mun. Cluj-Napoca', ddenumire_Judet: 'CLUJ', dcod_JudetAuto: 'CJ', dcod_Postal: '400001' }
}

describe('anafCompany', () => {
  it('parses a Bucharest company from the registered seat', () => {
    const c = parseAnafRecord(bucharest)!
    expect(c.cui).toBe('5450286')
    expect(c.company_name).toBe('EXEMPLU CONSTRUCT SRL')
    expect(c.county_code).toBe('B')
    expect(c.city).toBe('Sector 3')
    expect(c.address).toBe('Str. Exemplu Nr. 10, Bl. A, Ap. 2')
    expect(c.postal_code).toBe('031234')
    expect(c.vat_registered).toBe(true)
    expect(c.efactura_registered).toBe(true)
    expect(c.inactive).toBe(false)
    expect(c.deregistered_on).toBeNull()
    expect(c.reg_com).toContain('40')
  })

  it('flags inactive / struck-off companies and falls back to the fiscal address', () => {
    const c = parseAnafRecord(inactiveCluj)!
    expect(c.inactive).toBe(true)
    expect(c.deregistered_on).toBe('2026-02-01')
    expect(c.vat_registered).toBe(false)
    expect(c.vat_on_collection).toBe(true)
    expect(c.city).toBe('Cluj-Napoca')
    expect(c.county_code).toBe('CJ')
    expect(c.address).toBe('Str. Mare Nr. 1')
  })

  it('normalizes CUIs and cities', () => {
    expect(cleanCui('RO 5450286')).toBe('5450286')
    expect(anafCity('Oraş Voluntari', 'IF')).toBe('Voluntari')
    expect(parseAnafRecord({})).toBeNull()
  })

  it('batches by 100, returns found companies and throws on ANAF errors', async () => {
    const calls: number[] = []
    const ok = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      calls.push(body.length)
      return new Response(JSON.stringify({ cod: 200, message: 'SUCCESS', found: body[0].cui === 5450286 ? [bucharest] : [], notFound: [] }))
    })
    const cuis = ['RO5450286', ...Array.from({ length: 120 }, (_, i) => String(1000 + i))]
    vi.useFakeTimers()
    const promise = fetchAnafCompanies(cuis, '2026-09-25', ok as unknown as typeof fetch)
    await vi.runAllTimersAsync()
    const map = await promise
    vi.useRealTimers()
    expect(calls).toEqual([100, 21])
    expect(map.get('5450286')?.company_name).toBe('EXEMPLU CONSTRUCT SRL')

    const down = vi.fn(async () => new Response('busy', { status: 503 }))
    await expect(fetchAnafCompanies(['1'], '2026-09-25', down as unknown as typeof fetch)).rejects.toThrow('503')
  })
})
