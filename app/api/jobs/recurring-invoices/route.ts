import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { calendarDateInBucharest } from '@/lib/dates'
import { BNR_10DAYS_URL, BNR_HOSTS, bnrYearUrl, parseBnrRates, rateBefore, type BnrCube } from '@/lib/bnrRates'
import { runRecurringInvoices } from '@/lib/recurringRun'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') || ''
  if (secret) return header === `Bearer ${secret}`
  return process.env.NODE_ENV !== 'production'
}

async function bnrCubes(path: string): Promise<BnrCube[]> {
  for (const host of BNR_HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
      if (!res.ok) continue
      const cubes = parseBnrRates(await res.text())
      if (cubes.length) return cubes
    } catch {
      // next host
    }
  }
  return []
}

/** EUR rate BNR published before `date`, loaded once per run. */
function bnrLookup() {
  let loaded: Promise<BnrCube[]> | null = null
  return async (date: string) => {
    loaded ??= Promise.all([bnrCubes(BNR_10DAYS_URL), bnrCubes(bnrYearUrl(Number(date.slice(0, 4))))])
      .then(([recent, year]) => year.concat(recent).sort((a, b) => a.date.localeCompare(b.date)))
    const found = rateBefore(await loaded, date, 'EUR')
    return found ? { rate: found.rate, publishedOn: found.publishedOn } : null
  }
}

/** Daily (Vercel cron, ~07:00 Bucharest): drafts for every recurring invoice whose date has come. */
async function handle(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const report = await runRecurringInvoices(supabaseAdmin(), {
      today: calendarDateInBucharest(0),
      fx: bnrLookup(),
      budgetMs: 45_000
    })
    return NextResponse.json({ ok: true, ...report })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Recurring job failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
