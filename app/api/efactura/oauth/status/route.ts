import { NextRequest } from 'next/server'
import { anafOAuthStatus } from '@/lib/anafOAuthHttp'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  return anafOAuthStatus(request)
}
