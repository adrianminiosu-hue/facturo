import { NextRequest } from 'next/server'
import { startAnafOAuth } from '@/lib/anafOAuthHttp'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  return startAnafOAuth(request)
}
