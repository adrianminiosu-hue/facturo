import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { NextRequest, NextResponse } from 'next/server'
import { actorCanAccessOwner } from '@/lib/portfolio'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  anafOAuthConfigured,
  authorizeUrl,
  createOAuthState,
  deleteOAuthTokens,
  exchangeAuthorizationCode,
  loadOAuthTokens,
  publicConnection,
  readOAuthState,
  saveOAuthTokens
} from '@/lib/anafOAuth'

export const ANAF_OAUTH_COOKIE = 'facturo_anaf_oauth'
const SETTINGS_PATH = '/efactura'

export function efacturaSettingsUrl(request: NextRequest, query: Record<string, string> = {}) {
  const url = new URL(SETTINGS_PATH, request.nextUrl.origin)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return url
}

export function oauthCookieOptions(request: NextRequest) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 10 * 60
  }
}

/**
 * POST (authenticated): returns the ANAF authorize URL and sets the nonce cookie.
 * The acting user comes from the session token, never from the URL, so nobody can bind
 * their ANAF certificate to someone else's account by sharing a link.
 */
export async function startAnafOAuth(request: NextRequest) {
  if (!anafOAuthConfigured()) {
    return NextResponse.json({
      error: 'ANAF OAuth nu este configurat. Completează ANAF_OAUTH_CLIENT_ID, SECRET și REDIRECT_URI.'
    }, { status: 503 })
  }
  const userId = await authenticatedUserId(request)
  if (!userId) return unauthorized()
  const body = await request.json().catch(() => ({}))
  const ownerUserId = String(body?.ownerUserId || userId)
  const allowed = await actorCanAccessOwner(supabaseAdmin(), userId, ownerUserId)
  if (!allowed) return NextResponse.json({ error: 'Nu ai acces la acest profil.' }, { status: 403 })
  const { state, nonce } = createOAuthState({ userId, ownerUserId })
  const res = NextResponse.json({ url: authorizeUrl(state) })
  res.cookies.set(ANAF_OAUTH_COOKIE, nonce, oauthCookieOptions(request))
  return res
}

/** Old GET links (with ?userId=) are no longer honoured. */
export function startAnafOAuthLegacy(request: NextRequest) {
  return NextResponse.redirect(efacturaSettingsUrl(request, {
    error: 'Pornește conectarea ANAF din pagina e-Factura a aplicației.'
  }))
}

export async function callbackAnafOAuth(request: NextRequest) {
  const error = request.nextUrl.searchParams.get('error')
  if (error) {
    return NextResponse.redirect(efacturaSettingsUrl(request, {
      error: request.nextUrl.searchParams.get('error_description') || error
    }))
  }
  const code = request.nextUrl.searchParams.get('code') || ''
  const state = request.nextUrl.searchParams.get('state') || ''
  const nonce = request.cookies.get(ANAF_OAUTH_COOKIE)?.value || ''
  const clear = { ...oauthCookieOptions(request), maxAge: 0 }
  try {
    const parsed = readOAuthState(state, nonce)
    const tokens = await exchangeAuthorizationCode(code)
    await saveOAuthTokens(supabaseAdmin(), {
      ownerUserId: parsed.ownerUserId,
      environment: 'test',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      certSerial: tokens.certSerial
    })
    const res = NextResponse.redirect(efacturaSettingsUrl(request, { connected: '1' }))
    res.cookies.set(ANAF_OAUTH_COOKIE, '', clear)
    return res
  } catch (err) {
    const res = NextResponse.redirect(efacturaSettingsUrl(request, {
      error: err instanceof Error ? err.message : 'Conectarea ANAF a eșuat.'
    }))
    res.cookies.set(ANAF_OAUTH_COOKIE, '', clear)
    return res
  }
}

export async function anafOAuthStatus(request: NextRequest) {
  const userId = await authenticatedUserId(request)
  if (!userId) return unauthorized()
  const ownerUserId = request.nextUrl.searchParams.get('ownerUserId') || userId
  const admin = supabaseAdmin()
  const allowed = await actorCanAccessOwner(admin, userId, ownerUserId)
  if (!allowed) return NextResponse.json({ error: 'Nu ai acces.' }, { status: 403 })
  try {
    const row = await loadOAuthTokens(admin, ownerUserId, 'test')
    return NextResponse.json({
      configured: anafOAuthConfigured(),
      ...publicConnection(row)
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Eroare conexiune ANAF'
    if (message.toLowerCase().includes('does not exist') || message.toLowerCase().includes('schema cache')) {
      return NextResponse.json({
        configured: anafOAuthConfigured(),
        connected: false,
        missingTable: true,
        environment: 'test',
        expiresAt: null,
        certSerial: null
      })
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function disconnectAnafOAuth(userId: string, ownerUserId?: string) {
  const owner = ownerUserId || userId
  const admin = supabaseAdmin()
  const allowed = await actorCanAccessOwner(admin, userId, owner)
  if (!allowed) return { error: 'Nu ai acces.', status: 403 as const }
  await deleteOAuthTokens(admin, owner, 'test')
  return { ok: true as const }
}
