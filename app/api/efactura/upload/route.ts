import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { createClient } from '@supabase/supabase-js'
import { generateEfacturaXml } from '@/lib/efactura'
import { simulateSpvUpload } from '@/lib/efacturaSpv'
import {
  errorTextFromDescarcare,
  isStareNok,
  isStareOk,
  pollStareMesaj,
  uploadEfacturaXml
} from '@/lib/anafEfactura'
import {
  ANAF_CONNECT_ERROR,
  anafEfacturaMode,
  anafOAuthConfigured,
  getValidAccessToken
} from '@/lib/anafOAuth'
import { loadBuyer } from '@/lib/loadBuyer'
import { loadSeller } from '@/lib/loadSeller'
import { resolveParty } from '@/lib/partySnapshot'
import { alreadySentToSpv, isDraftInvoice, isEfacturaProcessing, ALREADY_SENT_TO_SPV } from '@/lib/invoiceStatus'
import { persistEfacturaState, persistSpvAccepted } from '@/lib/spvPersist'
import { getInvoiceForActor } from '@/lib/portfolio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const SIMULATE_NOTE = 'Simulare mediu test ANAF. Nu s-a folosit certificat și nu s-a trimis nimic în SPV real.'
const TEST_NOTE = 'Trimitere e-Factura TEST către ANAF.'

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

type UploadOutcome = 'accepted' | 'rejected' | 'skipped' | 'error' | 'processing'

type ProcessedUpload = {
  invoiceId: string
  invoiceRef: string
  outcome: UploadOutcome
  error?: string
  httpStatus?: number
  body?: Record<string, unknown>
}

function numericCif(cui?: string | null) {
  return (cui || '').replace(/\D/g, '')
}

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
      efactura_environment: 'test'
    })
  } else {
    await persistEfacturaState(supabase, invoice, {
      efactura_status: 'rejected',
      efactura_error: result.error || null,
      efactura_environment: 'test'
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

async function applyStare(input: {
  invoice: { id: string; status?: string | null; notes?: string | null }
  accessToken: string
  indexIncarcare: string
  invoiceRef: string
  extra?: Record<string, unknown>
}): Promise<ProcessedUpload> {
  const stare = await pollStareMesaj({
    accessToken: input.accessToken,
    indexIncarcare: input.indexIncarcare
  })
  if (isStareOk(stare.stare)) {
    const invoicePatch = await persistEfacturaState(supabase, input.invoice, {
      efactura_status: 'accepted',
      efactura_index: input.indexIncarcare,
      efactura_error: null,
      efactura_environment: 'test'
    })
    return {
      invoiceId: input.invoice.id,
      invoiceRef: input.invoiceRef,
      outcome: 'accepted',
      body: {
        simulated: false,
        environment: 'test',
        invoiceRef: input.invoiceRef,
        executionStatus: '0',
        indexIncarcare: input.indexIncarcare,
        stare: stare.stare,
        statusResponseXml: stare.statusResponseXml,
        note: TEST_NOTE,
        invoicePatch,
        ...(input.extra || {})
      }
    }
  }
  if (isStareNok(stare.stare)) {
    const error = await errorTextFromDescarcare(input.accessToken, stare.idDescarcare)
    const invoicePatch = await persistEfacturaState(supabase, input.invoice, {
      efactura_status: 'rejected',
      efactura_index: input.indexIncarcare,
      efactura_error: error,
      efactura_environment: 'test'
    })
    return {
      invoiceId: input.invoice.id,
      invoiceRef: input.invoiceRef,
      outcome: 'rejected',
      error,
      body: {
        simulated: false,
        environment: 'test',
        invoiceRef: input.invoiceRef,
        executionStatus: '1',
        indexIncarcare: input.indexIncarcare,
        stare: stare.stare,
        statusResponseXml: stare.statusResponseXml,
        error,
        note: TEST_NOTE,
        invoicePatch,
        ...(input.extra || {})
      }
    }
  }
  const invoicePatch = await persistEfacturaState(supabase, input.invoice, {
    efactura_status: 'in_processing',
    efactura_index: input.indexIncarcare,
    efactura_error: null,
    efactura_environment: 'test'
  })
  return {
    invoiceId: input.invoice.id,
    invoiceRef: input.invoiceRef,
    outcome: 'processing',
    body: {
      simulated: false,
      environment: 'test',
      invoiceRef: input.invoiceRef,
      executionStatus: '0',
      indexIncarcare: input.indexIncarcare,
      stare: stare.stare || 'in prelucrare',
      statusResponseXml: stare.statusResponseXml,
      note: 'ANAF încă prelucrează factura. Reîncearcă „Actualizează stare ANAF” peste câteva secunde.',
      invoicePatch,
      ...(input.extra || {})
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

  const { data: items } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)

  const liveClient = await loadBuyer(supabase, invoice.client_id)
  const liveSeller = await loadSeller(supabase, invoice, invoice.user_id)
  const client = resolveParty(invoice.buyer_snapshot, liveClient)
  const seller = resolveParty(invoice.seller_snapshot, liveSeller)

  let xml = ''
  let xmlError: string | undefined
  try {
    xml = generateEfacturaXml({
      invoice,
      seller,
      buyer: client,
      items: items || []
    })
  } catch (error) {
    xmlError = error instanceof Error ? error.message : 'XML invalid'
  }

  const mode = anafEfacturaMode()
  if (mode === 'simulate') {
    await delay(400)
    return processSimulate({ ...invoice, _sellerCui: seller?.cui }, invoiceRef, xmlError)
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
    return applyStare({
      invoice,
      accessToken: tokens.access_token,
      indexIncarcare: String(invoice.efactura_index),
      invoiceRef
    })
  }

  if (xmlError) {
    const invoicePatch = await persistEfacturaState(supabase, invoice, {
      efactura_status: 'rejected',
      efactura_error: xmlError,
      efactura_environment: 'test'
    })
    return {
      invoiceId,
      invoiceRef,
      outcome: 'rejected',
      error: xmlError,
      body: {
        simulated: false,
        environment: 'test',
        invoiceRef,
        executionStatus: '1',
        error: xmlError,
        note: TEST_NOTE,
        invoicePatch
      }
    }
  }

  const uploaded = await uploadEfacturaXml({
    accessToken: tokens.access_token,
    cif: numericCif(seller?.cui),
    xml,
    invoiceTypeCode: invoice.invoice_type_code
  })

  if (uploaded.executionStatus !== '0' || !uploaded.indexIncarcare) {
    const error = uploaded.error || 'ANAF a refuzat încărcarea.'
    const invoicePatch = await persistEfacturaState(supabase, invoice, {
      efactura_status: 'rejected',
      efactura_error: error,
      efactura_environment: 'test'
    })
    return {
      invoiceId,
      invoiceRef,
      outcome: 'rejected',
      error,
      body: {
        simulated: false,
        environment: 'test',
        invoiceRef,
        executionStatus: '1',
        error,
        uploadResponseXml: uploaded.uploadResponseXml,
        note: TEST_NOTE,
        invoicePatch
      }
    }
  }

  await persistEfacturaState(supabase, invoice, {
    efactura_status: 'uploaded',
    efactura_index: uploaded.indexIncarcare,
    efactura_error: null,
    efactura_environment: 'test'
  })

  return applyStare({
    invoice,
    accessToken: tokens.access_token,
    indexIncarcare: uploaded.indexIncarcare,
    invoiceRef,
    extra: { uploadResponseXml: uploaded.uploadResponseXml }
  })
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
        note: anafEfacturaMode() === 'simulate' ? SIMULATE_NOTE : TEST_NOTE,
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

    return NextResponse.json(processed.body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare e-Factura'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
