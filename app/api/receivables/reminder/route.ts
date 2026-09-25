import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendInvoiceReminder } from '@/lib/dueReminders'
import { getInvoiceForActor } from '@/lib/portfolio'
import { authenticatedUserId } from '@/lib/serverAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // The acting user comes from the session token, never from the request body.
    const userId = await authenticatedUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Autentificare necesară.' }, { status: 401 })
    }
    const { invoiceId } = await request.json()
    if (!invoiceId) {
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
