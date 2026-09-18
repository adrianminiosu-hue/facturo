import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendInvoiceReminder } from '@/lib/dueReminders'
import { getInvoiceForActor } from '@/lib/portfolio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { invoiceId, userId } = await request.json()
    if (!invoiceId || !userId) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const invoice = await getInvoiceForActor(supabase, invoiceId, userId)

    if (!invoice) {
      return NextResponse.json({ error: 'Factura nu a fost găsită' }, { status: 404 })
    }

    if (invoice.status === 'paid' || invoice.status === 'draft') {
      return NextResponse.json({ error: 'Reminderul se trimite doar pentru facturi emise, neîncasate.' }, { status: 400 })
    }

    const result = await sendInvoiceReminder(invoice)
    if (result.status === 'failed') {
      return NextResponse.json({ error: result.reason }, { status: 500 })
    }
    if (result.status === 'skipped') {
      return NextResponse.json({ error: result.reason }, { status: 400 })
    }
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare reminder'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
