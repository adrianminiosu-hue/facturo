/**
 * BNR reference rates (https://curs.bnr.ro/nbrfxrates.xml and siblings; www.bnr.ro now redirects them to its home page).
 *   <DataSet><Body><Cube date="2026-09-25"><Rate currency="EUR">5.0851</Rate>
 *   <Rate currency="HUF" multiplier="100">1.3050</Rate> ... </Cube></Body></DataSet>
 * A Cube's date is the day BNR published it. The rate for an invoice is the last one published
 * before the VAT date (Codul fiscal art. 290), so weekends and bank holidays fall back naturally.
 */
export type BnrCube = { date: string; rates: Record<string, number> }

export const BNR_HOSTS = ['https://curs.bnr.ro', 'https://www.bnr.ro'] as const
export const BNR_DAILY_URL = '/nbrfxrates.xml'
export const BNR_10DAYS_URL = '/nbrfxrates10days.xml'
export const bnrYearUrl = (year: number) => `/files/xml/years/nbrfxrates${year}.xml`

export function parseBnrRates(xml: string): BnrCube[] {
  const cubes: BnrCube[] = []
  for (const cube of xml.matchAll(/<Cube\s+date="(\d{4}-\d{2}-\d{2})"\s*>([\s\S]*?)<\/Cube>/g)) {
    const rates: Record<string, number> = {}
    for (const rate of cube[2].matchAll(/<Rate\s+([^>]*)>\s*([\d.]+)\s*<\/Rate>/g)) {
      const currency = rate[1].match(/currency="([A-Z]{3})"/)?.[1]
      if (!currency) continue
      const multiplier = Number(rate[1].match(/multiplier="(\d+)"/)?.[1] || 1)
      const value = Number(rate[2])
      if (Number.isFinite(value) && value > 0) rates[currency] = Math.round((value / multiplier) * 1e6) / 1e6
    }
    cubes.push({ date: cube[1], rates })
  }
  return cubes.sort((a, b) => a.date.localeCompare(b.date))
}

/** Last rate for `currency` published strictly before `date` (ISO). */
export function rateBefore(cubes: BnrCube[], date: string, currency = 'EUR') {
  let found: { rate: number; publishedOn: string } | null = null
  for (const cube of cubes) {
    if (cube.date >= date) break
    const rate = cube.rates[currency]
    if (rate) found = { rate, publishedOn: cube.date }
  }
  return found
}

/** Which BNR files cover a date: the 10-day feed for recent dates, the yearly archive(s) otherwise. */
export function bnrSourcesFor(date: string, today: string) {
  const daysBack = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86400000
  if (daysBack <= 8) return [BNR_10DAYS_URL]
  const year = Number(date.slice(0, 4))
  // Early January needs the last publications of the previous year.
  return date.slice(5) <= '01-15' ? [bnrYearUrl(year - 1), bnrYearUrl(year)] : [bnrYearUrl(year)]
}
