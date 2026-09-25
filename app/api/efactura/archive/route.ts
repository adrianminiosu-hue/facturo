import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { getInvoiceForActor } from '@/lib/portfolio'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ARCHIVE_BUCKET } from '@/lib/spvPurchaseImport'

export const runtime = 'nodejs'

/** GET ?id=<invoice> → ANAF's original ZIP (invoice XML + ANAF signature), as downloaded from SPV. */
export async function GET(request: NextRequest) {
  const userId = await authenticatedUserId(request)
  if (!userId) return unauthorized()
  const invoiceId = request.nextUrl.searchParams.get('id')
  if (!invoiceId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const admin = supabaseAdmin()
  const invoice = await getInvoiceForActor(admin, invoiceId, userId)
  if (!invoice) return NextResponse.json({ error: 'Factura nu a fost găsită' }, { status: 404 })
  if (!invoice.efactura_zip_path) return NextResponse.json({ error: 'Nu există arhivă ANAF pentru această factură.' }, { status: 404 })
  const { data, error } = await admin.storage.from(ARCHIVE_BUCKET).download(invoice.efactura_zip_path)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Arhiva nu a putut fi citită.' }, { status: 500 })
  const name = `e-Factura-${invoice.series || ''}${invoice.invoice_number || ''}-${invoice.buyer_reference || 'ANAF'}.zip`.replace(/[^\w.\-]+/g, '_')
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${name}"`
    }
  })
}
