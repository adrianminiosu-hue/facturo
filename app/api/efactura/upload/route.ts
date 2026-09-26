import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { createClient } from '@supabase/supabase-js'
import { simulateSpvUpload } from '@/lib/efacturaSpv'
import {
  ANAF_CONNECT_ERROR,
  anafEfacturaEnvironment,
  anafEfacturaMode,
  anafOAuthConfigured,
  getValidAccessToken
} from '@/lib/anafOAuth'
import { alreadySentToSpv, isDraftInvoice, isEfacturaProcessing, ALREADY_SENT_TO_SPV } from '@/lib/invoiceStatus'
import { persistEfacturaState, persistSpvAccepted } from '@/lib/spvPersist'
import { getInvoiceForActor } from '@/lib/portfolio'
import { buildInvoiceXml } from '@/lib/efacturaXmlBuild'
import { checkAnafStatus, sendInvoice, sentNote, type SendResult } from '@/lib/efacturaSend'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const SIMULATE_NOTE = 'Simulare mediu test ANAF. Nu s-a folosit certificat și nu s-a trimis nimic în SPV real.'

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

type ProcessedUpload = SendResult

async function processSimulate(
  invoice: { id: string; status?: string | null; notes?: string | null; _sellerCui?: string | null },
  invoiceRef: string,
  xmlError?: string
): Promise<ProcessedUpload> {
  const result = simulateSpvUpload({
    sellerCui: invoice._sellerCui,
    invoiceRef,
    xmlError
  })
  const accepted = result.executionStatus === '0'
  let invoicePatch: Record<string, unknown> = {}
  if (accepted) {
    invoicePatch = await persistSpvAccepted(supabase, invoice, {
      efactura_index: result.indexIncarcare,
      efactura_environment: anafEfacturaEnvironment()
    })
  } else {
    await persistEfacturaState(supabase, invoice, {
      efactura_status: 'rejected',
      efactura_error: result.error || null,
      efactura_environment: anafEfacturaEnvironment()
    })
  }
  return {
    invoiceId: invoice.id,
    invoiceRef,
    outcome: accepted ? 'accepted' : 'rejected',
    error: result.error,
    body: {
      ...result,
      simulated: true,
      invoiceRef,
      note: SIMULATE_NOTE,
      invoicePatch
    }
  }
}

async function processOne(
  invoiceId: string,
  userId: string,
  options: { skipDrafts: boolean }
): Promise<ProcessedUpload> {
  const invoice = await getInvoiceForActor(supabase, invoiceId, userId)

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

  const processing = isEfacturaProcessing(invoice)
  if (alreadySentToSpv(invoice) && !processing) {
    return {
      invoiceId,
      invoiceRef,
      outcome: 'skipped',
      error: ALREADY_SENT_TO_SPV,
      httpStatus: 400
    }
  }

  const mode = anafEfacturaMode()
  if (mode === 'simulate') {
    let xmlError: string | undefined
    let sellerCui: string | null | undefined
    try {
      const built = await buildInvoiceXml(supabase, invoice)
      sellerCui = built.seller?.cui
    } catch (error) {
      xmlError = error instanceof Error ? error.message : 'XML invalid'
    }
    await delay(400)
    return processSimulate({ ...invoice, _sellerCui: sellerCui }, invoiceRef, xmlError)
  }

  if (!anafOAuthConfigured()) {
    return {
      invoiceId,
      invoiceRef,
      outcome: 'error',
      error: 'ANAF OAuth nu este configurat. Completează ANAF_OAUTH_CLIENT_ID, SECRET și REDIRECT_URI.',
      httpStatus: 400
    }
  }

  const tokens = await getValidAccessToken(invoice.user_id, 'test')
  if (!tokens?.access_token) {
    return {
      invoiceId,
      invoiceRef,
      outcome: 'error',
      error: ANAF_CONNECT_ERROR,
      httpStatus: 401,
      body: { code: 'ANAF_CONNECT', error: ANAF_CONNECT_ERROR, invoiceRef }
    }
  }

  if (processing && invoice.efactura_index) {
    return checkAnafStatus(supabase, {
      invoice,
      accessToken: tokens.access_token,
      indexIncarcare: String(invoice.efactura_index),
      trigger: 'user'
    })
  }

  return sendInvoice(supabase, { invoice, accessToken: tokens.access_token, trigger: 'user' })
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
    const userId = await authenticatedUserId(request)
    if (!userId) return unauthorized()
    const { invoiceId, invoiceIds } = await request.json()
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
            error: error instanceof Error ? error.message : 'Eroare e-Factura'
          })
        }
        await delay(400)
      }

      return NextResponse.json({
        simulated: anafEfacturaMode() === 'simulate',
        note: anafEfacturaMode() === 'simulate' ? SIMULATE_NOTE : sentNote(),
        results
      })
    }

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const processed = await processOne(invoiceId, userId, { skipDrafts: false })
    if (processed.outcome === 'skipped') {
      return NextResponse.json(
        { error: processed.error || 'Eroare e-Factura' },
        { status: processed.httpStatus || 400 }
      )
    }
    if (processed.outcome === 'error') {
      return NextResponse.json(
        { error: processed.error || 'Eroare e-Factura', ...(processed.body || {}) },
        { status: processed.httpStatus || 400 }
      )
    }

    return NextResponse.json(processed.body, { status: processed.outcome === 'queued' ? 202 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare e-Factura'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
