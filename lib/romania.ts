export const RO_COUNTIES = [
  { code: 'AB', name: 'Alba' },
  { code: 'AR', name: 'Arad' },
  { code: 'AG', name: 'Argeș' },
  { code: 'BC', name: 'Bacău' },
  { code: 'BH', name: 'Bihor' },
  { code: 'BN', name: 'Bistrița-Năsăud' },
  { code: 'BT', name: 'Botoșani' },
  { code: 'BV', name: 'Brașov' },
  { code: 'BR', name: 'Brăila' },
  { code: 'B', name: 'București' },
  { code: 'BZ', name: 'Buzău' },
  { code: 'CS', name: 'Caraș-Severin' },
  { code: 'CL', name: 'Călărași' },
  { code: 'CJ', name: 'Cluj' },
  { code: 'CT', name: 'Constanța' },
  { code: 'CV', name: 'Covasna' },
  { code: 'DB', name: 'Dâmbovița' },
  { code: 'DJ', name: 'Dolj' },
  { code: 'GL', name: 'Galați' },
  { code: 'GR', name: 'Giurgiu' },
  { code: 'GJ', name: 'Gorj' },
  { code: 'HR', name: 'Harghita' },
  { code: 'HD', name: 'Hunedoara' },
  { code: 'IL', name: 'Ialomița' },
  { code: 'IS', name: 'Iași' },
  { code: 'IF', name: 'Ilfov' },
  { code: 'MM', name: 'Maramureș' },
  { code: 'MH', name: 'Mehedinți' },
  { code: 'MS', name: 'Mureș' },
  { code: 'NT', name: 'Neamț' },
  { code: 'OT', name: 'Olt' },
  { code: 'PH', name: 'Prahova' },
  { code: 'SM', name: 'Satu Mare' },
  { code: 'SJ', name: 'Sălaj' },
  { code: 'SB', name: 'Sibiu' },
  { code: 'SV', name: 'Suceava' },
  { code: 'TR', name: 'Teleorman' },
  { code: 'TM', name: 'Timiș' },
  { code: 'TL', name: 'Tulcea' },
  { code: 'VS', name: 'Vaslui' },
  { code: 'VL', name: 'Vâlcea' },
  { code: 'VN', name: 'Vrancea' }
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

export function isBucharestSector(city?: string | null) {
  return !!city && BUCHAREST_SECTORS.includes(city as (typeof BUCHAREST_SECTORS)[number])
}

export function bucharestSectorFromText(...parts: Array<string | null | undefined>) {
  const text = parts.filter(Boolean).join(' ')
  if (!text) return ''
  const match = text.match(/(?:sector(?:ul)?|sect)\s*\.?\s*([1-6])/i)
  return match ? `Sector ${match[1]}` : ''
}
