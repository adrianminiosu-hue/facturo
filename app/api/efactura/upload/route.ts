import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateEfacturaXml } from '@/lib/efactura'
import { simulateSpvUpload } from '@/lib/efacturaSpv'
import { loadSeller } from '@/lib/loadSeller'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(request: NextRequest) {
  try {
    const { invoiceId, userId } = await request.json()
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

    await delay(700)

    let xmlError: string | undefined
    try {
      generateEfacturaXml({
        invoice,
        seller,
        buyer: client,
        items: items || []
      })
    } catch (error) {
      xmlError = error instanceof Error ? error.message : 'XML invalid'
    }

    const result = simulateSpvUpload({
      sellerCui: seller?.cui,
      invoiceRef: `${invoice.series}${invoice.invoice_number}`,
      xmlError
    })

    await supabase.from('invoices').update({
      efactura_status: result.executionStatus === '0' ? 'accepted' : 'rejected',
      efactura_index: result.indexIncarcare || null,
      efactura_error: result.error || null,
      efactura_environment: 'test-sim',
      efactura_uploaded_at: new Date().toISOString()
    }).eq('id', invoiceId)
    // Ignore schema errors if the extra columns are not migrated yet.

    return NextResponse.json({
      ...result,
      invoiceRef: `${invoice.series}${invoice.invoice_number}`,
      note: 'Simulare mediu test ANAF. Nu s-a folosit certificat și nu s-a trimis nimic în SPV real.'
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare simulare SPV'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
