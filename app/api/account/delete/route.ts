import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const { userId } = await request.json().catch(() => ({ userId: '' }))
  if (!userId) return NextResponse.json({ error: 'Lipsă utilizator' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Ștergerea contului de autentificare nu este configurată.' }, { status: 500 })
  }

  const admin = createClient(url, serviceKey)
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
