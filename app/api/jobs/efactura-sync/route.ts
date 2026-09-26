import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { runEfacturaSync } from '@/lib/efacturaSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * e-Factura sync for all accounts (states + retry queue). Runs daily inside /api/jobs/due-reminders;
 * this route allows a more frequent schedule (Vercel cron on Pro, or any external cron with CRON_SECRET).
 */
function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') || ''
  if (secret) return header === `Bearer ${secret}`
  return process.env.NODE_ENV !== 'production'
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const report = await runEfacturaSync(supabaseAdmin(), { budgetMs: 50_000, limit: 100 })
    return NextResponse.json({ ok: true, ...report })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'e-Factura sync failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
