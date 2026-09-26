import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { loadMembershipOwnerIds, uniqueIds } from '@/lib/portfolio'
import { summarizeEfacturaLog, type EfacturaLogRow } from '@/lib/efacturaLog'

export const dynamic = 'force-dynamic'

/** Measured e-Factura transfer rate for the last N days, from the journal. */
export async function GET(request: NextRequest) {
  const userId = await authenticatedUserId(request)
  if (!userId) return unauthorized()

  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get('days')) || 30))
  const companyId = request.nextUrl.searchParams.get('companyId')
  const db = supabaseAdmin()
  const memberships = await loadMembershipOwnerIds(db, userId)
  const ownerUserIds = uniqueIds([userId, ...memberships.ownerIds])
  const since = new Date(Date.now() - days * 86400000).toISOString()

  let query = db
    .from('efactura_log')
    .select('invoice_id, direction, operation, outcome, message_id, invoice_ref, message, code, trigger, created_at')
    .in('user_id', ownerUserIds)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (companyId) query = query.eq('company_id', companyId)
  const { data, error } = await query

  if (error) {
    const missing = /efactura_log/.test(error.message) && /(does not exist|schema cache|not find)/i.test(error.message)
    if (missing) return NextResponse.json({ available: false, reason: 'Jurnalul e-Factura nu este încă activ (migrarea 20260929_efactura_log_queue.sql nu e aplicată).' })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []) as Array<EfacturaLogRow & { trigger?: string }>
  // Pending work right now, straight from the invoices.
  let pendingQuery = db.from('invoices').select('efactura_status').in('user_id', ownerUserIds).in('efactura_status', ['queued', 'uploaded', 'in_processing'])
  if (companyId) pendingQuery = pendingQuery.eq('company_id', companyId)
  const pending = await pendingQuery
  const now = { queued: 0, awaitingAnaf: 0 }
  for (const row of (pending.data || []) as Array<{ efactura_status: string }>) {
    if (row.efactura_status === 'queued') now.queued += 1
    else now.awaitingAnaf += 1
  }

  return NextResponse.json({
    available: true,
    days,
    stats: summarizeEfacturaLog(rows),
    now,
    recent: rows.slice(0, 25)
  })
}
