import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { bnrSourcesFor, parseBnrRates, rateBefore, BNR_10DAYS_URL, BNR_HOSTS, type BnrCube } from '@/lib/bnrRates'
import { calendarDateInBucharest, lastBankingDayBefore } from '@/lib/dates'

export const dynamic = 'force-dynamic'

/** BNR files kept in memory: an hour for the live feeds, a day for past years. */
const cache = new Map<string, { at: number; cubes: BnrCube[] }>()

/** `path` is a BNR file path; tries each BNR host until one answers with rates. */
async function loadCubes(path: string, today: string) {
  const ttl = path === BNR_10DAYS_URL || path.endsWith(`${today.slice(0, 4)}.xml`) ? 3600_000 : 86400_000
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < ttl) return hit.cubes
  let lastError = ''
  for (const host of BNR_HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
      if (!res.ok) { lastError = `BNR a răspuns ${res.status}`; continue }
      const cubes = parseBnrRates(await res.text())
      if (!cubes.length) { lastError = 'BNR a trimis un fișier fără cursuri.'; continue }
      cache.set(path, { at: Date.now(), cubes })
      return cubes
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'eroare de rețea'
    }
  }
  throw new Error(lastError || 'BNR nu a răspuns.')
}

/**
 * GET /api/fx/bnr?date=YYYY-MM-DD&currency=EUR
 * → { rate, publishedOn, currency, source: 'BNR', forDate, latest }
 * The rate is the last one BNR published before `date` (the invoice's VAT date).
 */
export async function GET(request: NextRequest) {
  const userId = await authenticatedUserId(request)
  if (!userId) return unauthorized()

  const today = calendarDateInBucharest(0)
  const date = request.nextUrl.searchParams.get('date') || today
  const currency = (request.nextUrl.searchParams.get('currency') || 'EUR').toUpperCase()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json({ error: 'Dată sau monedă invalidă.' }, { status: 400 })
  }

  try {
    let cubes: BnrCube[] = []
    for (const url of bnrSourcesFor(date > today ? today : date, today)) cubes = cubes.concat(await loadCubes(url, today))
    cubes.sort((a, b) => a.date.localeCompare(b.date))
    let found = rateBefore(cubes, date, currency)
    // Recent date not yet in the yearly file (or the other way around): try the 10-day feed too.
    if (!found || (date > today)) {
      const recent = await loadCubes(BNR_10DAYS_URL, today)
      found = rateBefore(cubes.concat(recent).sort((a, b) => a.date.localeCompare(b.date)), date, currency) || found
    }
    if (!found) return NextResponse.json({ error: `BNR nu are curs ${currency} publicat înainte de ${date}.` }, { status: 404 })
    return NextResponse.json({
      rate: found.rate,
      publishedOn: found.publishedOn,
      currency,
      source: 'BNR',
      forDate: date,
      // VAT date in the future and its rate not published yet: the latest there is, to be updated.
      provisional: date > today && found.publishedOn < lastBankingDayBefore(date)
    })
  } catch (error) {
    return NextResponse.json({ error: `Cursul BNR nu a putut fi preluat: ${error instanceof Error ? error.message : 'eroare de rețea'}` }, { status: 502 })
  }
}
