import { anafEfacturaBase, anafEnvironmentLabel } from '@/lib/anafOAuth'
import { isCreditNote } from '@/lib/invoiceStatus'
import { isZip, readZip } from '@/lib/zipRead'

export type AnafUploadResult = {
  executionStatus: '0' | '1'
  indexIncarcare?: string
  error?: string
  uploadResponseXml: string
}

export type AnafStareResult = {
  stare?: string
  idDescarcare?: string
  error?: string
  statusResponseXml: string
}

/**
 * ANAF answers with a single <header .../> whose data sits in ATTRIBUTES, e.g.
 *   <header xmlns="mfp:anaf:dgti:spv:respUploadFisier:v1" dateResponse="202609251140" ExecutionStatus="0" index_incarcare="5001234567"/>
 *   <header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1" stare="ok" id_descarcare="3001234567"/>
 * Errors come as child elements: <Errors errorMessage="..."/>.
 * Child elements with the same names are accepted too, as a fallback.
 */
export function xmlValue(xml: string, name: string) {
  const attr = xml.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i')) || xml.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i'))
  if (attr) return attr[1].trim()
  const element = xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]*)</(?:\\w+:)?${name}>`, 'i'))
  return element?.[1]?.trim() || ''
}

export function xmlErrorMessages(xml: string) {
  return [...xml.matchAll(/errorMessage\s*=\s*"([^"]*)"/gi), ...xml.matchAll(/errorMessage\s*=\s*'([^']*)'/gi)]
    .map(m => decodeXmlEntities(m[1].trim()))
    .filter(Boolean)
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function parseUploadResponse(xml: string): AnafUploadResult {
  const status = xmlValue(xml, 'ExecutionStatus')
  const errors = xmlErrorMessages(xml)
  const indexIncarcare = xmlValue(xml, 'index_incarcare') || undefined
  // Only an explicit ExecutionStatus="0" with an upload index counts as accepted for processing.
  const accepted = status === '0' && !!indexIncarcare
  return {
    executionStatus: accepted ? '0' : '1',
    indexIncarcare,
    error: errors.join(' | ') || (accepted ? undefined : 'ANAF nu a confirmat încărcarea.'),
    uploadResponseXml: xml
  }
}

export function parseStareResponse(xml: string): AnafStareResult {
  const errors = xmlErrorMessages(xml)
  return {
    stare: xmlValue(xml, 'stare') || undefined,
    idDescarcare: xmlValue(xml, 'id_descarcare') || undefined,
    error: errors.join(' | ') || undefined,
    statusResponseXml: xml
  }
}

export function uploadStandard(invoiceTypeCode?: string | null) {
  return isCreditNote(invoiceTypeCode) ? 'CN' : 'UBL'
}

function tokenError() {
  return `Tokenul ANAF a expirat sau nu este valid. Reconectează e-Factura (${anafEnvironmentLabel()}) din Setări.`
}

/**
 * ANAF did not answer (network error, timeout, 5xx, 429): the request may be repeated later.
 * Distinct from a rejection, which is final until the invoice is corrected.
 */
export class AnafUnavailableError extends Error {
  readonly kind: 'network' | 'timeout' | 'server'
  readonly status?: number
  constructor(kind: 'network' | 'timeout' | 'server', message: string, status?: number) {
    super(message)
    this.name = 'AnafUnavailableError'
    this.kind = kind
    this.status = status
  }
}

export function isAnafUnavailable(error: unknown): error is AnafUnavailableError {
  return error instanceof AnafUnavailableError || (error instanceof Error && error.name === 'AnafUnavailableError')
}

export const ANAF_TIMEOUT_MS = 30_000

export async function anafFetch(path: string, accessToken: string, init?: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = ANAF_TIMEOUT_MS, ...rest } = init || {}
  let res: Response
  try {
    res = await fetch(`${anafEfacturaBase()}${path}`, {
      ...rest,
      cache: 'no-store',
      signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(rest.headers || {})
      }
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new AnafUnavailableError('timeout', `ANAF nu a răspuns în ${Math.round(timeoutMs / 1000)} secunde.`)
    }
    throw new AnafUnavailableError('network', `ANAF nu poate fi contactat (${error instanceof Error ? error.message : 'eroare de rețea'}).`)
  }
  if (res.status === 401 || res.status === 403) throw new Error(tokenError())
  if (res.status >= 500 || res.status === 429) {
    throw new AnafUnavailableError('server', `ANAF este indisponibil momentan (HTTP ${res.status}).`, res.status)
  }
  return res
}

export async function uploadEfacturaXml(input: {
  accessToken: string
  cif: string
  xml: string
  invoiceTypeCode?: string | null
  /** Buyer outside Romania (no Romanian CUI): ANAF requires extern=DA. */
  foreignBuyer?: boolean
}): Promise<AnafUploadResult> {
  const cif = (input.cif || '').replace(/\D/g, '')
  if (!cif) throw new Error('CUI-ul emitentului lipsește.')
  const params = new URLSearchParams({ standard: uploadStandard(input.invoiceTypeCode), cif })
  if (input.foreignBuyer) params.set('extern', 'DA')
  const res = await anafFetch(`/upload?${params.toString()}`, input.accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: input.xml
  })
  const text = await res.text()
  if (!text.trim()) throw new AnafUnavailableError('server', `ANAF nu a returnat un răspuns la încărcare (HTTP ${res.status}).`, res.status)
  return parseUploadResponse(text)
}

export async function stareMesaj(accessToken: string, indexIncarcare: string): Promise<AnafStareResult> {
  const res = await anafFetch(`/stareMesaj?id_incarcare=${encodeURIComponent(indexIncarcare)}`, accessToken)
  const text = await res.text()
  if (!text.trim()) throw new AnafUnavailableError('server', `ANAF nu a returnat starea facturii (HTTP ${res.status}).`, res.status)
  return parseStareResponse(text)
}

/** /descarcare returns a ZIP: the invoice XML + ANAF signature, or the error XML. JSON on failure. */
export async function descarcareMesaj(accessToken: string, idDescarcare: string) {
  const res = await anafFetch(`/descarcare?id=${encodeURIComponent(idDescarcare)}`, accessToken)
  const buf = Buffer.from(await res.arrayBuffer())
  if (isZip(buf)) return { zip: buf, entries: readZip(buf) }
  const text = buf.toString('utf8')
  let message = text.slice(0, 300)
  try {
    const json = JSON.parse(text) as { eroare?: string; titlu?: string }
    message = json.eroare || json.titlu || message
  } catch { /* plain text */ }
  throw new Error(`ANAF nu a returnat arhiva: ${message}`)
}

function stareNorm(stare?: string) {
  return (stare || '').trim().toLowerCase()
}

export function isStareOk(stare?: string) {
  return stareNorm(stare) === 'ok'
}

/** "nok" = rejected after validation; "XML cu erori nepreluat de sistem" = rejected before processing. */
export function isStareNok(stare?: string) {
  const value = stareNorm(stare)
  return value === 'nok' || value.startsWith('xml cu erori')
}

export function isStareProcessing(stare?: string) {
  const value = stareNorm(stare)
  return !value || value.includes('prelucrare')
}

export async function pollStareMesaj(input: {
  accessToken: string
  indexIncarcare: string
  attempts?: number
  delayMs?: number
}) {
  const attempts = input.attempts ?? 5
  const delayMs = input.delayMs ?? 2000
  let last: AnafStareResult = { statusResponseXml: '' }
  for (let i = 0; i < attempts; i++) {
    last = await stareMesaj(input.accessToken, input.indexIncarcare)
    if (isStareOk(last.stare) || isStareNok(last.stare)) return last
    if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return last
}

/** Reads ANAF's rejection reasons from the error archive (<Error errorMessage="..."/> entries). */
export async function errorTextFromDescarcare(accessToken: string, idDescarcare?: string, fallback?: string) {
  const generic = 'ANAF a respins factura. Detaliile sunt în SPV la indexul de încărcare salvat.'
  if (!idDescarcare) return fallback || generic
  try {
    const { entries } = await descarcareMesaj(accessToken, idDescarcare)
    const messages = entries
      .filter(e => e.name.toLowerCase().endsWith('.xml') && !e.name.toLowerCase().startsWith('semnatura'))
      .flatMap(e => xmlErrorMessages(e.data.toString('utf8')))
    return messages.length ? messages.join(' | ').slice(0, 2000) : (fallback || generic)
  } catch (e) {
    return fallback || (e instanceof Error ? e.message : generic)
  }
}
