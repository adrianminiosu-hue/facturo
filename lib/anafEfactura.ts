import { anafEfacturaBase } from '@/lib/anafOAuth'
import { isCreditNote } from '@/lib/invoiceStatus'

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

function xmlTag(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`, 'i'))
  return match?.[1]?.trim() || ''
}

function xmlAttrMessage(xml: string) {
  const match = xml.match(/errorMessage="([^"]*)"/i) || xml.match(/errorMessage='([^']*)'/i)
  return match?.[1]?.trim() || ''
}

export function parseUploadResponse(xml: string): AnafUploadResult {
  const status = xmlTag(xml, 'ExecutionStatus') === '1' ? '1' : '0'
  const error = xmlAttrMessage(xml) || (status === '1' ? xmlTag(xml, 'Errors') : '')
  return {
    executionStatus: status,
    indexIncarcare: xmlTag(xml, 'index_incarcare') || undefined,
    error: error || undefined,
    uploadResponseXml: xml
  }
}

export function parseStareResponse(xml: string): AnafStareResult {
  const stare = xmlTag(xml, 'stare') || xmlTag(xml, 'Stare')
  return {
    stare: stare || undefined,
    idDescarcare: xmlTag(xml, 'id_descarcare') || undefined,
    error: xmlAttrMessage(xml) || undefined,
    statusResponseXml: xml
  }
}

export function uploadStandard(invoiceTypeCode?: string | null) {
  return isCreditNote(invoiceTypeCode) ? 'CN' : 'UBL'
}

async function anafFetch(path: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(`${anafEfacturaBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {})
    }
  })
  const text = await res.text()
  if (res.status === 401) {
    throw new Error('Tokenul ANAF a expirat sau nu este valid. Reconectează e-Factura TEST din Setări.')
  }
  return { ok: res.ok, status: res.status, text }
}

export async function uploadEfacturaXml(input: {
  accessToken: string
  cif: string
  xml: string
  invoiceTypeCode?: string | null
}): Promise<AnafUploadResult> {
  const cif = (input.cif || '').replace(/\D/g, '')
  if (!cif) throw new Error('CUI-ul emitentului lipsește.')
  const standard = uploadStandard(input.invoiceTypeCode)
  const { text } = await anafFetch(
    `/upload?standard=${encodeURIComponent(standard)}&cif=${encodeURIComponent(cif)}`,
    input.accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: input.xml
    }
  )
  if (!text.trim()) throw new Error('ANAF nu a returnat un răspuns la încărcare.')
  return parseUploadResponse(text)
}

export async function stareMesajFactura(accessToken: string, indexIncarcare: string): Promise<AnafStareResult> {
  const { text } = await anafFetch(
    `/stareMesajFactura?id_incarcare=${encodeURIComponent(indexIncarcare)}`,
    accessToken
  )
  return parseStareResponse(text)
}

export async function descarcareMesaj(accessToken: string, idDescarcare: string) {
  const { text } = await anafFetch(
    `/descarcare?id=${encodeURIComponent(idDescarcare)}`,
    accessToken
  )
  return text
}

function stareNorm(stare?: string) {
  return (stare || '').trim().toLowerCase()
}

export function isStareOk(stare?: string) {
  const value = stareNorm(stare)
  return value === 'ok'
}

export function isStareNok(stare?: string) {
  const value = stareNorm(stare)
  return value === 'nok' || value === 'nok nok' || value.includes('nok')
}

export function isStareProcessing(stare?: string) {
  const value = stareNorm(stare)
  return !value || value.includes('prelucrare') || value === 'in prelucrare'
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
    last = await stareMesajFactura(input.accessToken, input.indexIncarcare)
    if (isStareOk(last.stare) || isStareNok(last.stare)) return last
    if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return last
}

export async function errorTextFromDescarcare(accessToken: string, idDescarcare?: string) {
  if (!idDescarcare) return 'ANAF a respins factura. Verifică mesajul în SPV Test.'
  try {
    const payload = await descarcareMesaj(accessToken, idDescarcare)
    const message = xmlAttrMessage(payload) || xmlTag(payload, 'Error') || xmlTag(payload, 'message')
    if (message) return message
    if (payload.includes('PK') || payload.includes('PK\u0003\u0004')) {
      return 'ANAF a respins factura. Descarcă detaliile din SPV Test (index încărcare salvat).'
    }
    const trimmed = payload.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return trimmed.slice(0, 500) || 'ANAF a respins factura. Verifică mesajul în SPV Test.'
  } catch {
    return 'ANAF a respins factura. Verifică mesajul în SPV Test.'
  }
}
