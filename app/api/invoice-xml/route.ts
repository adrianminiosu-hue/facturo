import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateEfacturaXml } from '@/lib/efactura'
import { loadSeller } from '@/lib/loadSeller'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('id')
    const userId = searchParams.get('userId')

    if (!invoiceId || !userId) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', userId)
      .single()

    if (!invoice) {
      return NextResponse.json({ error: 'Factura nu a fost găsită' }, { status: 404 })
    }

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId)

    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', invoice.client_id)
      .single()

    const seller = await loadSeller(supabase, invoice, userId)

    let billing_reference: string | null = null
    let billing_reference_date: string | null = null
    if (invoice.credited_invoice_id) {
      const { data: original } = await supabase
        .from('invoices')
        .select('series, invoice_number, issue_date')
        .eq('id', invoice.credited_invoice_id)
        .eq('user_id', userId)
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
