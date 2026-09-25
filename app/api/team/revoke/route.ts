import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: NextRequest) {
  try {
    const ownerId = await authenticatedUserId(request)
    if (!ownerId) return unauthorized()
    const { memberId } = await request.json()
    const id = String(memberId || '')
    if (!ownerId || !id) return NextResponse.json({ error: 'Lipsesc datele.' }, { status: 400 })

    const admin = supabaseAdmin()
    const { error } = await admin
      .from('portfolio_members')
      .delete()
      .eq('id', id)
      .eq('owner_user_id', ownerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Eroare' }, { status: 500 })
  }
}
