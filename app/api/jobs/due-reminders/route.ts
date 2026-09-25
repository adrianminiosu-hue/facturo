import { NextRequest, NextResponse } from 'next/server'
import { runDueReminders } from '@/lib/dueReminders'
import { runAnafRefresh } from '@/lib/anafRefresh'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') || ''
  if (secret) return header === `Bearer ${secret}`
  return process.env.NODE_ENV !== 'production'
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'
  try {
    // ANAF status first, so reminders and the collections pages see fresh inactive / struck-off flags.
    // Non-fatal: ANAF being down must not block reminders.
    let anaf: { checked: number; inactive: number } | { error: string } | undefined
    if (!dryRun) {
      try {
        const refreshed = await runAnafRefresh(supabaseAdmin())
        anaf = { checked: refreshed.checked, inactive: refreshed.inactive.length }
      } catch (anafError) {
        anaf = { error: anafError instanceof Error ? anafError.message : 'ANAF refresh failed' }
      }
    }
    const report = await runDueReminders({ dryRun })
    return NextResponse.json({
      ok: true,
      anaf,
      ...report,
      sent: report.results.filter(r => r.status === 'sent').length,
      skipped: report.results.filter(r => r.status === 'skipped').length,
      failed: report.results.filter(r => r.status === 'failed').length
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare job reminder'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
