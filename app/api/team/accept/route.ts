import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingPortfolioTableError, normalizeInviteEmail } from '@/lib/portfolio'

export async function POST(request: NextRequest) {
  try {
    const actorId = await authenticatedUserId(request)
    if (!actorId) return unauthorized()
    const { token } = await request.json()

    const admin = supabaseAdmin()
    const { data } = await admin.auth.admin.getUserById(actorId)
    const email = normalizeInviteEmail(data.user?.email || '')
    if (!email) return NextResponse.json({ error: 'Cont fără email.' }, { status: 400 })

    let query = admin
      .from('portfolio_members')
      .select('*')
      .eq('status', 'pending')
      .eq('email', email)
    if (token) query = query.eq('invite_token', String(token))
    const pending = await query
    if (pending.error) {
      if (isMissingPortfolioTableError(pending.error)) return NextResponse.json({ success: true, accepted: 0 })
      return NextResponse.json({ error: pending.error.message }, { status: 400 })
    }

    const now = new Date().toISOString()
    let accepted = 0
    for (const row of pending.data || []) {
      if (row.owner_user_id === actorId) continue
      const { error } = await admin
        .from('portfolio_members')
        .update({ member_user_id: actorId, status: 'active', accepted_at: now })
        .eq('id', row.id)
      if (!error) accepted += 1
    }
    return NextResponse.json({ success: true, accepted })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Eroare' }, { status: 500 })
  }
}
