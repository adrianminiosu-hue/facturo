import { NextRequest } from 'next/server'
import { startAnafOAuth, startAnafOAuthLegacy } from '@/lib/anafOAuthHttp'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return startAnafOAuth(request)
}

export async function GET(request: NextRequest) {
  return startAnafOAuthLegacy(request)
}
