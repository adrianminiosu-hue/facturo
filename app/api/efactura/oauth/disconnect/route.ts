import { NextRequest, NextResponse } from 'next/server'
import { disconnectAnafOAuth } from '@/lib/anafOAuthHttp'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { userId, ownerUserId } = await request.json().catch(() => ({}))
  if (!userId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  const result = await disconnectAnafOAuth(userId, ownerUserId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
