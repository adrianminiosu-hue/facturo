import { NextRequest } from 'next/server'
import { callbackAnafOAuth } from '@/lib/anafOAuthHttp'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  return callbackAnafOAuth(request)
}
