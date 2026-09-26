/** ANAF public e-Factura XML validator: no certificate needed. FACT1 = invoice, FCN = credit note. */
export const ANAF_VALIDATE_URL = 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare'

export type AnafValidation = {
  ok: boolean
  messages: string[]
  traceId?: string
  raw?: unknown
}

export function validationStandard(invoiceTypeCode?: string | null) {
  return invoiceTypeCode === '381' ? 'FCN' : 'FACT1'
}

export function parseValidationResponse(body: unknown): AnafValidation {
  const data = (body || {}) as { stare?: string; trace_id?: string; Messages?: Array<{ message?: string }> }
  const messages = (data.Messages || []).map(m => String(m?.message || '').trim()).filter(Boolean)
  return { ok: String(data.stare || '').toLowerCase() === 'ok', messages, traceId: data.trace_id, raw: body }
}

export async function validateEfacturaXml(xml: string, invoiceTypeCode?: string | null): Promise<AnafValidation> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(`${ANAF_VALIDATE_URL}/${validationStandard(invoiceTypeCode)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: xml,
      signal: controller.signal,
      cache: 'no-store'
    })
    const text = await res.text()
    let body: unknown
    try { body = JSON.parse(text) } catch { throw new Error(`Validatorul ANAF a răspuns ${res.status}: ${text.slice(0, 200)}`) }
    return parseValidationResponse(body)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * ANAF's messages are long technical strings ("tipAssert=...; codEroare=BR-RO-110; ... textEroare=[BR-RO-110]-Daca ... #If ...").
 * Keeps the rule code and the Romanian explanation only.
 */
export function readableValidationErrors(messages: string[]) {
  const out: string[] = []
  for (const message of messages) {
    for (const part of message.split(' || ')) {
      const code = part.match(/codEroare=([^;]+)/)?.[1]?.trim()
      const raw = part.match(/textEroare=([^;]+)/)?.[1] || part
      const text = raw.replace(/^\[[^\]]+\]\s*-?\s*/, '').split('#')[0].replace(/\s+/g, ' ').trim()
      if (code === 'ERRIdentif') out.push(`CUI: ${text}`)
      else if (/SAXParseException|cvc-/.test(part)) out.push('Structura XML nu respectă schema UBL (eroare tehnică Facturo, nu de date).')
      else out.push(code ? `${code}: ${text}` : text)
    }
  }
  return [...new Set(out)].filter(Boolean)
}
