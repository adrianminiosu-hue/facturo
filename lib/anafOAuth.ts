import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const ANAF_AUTHORIZE_URL = 'https://logincert.anaf.ro/anaf-oauth2/v1/authorize'
export const ANAF_TOKEN_URL = 'https://logincert.anaf.ro/anaf-oauth2/v1/token'
export const ANAF_CONNECT_ERROR = 'Conectează e-Factura din Setări înainte de trimitere.'

export type AnafEnvironment = 'test' | 'prod'
export type AnafEfacturaMode = 'simulate' | 'test' | 'prod'

export type AnafOAuthRow = {
  id: string
  user_id: string
  company_id?: string | null
  environment: string
  access_token: string
  refresh_token?: string | null
  expires_at?: string | null
  cert_serial?: string | null
}

type QueryClient = { from: (table: string) => any }

export function anafEfacturaMode(): AnafEfacturaMode {
  const mode = String(process.env.ANAF_EFACTURA_MODE || '').trim().toLowerCase()
  if (mode === 'simulate') return 'simulate'
  if (mode === 'test') return 'test'
  if (mode === 'prod') return 'prod'
  return process.env.ANAF_OAUTH_CLIENT_ID ? 'test' : 'simulate'
}

/** Where invoices really go: 'prod' only with ANAF_EFACTURA_MODE=prod, never by default. */
export function anafEfacturaEnvironment(): AnafEnvironment {
  return anafEfacturaMode() === 'prod' ? 'prod' : 'test'
}

export function anafEnvironmentLabel() {
  const mode = anafEfacturaMode()
  return mode === 'prod' ? 'PRODUCȚIE' : mode === 'test' ? 'TEST' : 'SIMULARE'
}

export function anafEfacturaBase() {
  const fallback = anafEfacturaEnvironment() === 'prod'
    ? 'https://api.anaf.ro/prod/FCTEL/rest'
    : 'https://api.anaf.ro/test/FCTEL/rest'
  const base = (process.env.ANAF_EFACTURA_BASE || fallback).replace(/\/$/, '')
  // Guard against a mode/base mismatch (e.g. prod mode still pointing at the test API).
  if (anafEfacturaEnvironment() === 'prod' && base.includes('/test/')) {
    throw new Error('ANAF_EFACTURA_MODE=prod, dar ANAF_EFACTURA_BASE indică mediul de test.')
  }
  return base
}

export function anafOAuthConfig() {
  const clientId = process.env.ANAF_OAUTH_CLIENT_ID || ''
  const clientSecret = process.env.ANAF_OAUTH_CLIENT_SECRET || ''
  const redirectUri = process.env.ANAF_OAUTH_REDIRECT_URI || ''
  return { clientId, clientSecret, redirectUri }
}

export function anafOAuthConfigured() {
  const { clientId, clientSecret, redirectUri } = anafOAuthConfig()
  return Boolean(clientId && clientSecret && redirectUri)
}

function signingKey() {
  return anafOAuthConfig().clientSecret || process.env.SUPABASE_SERVICE_KEY || 'facturo-anaf'
}

export function createOAuthState(input: { userId: string; ownerUserId: string }) {
  const nonce = randomBytes(16).toString('hex')
  const payload = Buffer.from(JSON.stringify({
    userId: input.userId,
    ownerUserId: input.ownerUserId,
    nonce,
    exp: Date.now() + 10 * 60 * 1000
  })).toString('base64url')
  const sig = createHmac('sha256', signingKey()).update(payload).digest('base64url')
  return { state: `${payload}.${sig}`, nonce }
}

export function readOAuthState(state: string, nonce: string) {
  const [payload, sig] = String(state || '').split('.')
  if (!payload || !sig) throw new Error('Starea OAuth este invalidă.')
  const expected = createHmac('sha256', signingKey()).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Starea OAuth este invalidă.')
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
    userId: string
    ownerUserId: string
    nonce: string
    exp: number
  }
  if (!data.userId || !data.ownerUserId || data.exp < Date.now()) {
    throw new Error('Sesiunea OAuth a expirat. Reîncearcă conectarea.')
  }
  if (data.nonce !== nonce) throw new Error('Starea OAuth nu corespunde.')
  return data
}

function decodeJwtPayload(token: string) {
  try {
    const part = token.split('.')[1]
    if (!part) return {}
    return JSON.parse(Buffer.from(part, 'base64url').toString()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function certSerialFromJwt(token: string) {
  const payload = decodeJwtPayload(token)
  const keys = ['serial', 'cert_serial', 'unique_name', 'sub', 'nameid']
  for (const key of keys) {
    const value = payload[key]
    if (value) return String(value)
  }
  return null
}

function expiresAtFromToken(token: string, expiresIn?: number) {
  if (expiresIn && Number.isFinite(expiresIn)) {
    return new Date(Date.now() + Number(expiresIn) * 1000).toISOString()
  }
  const exp = Number(decodeJwtPayload(token).exp)
  if (exp) return new Date(exp * 1000).toISOString()
  return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
}

async function tokenRequest(body: Record<string, string>) {
  const { clientId, clientSecret, redirectUri } = anafOAuthConfig()
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('ANAF OAuth nu este configurat. Completează ANAF_OAUTH_CLIENT_ID, ANAF_OAUTH_CLIENT_SECRET și ANAF_OAUTH_REDIRECT_URI.')
  }
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    token_content_type: 'jwt',
    ...body
  })
  const res = await fetch(ANAF_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = JSON.parse(text) } catch { /* ANAF sometimes returns form/text */ }
  if (!res.ok || json.error) {
    throw new Error(String(json.error_description || json.error || text || 'ANAF a refuzat tokenul OAuth.'))
  }
  const accessToken = String(json.access_token || '')
  if (!accessToken) throw new Error('ANAF nu a returnat access_token.')
  return {
    accessToken,
    refreshToken: json.refresh_token ? String(json.refresh_token) : null,
    expiresAt: expiresAtFromToken(accessToken, Number(json.expires_in)),
    certSerial: certSerialFromJwt(accessToken)
  }
}

export function authorizeUrl(state: string) {
  const { clientId, redirectUri } = anafOAuthConfig()
  const url = new URL(ANAF_AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('token_content_type', 'jwt')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeAuthorizationCode(code: string) {
  return tokenRequest({ grant_type: 'authorization_code', code })
}

async function refreshAccessToken(refreshToken: string) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
}

export async function saveOAuthTokens(
  client: QueryClient,
  input: {
    ownerUserId: string
    environment?: AnafEnvironment
    accessToken: string
    refreshToken?: string | null
    expiresAt?: string | null
    certSerial?: string | null
  }
) {
  const environment = input.environment || 'test'
  const row = {
    user_id: input.ownerUserId,
    company_id: null,
    environment,
    access_token: input.accessToken,
    refresh_token: input.refreshToken || null,
    expires_at: input.expiresAt || null,
    cert_serial: input.certSerial || null,
    updated_at: new Date().toISOString()
  }
  const existing = await client
    .from('anaf_oauth_tokens')
    .select('id')
    .eq('user_id', input.ownerUserId)
    .eq('environment', environment)
    .is('company_id', null)
    .maybeSingle()
  if (existing.data?.id) {
    const { error } = await client.from('anaf_oauth_tokens').update(row).eq('id', existing.data.id)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await client.from('anaf_oauth_tokens').insert(row)
  if (error) throw new Error(error.message)
}

export async function loadOAuthTokens(
  client: QueryClient,
  ownerUserId: string,
  environment: AnafEnvironment = 'test'
): Promise<AnafOAuthRow | null> {
  const { data, error } = await client
    .from('anaf_oauth_tokens')
    .select('*')
    .eq('user_id', ownerUserId)
    .eq('environment', environment)
    .is('company_id', null)
    .maybeSingle()
  if (error && !String(error.message || '').toLowerCase().includes('does not exist')) {
    throw new Error(error.message)
  }
  return data || null
}

export async function deleteOAuthTokens(
  client: QueryClient,
  ownerUserId: string,
  environment: AnafEnvironment = 'test'
) {
  await client
    .from('anaf_oauth_tokens')
    .delete()
    .eq('user_id', ownerUserId)
    .eq('environment', environment)
}

/**
 * The OAuth token is tied to the certificate, not to the API environment: the same token works on
 * /test and /prod. Rows are stored under 'test' for historical reasons; keep reading them from there.
 */
export async function getValidAccessToken(ownerUserId: string, environment: AnafEnvironment = 'test') {
  const client = supabaseAdmin()
  const row = await loadOAuthTokens(client, ownerUserId, environment)
  if (!row?.access_token) return null
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0
  const stillValid = !exp || exp - Date.now() > 60 * 1000
  if (stillValid) return row
  if (!row.refresh_token) return row
  try {
    const refreshed = await refreshAccessToken(row.refresh_token)
    await saveOAuthTokens(client, {
      ownerUserId,
      environment,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || row.refresh_token,
      expiresAt: refreshed.expiresAt,
      certSerial: refreshed.certSerial || row.cert_serial
    })
    return {
      ...row,
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken || row.refresh_token,
      expires_at: refreshed.expiresAt,
      cert_serial: refreshed.certSerial || row.cert_serial
    }
  } catch {
    return row
  }
}

export function publicConnection(row: AnafOAuthRow | null) {
  if (!row) return { connected: false as const, environment: 'test', expiresAt: null as string | null, certSerial: null as string | null }
  return {
    connected: true as const,
    environment: row.environment,
    expiresAt: row.expires_at || null,
    certSerial: row.cert_serial || null
  }
}
