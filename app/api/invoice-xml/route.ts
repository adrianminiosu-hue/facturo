import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { createClient } from '@supabase/supabase-js'
import { getInvoiceForActor } from '@/lib/portfolio'
import { buildInvoiceXml } from '@/lib/efacturaXmlBuild'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('id')
    const userId = await authenticatedUserId(request)
    if (!userId) return unauthorized()

    if (!invoiceId || !userId) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const invoice = await getInvoiceForActor(supabase, invoiceId, userId)

    if (!invoice) {
      return NextResponse.json({ error: 'Factura nu a fost găsită' }, { status: 404 })
    }

    const { xml } = await buildInvoiceXml(supabase, invoice)

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="e-Factura-${invoice.series}${invoice.invoice_number}.xml"`
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare generare XML'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
