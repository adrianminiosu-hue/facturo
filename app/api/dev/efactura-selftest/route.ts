import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { generateEfacturaXml, missingEfacturaFields } from '@/lib/efactura'
import { validateEfacturaXml } from '@/lib/anafValidate'
import { EFACTURA_SAMPLES } from '@/lib/efacturaSamples'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Development only: generates every sample invoice shape and runs it through ANAF's public validator
 * (nothing is sent to SPV). A regression check for the e-Factura XML.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const userId = await authenticatedUserId(request)
  if (!userId) return unauthorized()
  const only = request.nextUrl.searchParams.get('only')
  const withXml = request.nextUrl.searchParams.get('xml') === '1'
  const results = []
  for (const sample of EFACTURA_SAMPLES.filter(s => !only || s.key === only)) {
    const input = { invoice: sample.invoice, seller: sample.seller, buyer: sample.buyer, items: sample.items }
    const precheck = missingEfacturaFields(input)
    let xml = ''
    try {
      xml = generateEfacturaXml(input)
    } catch (e) {
      results.push({ key: sample.key, label: sample.label, ok: false, stage: 'precheck', errors: precheck.length ? precheck : [String(e)] })
      continue
    }
    try {
      const v = await validateEfacturaXml(xml, sample.invoice.invoice_type_code)
      const codes = v.messages.flatMap(m => m.split(' || ')).map(part => {
        const code = part.match(/codEroare=([^;]+)/)?.[1]
        const text = part.match(/textEroare=\[[^\]]+\]-([^#;]+)/)?.[1] || part.match(/textEroare=([^;]+)/)?.[1] || part
        return code ? `${code}: ${text.trim().slice(0, 220)}` : part.slice(0, 300)
      })
      results.push({ key: sample.key, label: sample.label, ok: v.ok, stage: 'anaf', errors: v.ok ? [] : codes, ...(withXml ? { xml } : {}) })
    } catch (e) {
      results.push({ key: sample.key, label: sample.label, ok: false, stage: 'anaf-unreachable', errors: [e instanceof Error ? e.message : String(e)] })
    }
  }
  return NextResponse.json({ passed: results.filter(r => r.ok).length, total: results.length, results })
}
