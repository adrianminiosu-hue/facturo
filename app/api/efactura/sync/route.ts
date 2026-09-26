import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { loadMembershipOwnerIds, uniqueIds } from '@/lib/portfolio'
import { runEfacturaSync } from '@/lib/efacturaSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** One sync per user per minute is enough; the invoices list calls this when it opens. */
const lastRun = new Map<string, number>()
const MIN_INTERVAL_MS = 60_000

export async function POST(request: NextRequest) {
  const userId = await authenticatedUserId(request)
  if (!userId) return unauthorized()

  const force = request.nextUrl.searchParams.get('force') === '1'
  const last = lastRun.get(userId) || 0
  if (!force && Date.now() - last < MIN_INTERVAL_MS) {
    return NextResponse.json({ throttled: true, checked: 0, retried: 0, results: [] })
  }
  lastRun.set(userId, Date.now())

  try {
    const db = supabaseAdmin()
    const memberships = await loadMembershipOwnerIds(db, userId)
    const ownerUserIds = uniqueIds([userId, ...memberships.ownerIds])
    const report = await runEfacturaSync(db, { ownerUserIds, limit: 15, budgetMs: 25_000 })
    return NextResponse.json({
      ...report,
      changed: report.results.filter(r => r.outcome !== 'processing' && r.outcome !== 'unavailable').length
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Sincronizarea e-Factura a eșuat.' }, { status: 500 })
  }
}
