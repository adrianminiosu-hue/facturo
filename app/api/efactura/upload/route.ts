import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateEfacturaXml } from '@/lib/efactura'
import { simulateSpvUpload } from '@/lib/efacturaSpv'
import { loadBuyer } from '@/lib/loadBuyer'
import { loadSeller } from '@/lib/loadSeller'
import { resolveParty } from '@/lib/partySnapshot'
import { isDraftInvoice, alreadySentToSpv, ALREADY_SENT_TO_SPV } from '@/lib/invoiceStatus'
import { persistSpvAccepted } from '@/lib/spvPersist'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const SPV_NOTE = 'Simulare mediu test ANAF. Nu s-a folosit certificat și nu s-a trimis nimic în SPV real.'

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

type UploadOutcome = 'accepted' | 'rejected' | 'skipped' | 'error'

type ProcessedUpload = {
  invoiceId: string
  invoiceRef: string
  outcome: UploadOutcome
  error?: string
  httpStatus?: number
  body?: Record<string, unknown>
}

async function processOne(
  invoiceId: string,
  userId: string,
  options: { skipDrafts: boolean }
): Promise<ProcessedUpload> {
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .single()

  if (!invoice) {
    return {
      invoiceId,
      invoiceRef: invoiceId,
      outcome: 'error',
      error: 'Factura nu a fost găsită',
      httpStatus: 404
    }
  }

  const invoiceRef = `${invoice.series}${invoice.invoice_number}`

  if (options.skipDrafts && isDraftInvoice(invoice.status)) {
    return {
      invoiceId,
      invoiceRef,
      outcome: 'skipped',
      error: 'Ciornă — nu se trimite în e-Factura.'
    }
  }

  if (alreadySentToSpv(invoice)) {
    return {
      invoiceId,
      invoiceRef,
      outcome: 'skipped',
      error: ALREADY_SENT_TO_SPV,
      httpStatus: 400
    }
  }

  const { data: items } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)

  const liveClient = await loadBuyer(supabase, invoice.client_id)
  const liveSeller = await loadSeller(supabase, invoice, userId)
  const client = resolveParty(invoice.buyer_snapshot, liveClient)
  const seller = resolveParty(invoice.seller_snapshot, liveSeller)

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
    invoiceRef,
    xmlError
  })

  const accepted = result.executionStatus === '0'
  let invoicePatch: Record<string, unknown> = {}
  if (accepted) {
    invoicePatch = await persistSpvAccepted(supabase, invoice)
  } else {
    await supabase.from('invoices').update({
      efactura_status: 'rejected',
      efactura_error: result.error || null,
      efactura_uploaded_at: new Date().toISOString()
    }).eq('id', invoiceId)
  }

  const outcome: UploadOutcome = accepted ? 'accepted' : 'rejected'
  return {
    invoiceId,
    invoiceRef,
    outcome,
    error: result.error,
    body: {
      ...result,
      invoiceRef,
      note: SPV_NOTE,
      invoicePatch
    }
  }
}

function asBulkItem(processed: ProcessedUpload) {
  const { body, httpStatus: _httpStatus, ...rest } = processed
  return {
    ...rest,
    ...(body || {})
  }
}

export async function POST(request: NextRequest) {
  try {
    const { invoiceId, invoiceIds, userId } = await request.json()
    const bulkIds = Array.isArray(invoiceIds)
      ? invoiceIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : null

    if (!userId) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    if (bulkIds) {
      if (bulkIds.length === 0) {
        return NextResponse.json({ error: 'Missing params' }, { status: 400 })
      }

      const results = []
      for (const id of bulkIds) {
        try {
          const processed = await processOne(id, userId, { skipDrafts: true })
          results.push(asBulkItem(processed))
        } catch (error) {
          results.push({
            invoiceId: id,
            invoiceRef: id,
            outcome: 'error' as const,
            error: error instanceof Error ? error.message : 'Eroare simulare SPV'
          })
        }
      }

      return NextResponse.json({
        simulated: true,
        note: SPV_NOTE,
        results
      })
    }

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const processed = await processOne(invoiceId, userId, { skipDrafts: false })
    if (processed.outcome === 'skipped' || (processed.outcome === 'error' && !processed.body)) {
      return NextResponse.json(
        { error: processed.error || 'Eroare simulare SPV' },
        { status: processed.httpStatus || 400 }
      )
    }

    return NextResponse.json(processed.body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare simulare SPV'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
