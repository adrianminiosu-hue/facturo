import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { getInvoiceForActor } from '@/lib/portfolio'
import { buildInvoiceXml } from '@/lib/efacturaXmlBuild'
import { readableValidationErrors, validateEfacturaXml } from '@/lib/anafValidate'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/** GET ?id=<invoice> → runs the invoice XML through ANAF's public validator (no certificate, nothing is sent to SPV). */
export async function GET(request: NextRequest) {
  const userId = await authenticatedUserId(request)
  if (!userId) return unauthorized()
  const invoiceId = request.nextUrl.searchParams.get('id')
  if (!invoiceId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const invoice = await getInvoiceForActor(supabase, invoiceId, userId)
  if (!invoice) return NextResponse.json({ error: 'Factura nu a fost găsită' }, { status: 404 })
  try {
    const { xml } = await buildInvoiceXml(supabase, invoice)
    const result = await validateEfacturaXml(xml, invoice.invoice_type_code)
    return NextResponse.json({
      invoiceRef: `${invoice.series}${invoice.invoice_number}`,
      ok: result.ok,
      errors: readableValidationErrors(result.messages),
      messages: result.messages,
      traceId: result.traceId
    })
  } catch (e) {
    // Missing data is reported by the XML builder before ANAF is called.
    return NextResponse.json({ invoiceRef: `${invoice.series}${invoice.invoice_number}`, ok: false, errors: [e instanceof Error ? e.message : 'Validarea a eșuat'] })
  }
}

/** POST raw XML (text body, ?standard=FACT1|FCN) → ANAF public validator. For checking a file before sending it. */
export async function POST(request: NextRequest) {
  const userId = await authenticatedUserId(request)
  if (!userId) return unauthorized()
  const xml = await request.text()
  if (!xml.trim().startsWith('<')) return NextResponse.json({ error: 'Trimite conținutul XML.' }, { status: 400 })
  if (xml.length > 5_000_000) return NextResponse.json({ error: 'Fișier prea mare.' }, { status: 413 })
  try {
    const typeCode = request.nextUrl.searchParams.get('standard') === 'FCN' ? '381' : '380'
    const result = await validateEfacturaXml(xml, typeCode)
    return NextResponse.json({ ok: result.ok, messages: result.messages, traceId: result.traceId })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Validarea a eșuat' }, { status: 502 })
  }
}
