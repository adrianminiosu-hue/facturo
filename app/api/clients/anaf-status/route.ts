import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { actorCanAccessOwner } from '@/lib/portfolio'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { refreshClientsAnafStatus } from '@/lib/anafRefresh'

/** POST { clientId } → re-checks one client at ANAF and returns its stored status. */
export async function POST(request: NextRequest) {
  const userId = await authenticatedUserId(request)
  if (!userId) return unauthorized()
  try {
    const { clientId } = await request.json()
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })
    const admin = supabaseAdmin()
    const { data: client } = await admin.from('clients').select('id, cui, user_id').eq('id', clientId).maybeSingle()
    if (!client || !(await actorCanAccessOwner(admin, userId, client.user_id))) {
      return NextResponse.json({ error: 'Clientul nu a fost găsit' }, { status: 404 })
    }
    await refreshClientsAnafStatus(admin, [client])
    const { data: status, error } = await admin
      .from('clients')
      .select('anaf_checked_at, anaf_inactive, anaf_deregistered_on, anaf_efactura_registered, anaf_vat_on_collection, anaf_split_vat, vat_registered')
      .eq('id', clientId)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, status })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Verificarea ANAF a eșuat'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
