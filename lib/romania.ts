export const RO_COUNTIES = [
  { code: 'AB', name: 'Alba', onrc: '01' },
  { code: 'AR', name: 'Arad', onrc: '02' },
  { code: 'AG', name: 'Argeș', onrc: '03' },
  { code: 'BC', name: 'Bacău', onrc: '04' },
  { code: 'BH', name: 'Bihor', onrc: '05' },
  { code: 'BN', name: 'Bistrița-Năsăud', onrc: '06' },
  { code: 'BT', name: 'Botoșani', onrc: '07' },
  { code: 'BV', name: 'Brașov', onrc: '08' },
  { code: 'BR', name: 'Brăila', onrc: '09' },
  { code: 'B', name: 'București', onrc: '40' },
  { code: 'BZ', name: 'Buzău', onrc: '10' },
  { code: 'CS', name: 'Caraș-Severin', onrc: '11' },
  { code: 'CL', name: 'Călărași', onrc: '51' },
  { code: 'CJ', name: 'Cluj', onrc: '12' },
  { code: 'CT', name: 'Constanța', onrc: '13' },
  { code: 'CV', name: 'Covasna', onrc: '14' },
  { code: 'DB', name: 'Dâmbovița', onrc: '15' },
  { code: 'DJ', name: 'Dolj', onrc: '16' },
  { code: 'GL', name: 'Galați', onrc: '17' },
  { code: 'GR', name: 'Giurgiu', onrc: '52' },
  { code: 'GJ', name: 'Gorj', onrc: '18' },
  { code: 'HR', name: 'Harghita', onrc: '19' },
  { code: 'HD', name: 'Hunedoara', onrc: '20' },
  { code: 'IL', name: 'Ialomița', onrc: '21' },
  { code: 'IS', name: 'Iași', onrc: '22' },
  { code: 'IF', name: 'Ilfov', onrc: '23' },
  { code: 'MM', name: 'Maramureș', onrc: '24' },
  { code: 'MH', name: 'Mehedinți', onrc: '25' },
  { code: 'MS', name: 'Mureș', onrc: '26' },
  { code: 'NT', name: 'Neamț', onrc: '27' },
  { code: 'OT', name: 'Olt', onrc: '28' },
  { code: 'PH', name: 'Prahova', onrc: '29' },
  { code: 'SM', name: 'Satu Mare', onrc: '30' },
  { code: 'SJ', name: 'Sălaj', onrc: '31' },
  { code: 'SB', name: 'Sibiu', onrc: '32' },
  { code: 'SV', name: 'Suceava', onrc: '33' },
  { code: 'TR', name: 'Teleorman', onrc: '34' },
  { code: 'TM', name: 'Timiș', onrc: '35' },
  { code: 'TL', name: 'Tulcea', onrc: '36' },
  { code: 'VS', name: 'Vaslui', onrc: '37' },
  { code: 'VL', name: 'Vâlcea', onrc: '38' },
  { code: 'VN', name: 'Vrancea', onrc: '39' }
] as const

export const BUCHAREST_SECTORS = ['Sector 1', 'Sector 2', 'Sector 3', 'Sector 4', 'Sector 5', 'Sector 6'] as const

export function stripDiacritics(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ș|ş/gi, 's')
    .replace(/ț|ţ/gi, 't')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function countyCodeFromName(name?: string | null): string {
  if (!name) return ''
  const normalized = stripDiacritics(name)
  if (!normalized) return ''
  if (normalized.includes('BUCURESTI') || normalized === 'B') return 'B'
  const match = RO_COUNTIES.find(c => stripDiacritics(c.name) === normalized)
  return match?.code || ''
}

export function countyNameFromCode(code?: string | null): string {
  if (!code) return ''
  return RO_COUNTIES.find(c => c.code === code)?.name || ''
}

/** ONRC județ digits used in J40/1234/2020. */
export function onrcCountyNumber(county?: string | null, countyCode?: string | null): string {
  const code = (countyCode || '').trim().toUpperCase() || countyCodeFromName(county)
  if (code) {
    const match = RO_COUNTIES.find(item => item.code === code)
    if (match) return match.onrc
  }
  if (!county) return ''
  const normalized = stripDiacritics(county)
  return RO_COUNTIES.find(item => stripDiacritics(item.name) === normalized)?.onrc || ''
}

export function isBucharestSector(city?: string | null) {
  return !!city && BUCHAREST_SECTORS.includes(city as (typeof BUCHAREST_SECTORS)[number])
}

export function bucharestSectorFromText(...parts: Array<string | null | undefined>) {
  const text = parts.filter(Boolean).join(' ')
  if (!text) return ''
  const match = text.match(/(?:sector(?:ul)?|sect)\s*\.?\s*([1-6])/i)
  return match ? `Sector ${match[1]}` : ''
}
