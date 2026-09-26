import {
  descarcareMesaj,
  errorTextFromDescarcare,
  isAnafUnavailable,
  isStareNok,
  isStareOk,
  pollStareMesaj,
  stareMesaj,
  uploadEfacturaXml,
  type AnafStareResult
} from '@/lib/anafEfactura'
import { anafEfacturaEnvironment, anafEnvironmentLabel } from '@/lib/anafOAuth'
import { readableValidationErrors, validateEfacturaXml } from '@/lib/anafValidate'
import { buildInvoiceXml } from '@/lib/efacturaXmlBuild'
import { logEfactura, type EfacturaLogInput } from '@/lib/efacturaLog'
import { clearQueue, persistQueued } from '@/lib/efacturaQueue'
import { persistEfacturaState } from '@/lib/spvPersist'
import { listSpvMessages } from '@/lib/spvPurchaseImport'
import { parseUblInvoice } from '@/lib/ublInvoice'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SendableInvoice = Record<string, any> & { id: string; user_id: string }

export type SendOutcome = 'accepted' | 'rejected' | 'skipped' | 'error' | 'processing' | 'queued'

export type SendResult = {
  invoiceId: string
  invoiceRef: string
  outcome: SendOutcome
  error?: string
  httpStatus?: number
  body?: Record<string, unknown>
}

type Trigger = 'user' | 'job'

export const sentNote = () => `Trimitere e-Factura ${anafEnvironmentLabel()} către ANAF.`

export function invoiceRefOf(invoice: SendableInvoice) {
  return `${invoice.series || ''}${invoice.invoice_number || ''}`
}

function numericCif(cui?: string | null) {
  return (cui || '').replace(/\D/g, '')
}

function logOut(db: Db, invoice: SendableInvoice, trigger: Trigger, entry: Omit<EfacturaLogInput, 'userId' | 'direction'>) {
  return logEfactura(db, {
    userId: invoice.user_id,
    companyId: invoice.company_id,
    invoiceId: invoice.id,
    invoiceRef: invoiceRefOf(invoice),
    direction: 'out',
    trigger,
    ...entry
  })
}

async function clearQueueIfNeeded(db: Db, invoice: SendableInvoice) {
  if (invoice.efactura_status === 'queued' || Number(invoice.efactura_attempts) > 0 || invoice.efactura_next_attempt_at) {
    await clearQueue(db, invoice.id)
  }
}

/** Stops the retry queue for an invoice that now needs a human (data to fix). */
async function leaveQueue(db: Db, invoice: SendableInvoice, error: string) {
  if (invoice.efactura_status !== 'queued') return
  await db.from('invoices').update({ efactura_status: null, efactura_error: error }).eq('id', invoice.id)
  await clearQueue(db, invoice.id)
}

/**
 * Asks ANAF for the state of an upload and stores the answer.
 * `poll` waits a few seconds for a final answer (user clicking); the job asks once.
 */
export async function checkAnafStatus(db: Db, input: {
  invoice: SendableInvoice
  accessToken: string
  indexIncarcare: string
  trigger: Trigger
  poll?: boolean
  extra?: Record<string, unknown>
}): Promise<SendResult> {
  const { invoice, accessToken, indexIncarcare, trigger } = input
  const invoiceRef = invoiceRefOf(invoice)
  const started = Date.now()
  const common = {
    simulated: false,
    environment: anafEfacturaEnvironment(),
    invoiceRef,
    indexIncarcare,
    ...(input.extra || {})
  }

  let stare: AnafStareResult
  try {
    stare = input.poll === false
      ? await stareMesaj(accessToken, indexIncarcare)
      : await pollStareMesaj({ accessToken, indexIncarcare })
  } catch (error) {
    if (!isAnafUnavailable(error)) throw error
    await logOut(db, invoice, trigger, { operation: 'status', outcome: 'unavailable', indexIncarcare, message: error.message, durationMs: Date.now() - started })
    // ANAF has the invoice (upload index saved); the sync asks again later.
    return {
      invoiceId: invoice.id,
      invoiceRef,
      outcome: 'processing',
      body: {
        ...common,
        executionStatus: '0',
        stare: 'in prelucrare',
        note: `ANAF a primit factura, dar nu răspunde acum la verificarea stării (${error.message}). Starea se verifică automat.`,
        invoicePatch: { efactura_status: invoice.efactura_status === 'in_processing' ? 'in_processing' : 'uploaded', efactura_index: indexIncarcare }
      }
    }
  }

  if (isStareOk(stare.stare)) {
    const invoicePatch = await persistEfacturaState(db, invoice, {
      efactura_status: 'accepted',
      efactura_index: indexIncarcare,
      efactura_error: null,
      efactura_environment: anafEfacturaEnvironment()
    })
    await clearQueueIfNeeded(db, invoice)
    await logOut(db, invoice, trigger, { operation: 'status', outcome: 'ok', indexIncarcare, durationMs: Date.now() - started })
    return {
      invoiceId: invoice.id,
      invoiceRef,
      outcome: 'accepted',
      body: { ...common, executionStatus: '0', stare: stare.stare, statusResponseXml: stare.statusResponseXml, note: sentNote(), invoicePatch }
    }
  }

  if (isStareNok(stare.stare)) {
    const error = await errorTextFromDescarcare(accessToken, stare.idDescarcare, stare.error)
    const invoicePatch = await persistEfacturaState(db, invoice, {
      efactura_status: 'rejected',
      efactura_index: indexIncarcare,
      efactura_error: error,
      efactura_environment: anafEfacturaEnvironment()
    })
    await clearQueueIfNeeded(db, invoice)
    await logOut(db, invoice, trigger, { operation: 'status', outcome: 'rejected', indexIncarcare, message: error, durationMs: Date.now() - started })
    return {
      invoiceId: invoice.id,
      invoiceRef,
      outcome: 'rejected',
      error,
      body: { ...common, executionStatus: '1', stare: stare.stare, statusResponseXml: stare.statusResponseXml, error, note: sentNote(), invoicePatch }
    }
  }

  const wasProcessing = invoice.efactura_status === 'in_processing'
  const invoicePatch = await persistEfacturaState(db, invoice, {
    efactura_status: 'in_processing',
    efactura_index: indexIncarcare,
    efactura_error: null,
    efactura_environment: anafEfacturaEnvironment()
  })
  // Log "still processing" once, not at every check.
  if (!wasProcessing) await logOut(db, invoice, trigger, { operation: 'status', outcome: 'processing', indexIncarcare, durationMs: Date.now() - started })
  return {
    invoiceId: invoice.id,
    invoiceRef,
    outcome: 'processing',
    body: {
      ...common,
      executionStatus: '0',
      stare: stare.stare || 'in prelucrare',
      statusResponseXml: stare.statusResponseXml,
      note: 'ANAF încă prelucrează factura. Starea se verifică automat; poți apăsa și „Actualizează stare ANAF”.',
      invoicePatch
    }
  }
}

const normRef = (value: string) => value.replace(/[\s\-_/.#]/g, '').toUpperCase()

/**
 * After a timeout ANAF may have received the upload anyway. Before sending again, look among the
 * invoices sent from this CIF since the first attempt (SPV filter T) for one with the same number.
 * Returns the upload index when found. Throws AnafUnavailableError when SPV does not answer.
 */
export async function findEarlierUpload(accessToken: string, cif: string, invoiceRef: string, sinceIso?: string | null) {
  const since = (sinceIso ? Date.parse(sinceIso) : Date.now() - 86400000) - 10 * 60_000
  const messages = await listSpvMessages(accessToken, cif, { filter: 'T', startMs: since })
  const wanted = normRef(invoiceRef)
  for (const message of messages.slice(-20)) {
    try {
      const { entries } = await descarcareMesaj(accessToken, message.id)
      const xml = entries.find(e => /\.xml$/i.test(e.name) && !/^semnatura/i.test(e.name))
      if (!xml) continue
      if (normRef(parseUblInvoice(xml.data.toString('utf8')).id) === wanted) return message.idSolicitare
    } catch (error) {
      if (isAnafUnavailable(error)) throw error
    }
  }
  return null
}

/**
 * Full send of one invoice to ANAF: XML, public validator, upload, state.
 * ANAF not answering puts the invoice in the retry queue instead of failing it.
 * Callers check access, drafts, "already in SPV" and the OAuth token first.
 */
export async function sendInvoice(db: Db, input: {
  invoice: SendableInvoice
  accessToken: string
  trigger: Trigger
}): Promise<SendResult> {
  const { invoice, accessToken, trigger } = input
  const invoiceRef = invoiceRefOf(invoice)
  const attempt = (Number(invoice.efactura_attempts) || 0) + 1

  let xml = ''
  let sellerCui: string | null | undefined
  let foreignBuyer = false
  try {
    const built = await buildInvoiceXml(db, invoice)
    xml = built.xml
    sellerCui = built.seller?.cui
    foreignBuyer = !!built.buyer?.country && String(built.buyer.country).toUpperCase() !== 'RO'
  } catch (buildError) {
    // Missing data found before sending: nothing reached ANAF, so the invoice is not marked as rejected.
    const error = `Factura nu a fost trimisă: ${buildError instanceof Error ? buildError.message : 'XML invalid'}`
    await leaveQueue(db, invoice, error)
    await logOut(db, invoice, trigger, { operation: 'validate', outcome: 'missing_data', code: 'MISSING_DATA', message: error })
    return { invoiceId: invoice.id, invoiceRef, outcome: 'error', error, httpStatus: 422, body: { code: 'MISSING_DATA', error, invoiceRef, simulated: false } }
  }

  // ANAF's public validator first: an invalid invoice is not sent and the user sees what to fix.
  // If the validator itself is unreachable, the upload goes ahead (ANAF validates it anyway).
  const validationStarted = Date.now()
  try {
    const check = await validateEfacturaXml(xml, invoice.invoice_type_code)
    if (!check.ok) {
      const errors = readableValidationErrors(check.messages)
      const error = `Factura nu a fost trimisă: nu trece validarea ANAF. ${errors.join(' · ')}`
      await leaveQueue(db, invoice, error)
      await logOut(db, invoice, trigger, { operation: 'validate', outcome: 'invalid', code: 'ANAF_VALIDATION', message: errors.join(' · '), durationMs: Date.now() - validationStarted })
      return { invoiceId: invoice.id, invoiceRef, outcome: 'error', error, httpStatus: 422, body: { code: 'ANAF_VALIDATION', error, errors, invoiceRef, simulated: false } }
    }
  } catch (validationError) {
    console.warn('ANAF validator unreachable, uploading anyway:', validationError instanceof Error ? validationError.message : validationError)
  }

  const cif = numericCif(sellerCui)
  const queue = async (reason: string, started: number) => {
    const queued = await persistQueued(db, invoice, reason)
    await logOut(db, invoice, trigger, { operation: 'upload', outcome: 'unavailable', attempt, message: reason, durationMs: Date.now() - started })
    return {
      invoiceId: invoice.id,
      invoiceRef,
      outcome: 'queued' as const,
      error: queued.patch.efactura_error,
      httpStatus: 202,
      body: {
        code: 'ANAF_QUEUED',
        queued: true,
        simulated: false,
        environment: anafEfacturaEnvironment(),
        invoiceRef,
        attempts: queued.attempts,
        nextAttemptAt: queued.nextAttemptAt,
        note: queued.patch.efactura_error,
        invoicePatch: queued.patch
      }
    }
  }

  // A queued invoice may already be at ANAF (the earlier attempt timed out after ANAF got it).
  if (invoice.efactura_status === 'queued') {
    const started = Date.now()
    try {
      const index = await findEarlierUpload(accessToken, cif, invoiceRef, invoice.efactura_queued_at || invoice.efactura_uploaded_at)
      if (index) {
        await persistEfacturaState(db, invoice, { efactura_status: 'uploaded', efactura_index: index, efactura_error: null, efactura_environment: anafEfacturaEnvironment() })
        await clearQueueIfNeeded(db, invoice)
        await logOut(db, invoice, trigger, { operation: 'upload', outcome: 'ok', attempt, indexIncarcare: index, code: 'FOUND_IN_SPV', message: 'Încărcarea anterioară ajunsese la ANAF; nu s-a retrimis.', durationMs: Date.now() - started })
        return checkAnafStatus(db, { invoice: { ...invoice, efactura_status: 'uploaded' }, accessToken, indexIncarcare: index, trigger, poll: trigger === 'user' })
      }
    } catch (error) {
      if (isAnafUnavailable(error)) return queue(error.message, started)
      throw error
    }
  }

  const started = Date.now()
  let uploaded: Awaited<ReturnType<typeof uploadEfacturaXml>>
  try {
    uploaded = await uploadEfacturaXml({ accessToken, cif, xml, invoiceTypeCode: invoice.invoice_type_code, foreignBuyer })
  } catch (error) {
    if (isAnafUnavailable(error)) return queue(error.message, started)
    throw error
  }

  if (uploaded.executionStatus !== '0' || !uploaded.indexIncarcare) {
    const error = uploaded.error || 'ANAF a refuzat încărcarea.'
    const invoicePatch = await persistEfacturaState(db, invoice, { efactura_status: 'rejected', efactura_error: error, efactura_environment: anafEfacturaEnvironment() })
    await clearQueueIfNeeded(db, invoice)
    await logOut(db, invoice, trigger, { operation: 'upload', outcome: 'rejected', attempt, message: error, durationMs: Date.now() - started })
    return {
      invoiceId: invoice.id,
      invoiceRef,
      outcome: 'rejected',
      error,
      body: { simulated: false, environment: anafEfacturaEnvironment(), invoiceRef, executionStatus: '1', error, uploadResponseXml: uploaded.uploadResponseXml, note: sentNote(), invoicePatch }
    }
  }

  await persistEfacturaState(db, invoice, { efactura_status: 'uploaded', efactura_index: uploaded.indexIncarcare, efactura_error: null, efactura_environment: anafEfacturaEnvironment() })
  await clearQueueIfNeeded(db, invoice)
  await logOut(db, invoice, trigger, { operation: 'upload', outcome: 'ok', attempt, indexIncarcare: uploaded.indexIncarcare, durationMs: Date.now() - started })

  return checkAnafStatus(db, {
    invoice: { ...invoice, efactura_status: 'uploaded' },
    accessToken,
    indexIncarcare: uploaded.indexIncarcare,
    trigger,
    poll: trigger === 'user',
    extra: { uploadResponseXml: uploaded.uploadResponseXml }
  })
}
