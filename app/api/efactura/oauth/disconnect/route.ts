import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { disconnectAnafOAuth } from '@/lib/anafOAuthHttp'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const userId = await authenticatedUserId(request)
  if (!userId) return unauthorized()
  const { ownerUserId } = await request.json().catch(() => ({}))
  const result = await disconnectAnafOAuth(userId, ownerUserId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
