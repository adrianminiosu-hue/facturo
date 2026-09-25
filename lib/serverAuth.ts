import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const INTERNAL_SECRET_HEADER = 'x-facturo-internal'
export const INTERNAL_ACTOR_HEADER = 'x-facturo-actor'

function sameSecret(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Resolves the acting user for an API route:
 * - browser calls: `Authorization: Bearer <Supabase access token>`;
 * - server-to-server calls (PDF for emails): the service key in `x-facturo-internal` plus `x-facturo-actor`.
 * API routes must use this instead of trusting a userId sent in the body or query string.
 */
export async function authenticatedUserId(request: NextRequest): Promise<string | null> {
  const internal = request.headers.get(INTERNAL_SECRET_HEADER) || ''
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || ''
  if (internal && serviceKey && sameSecret(internal, serviceKey)) {
    return request.headers.get(INTERNAL_ACTOR_HEADER) || null
  }
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin().auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

export function unauthorized() {
  return NextResponse.json({ error: 'Autentificare necesară.' }, { status: 401 })
}

/** Headers for a server-side call to our own API on behalf of `actorUserId`. */
export function internalHeaders(actorUserId: string): Record<string, string> {
  return {
    [INTERNAL_SECRET_HEADER]: process.env.SUPABASE_SERVICE_KEY || '',
    [INTERNAL_ACTOR_HEADER]: actorUserId
  }
}
