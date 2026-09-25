import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { createClient } from '@supabase/supabase-js'
import { generateEfacturaXml } from '@/lib/efactura'
import { loadBuyer } from '@/lib/loadBuyer'
import { loadSeller } from '@/lib/loadSeller'
import { resolveParty } from '@/lib/partySnapshot'
import { getInvoiceForActor } from '@/lib/portfolio'

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

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId)

    const liveClient = await loadBuyer(supabase, invoice.client_id)
    if (!liveClient && !invoice.buyer_snapshot) {
      return NextResponse.json({ error: 'Clientul nu a fost găsit' }, { status: 404 })
    }

    const liveSeller = await loadSeller(supabase, invoice, invoice.user_id)
    const seller = resolveParty(invoice.seller_snapshot, liveSeller)
    const client = resolveParty(invoice.buyer_snapshot, liveClient)

    let billing_reference: string | null = null
    let billing_reference_date: string | null = null
    if (invoice.credited_invoice_id) {
      const { data: original } = await supabase
        .from('invoices')
        .select('series, invoice_number, issue_date')
        .eq('id', invoice.credited_invoice_id)
        .single()
      if (original) {
        billing_reference = `${original.series}${original.invoice_number}`
        billing_reference_date = original.issue_date
      }
    }

    const xml = generateEfacturaXml({
      invoice: { ...invoice, billing_reference, billing_reference_date },
      seller,
      buyer: client,
      items: items || []
    })

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
