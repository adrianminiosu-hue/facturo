import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingPortfolioTableError } from '@/lib/portfolio'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const admin = supabaseAdmin()
    const { data, error } = await admin
      .from('portfolio_members')
      .select('email, status, owner_user_id, invite_token')
      .eq('invite_token', token)
      .maybeSingle()
    if (error) {
      if (isMissingPortfolioTableError(error)) {
        return NextResponse.json({ error: 'Invitațiile nu sunt instalate.' }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (!data) return NextResponse.json({ error: 'Invitația nu există sau a fost revocată.' }, { status: 404 })

    const { data: owner } = await admin.auth.admin.getUserById(data.owner_user_id)
    return NextResponse.json({
      email: data.email,
      status: data.status,
      ownerName: owner.user?.user_metadata?.full_name || owner.user?.email || 'Un coleg'
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Eroare' }, { status: 500 })
  }
}
