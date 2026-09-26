import { anafFetch, descarcareMesaj, isAnafUnavailable } from '@/lib/anafEfactura'
import { logEfactura } from '@/lib/efacturaLog'
import { anafEfacturaEnvironment } from '@/lib/anafOAuth'
import { notesWithPurchaseMark } from '@/lib/invoiceStatus'
import { invoicePartySnapshots } from '@/lib/invoicePersist'
import { tenantWrite } from '@/lib/portfolio'
import { cuiDigits, parseUblInvoice, readAnafSignature, type UblInvoice } from '@/lib/ublInvoice'
import {
  findOrCreateSupplier,
  insertRegisteredPurchase,
  loadPurchaseRows,
  purchaseInvoiceFromRow
} from '@/lib/purchaseInvoicePersist'
import type { PurchaseBuyer, SimulatedPurchaseInvoice } from '@/lib/efacturaPurchaseImport'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Received-invoice message from SPV (filter P = "FACTURA PRIMITA"). */
export type SpvMessage = {
  /** Download id (for /descarcare). */
  id: string
  /** Upload index given to the supplier (id_solicitare). */
  idSolicitare: string
  type: string
  cif: string
  details: string
  /** ISO timestamp. */
  createdAt: string
}

/** Max messages downloaded per request, to stay within the serverless time limit. */
export const IMPORT_BATCH = 25
const LOOKBACK_DAYS = 60
export const ARCHIVE_BUCKET = 'efactura'

/** "202609251140" → "2026-09-25T11:40:00+03:00" (ANAF timestamps are Romanian local time). */
export function anafTimestamp(value: string) {
  const m = String(value || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+03:00` : new Date().toISOString()
}

export function parseMessageList(body: unknown): { messages: SpvMessage[]; totalPages: number; error?: string } {
  const data = (body || {}) as {
    mesaje?: Array<Record<string, unknown>>
    eroare?: string
    numar_total_pagini?: number
  }
  if (!data.mesaje) {
    const error = String(data.eroare || '')
    // "Nu exista mesaje in ultimele N zile" is not an error, just an empty inbox.
    if (!error || /nu exist[aă] mesaje/i.test(error)) return { messages: [], totalPages: 0 }
    return { messages: [], totalPages: 0, error }
  }
  return {
    messages: data.mesaje.map(m => ({
      id: String(m.id ?? ''),
      idSolicitare: String(m.id_solicitare ?? ''),
      type: String(m.tip ?? ''),
      cif: String(m.cif ?? ''),
      details: String(m.detalii ?? ''),
      createdAt: anafTimestamp(String(m.data_creare ?? ''))
    })).filter(m => m.id),
    totalPages: Number(data.numar_total_pagini || 1)
  }
}

/** Received invoices of the last 60 days for a CIF, all pages. */
export async function listReceivedInvoices(accessToken: string, cif: string) {
  return listSpvMessages(accessToken, cif, { filter: 'P' })
}

/**
 * SPV messages for a CIF, all pages. Filters: P = received invoices, T = sent invoices,
 * E = errors, R = buyer messages. Window: from `startMs` (default 60 days back) to now.
 */
export async function listSpvMessages(accessToken: string, cif: string, opts: { filter: 'P' | 'T' | 'E' | 'R'; startMs?: number }) {
  const end = Date.now() - 60_000
  const oldest = end - LOOKBACK_DAYS * 86400000 + 60_000
  const start = Math.min(end - 60_000, Math.max(oldest, opts.startMs ?? oldest))
  const all: SpvMessage[] = []
  for (let page = 1; page <= 50; page++) {
    const params = new URLSearchParams({
      startTime: String(start),
      endTime: String(end),
      cif,
      pagina: String(page),
      filtru: opts.filter
    })
    const res = await anafFetch(`/listaMesajePaginatieFactura?${params.toString()}`, accessToken)
    const text = await res.text()
    let body: unknown
    try { body = JSON.parse(text) } catch { throw new Error(`ANAF a răspuns neașteptat la lista de mesaje (HTTP ${res.status}).`) }
    const parsed = parseMessageList(body)
    if (parsed.error) throw new Error(`ANAF: ${parsed.error}`)
    all.push(...parsed.messages)
    if (page >= parsed.totalPages) break
  }
  return all
}

/** Amounts as stored: RON when a rate is known, credit notes negative. */
export function purchaseAmounts(inv: UblInvoice) {
  const fx = inv.currency === 'RON' ? 1 : (inv.fxRate || 0)
  const rate = fx || 1
  const sign = inv.isCreditNote ? -1 : 1
  const money = (n: number) => Math.round(sign * n * rate * 100) / 100
  return {
    converted: inv.currency === 'RON' || fx > 0,
    currency: inv.currency === 'RON' || fx > 0 ? 'RON' : inv.currency,
    exchangeRate: inv.currency !== 'RON' && fx > 0 ? fx : null,
    subtotal: money(inv.totals.net),
    vat: money(inv.totals.vat),
    total: money(inv.totals.total),
    prepaid: Math.round(inv.totals.prepaid * rate * 100) / 100,
    lines: inv.lines.map(line => ({
      description: line.description,
      quantity: sign * line.quantity,
      unit_price: Math.round(line.unitPrice * rate * 10000) / 10000,
      tva_rate: line.vatRate,
      total: money(line.net * (1 + line.vatRate / 100)),
      unit_code: line.unitCode,
      vat_category: line.vatCategory || 'S',
      discount_percent: 0
    }))
  }
}

function signatureSeal(meta: ReturnType<typeof readAnafSignature> | null) {
  if (!meta) return null
  const cn = meta.subject.match(/CN=([^,]+)/)?.[1] || 'ANAF'
  return {
    issuer: cn,
    certificate: meta.subject,
    serial: meta.serial,
    signedAt: meta.signedAt,
    algorithm: meta.algorithm.split('#').pop() || meta.algorithm,
    digest: meta.digest
  }
}

async function archiveZip(db: Db, path: string, zip: Buffer) {
  const { error } = await db.storage.from(ARCHIVE_BUCKET).upload(path, zip, { contentType: 'application/zip', upsert: true })
  return error ? null : path
}

async function insertWithOptionalColumns(db: Db, row: Record<string, unknown>) {
  let result = await insertRegisteredPurchase(db, row)
  const message = String(result.error?.message || '')
  if (result.error && /efactura_zip_path|efactura_signature|exchange_rate/i.test(message)) {
    const { efactura_zip_path: _zip, efactura_signature: _sig, exchange_rate: _fx, ...rest } = row
    result = await insertRegisteredPurchase(db, rest)
  }
  return result
}

export type SpvImportResult = {
  invoices: SimulatedPurchaseInvoice[]
  added: number
  skipped: number
  failed: Array<{ messageId: string; error: string }>
  remaining: number
  total: number
}

/**
 * Real SPV import: lists received invoices, downloads the new ones, keeps the ZIP as the legal
 * original, parses the UBL and registers each invoice with its supplier and lines.
 */
export async function importSpvPurchases(db: Db, opts: {
  accessToken: string
  userId: string
  ownerUserId: string
  companyId?: string | null
  buyer: PurchaseBuyer
  trigger?: 'user' | 'job'
}): Promise<SpvImportResult> {
  const cif = cuiDigits(String(opts.buyer.cui || ''))
  if (!cif) throw new Error('Completează CUI-ul firmei ca să poți importa facturile din SPV.')

  const log = (entry: Omit<Parameters<typeof logEfactura>[1], 'userId' | 'companyId' | 'direction' | 'operation' | 'trigger'>) =>
    logEfactura(db, { userId: opts.ownerUserId, companyId: opts.companyId, direction: 'in', operation: 'import', trigger: opts.trigger || 'user', ...entry })

  let listed: SpvMessage[]
  try {
    listed = await listReceivedInvoices(opts.accessToken, cif)
  } catch (error) {
    await log({ outcome: isAnafUnavailable(error) ? 'unavailable' : 'error', code: 'LIST', message: error instanceof Error ? error.message : String(error) })
    throw error
  }
  const messages = listed.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const existing = await loadPurchaseRows(db, { ownerUserId: opts.ownerUserId, companyId: opts.companyId })
  const knownIndexes = new Set(existing.map(row => String(row.efactura_index || '')).filter(Boolean))
  const pending = messages.filter(m => !knownIndexes.has(m.idSolicitare))
  const batch = pending.slice(0, IMPORT_BATCH)

  const result: SpvImportResult = {
    invoices: [],
    added: 0,
    skipped: messages.length - pending.length,
    failed: [],
    remaining: Math.max(0, pending.length - batch.length),
    total: messages.length
  }

  for (const message of batch) {
    const started = Date.now()
    try {
      const { zip, entries } = await descarcareMesaj(opts.accessToken, message.id)
      const xmlEntry = entries.find(e => /\.xml$/i.test(e.name) && !/^semnatura/i.test(e.name))
      if (!xmlEntry) throw new Error('Arhiva nu conține factura XML.')
      const signatureEntry = entries.find(e => /^semnatura/i.test(e.name))
      const inv = parseUblInvoice(xmlEntry.data.toString('utf8'))

      // Same supplier + same number already registered (e.g. entered by hand): link, don't duplicate.
      const duplicate = existing.find(row =>
        cuiDigits(String(row.clients?.cui || '')) === inv.supplier.cui &&
        `${row.series || ''}${row.invoice_number || ''}`.replace(/\s/g, '') === `${inv.series}${inv.number}`.replace(/\s/g, '')
      )
      if (duplicate) {
        await log({ outcome: 'skipped', messageId: message.id, indexIncarcare: message.idSolicitare, invoiceRef: inv.id, code: 'DUPLICATE', message: 'Factura era deja înregistrată (același furnizor și număr).', durationMs: Date.now() - started })
        result.skipped += 1
        result.invoices.push(purchaseInvoiceFromRow({ invoice: duplicate, buyer: opts.buyer }))
        continue
      }

      const supplier = await findOrCreateSupplier(db, {
        ownerUserId: opts.ownerUserId,
        actorUserId: opts.userId,
        companyId: opts.companyId,
        supplierName: inv.supplier.name || `Furnizor ${inv.supplier.cui}`,
        supplierCui: inv.supplier.cui,
        supplierAddress: [inv.supplier.address, inv.supplier.city].filter(Boolean).join(', ')
      })

      const amounts = purchaseAmounts(inv)
      const zipPath = await archiveZip(db, `${opts.ownerUserId}/${opts.companyId || 'profil'}/primite/${message.id}.zip`, zip)
      const signature = signatureEntry ? signatureSeal(readAnafSignature(signatureEntry.data.toString('utf8'))) : null
      const noteParts = [
        `Primită din SPV (${anafEfacturaEnvironment() === 'prod' ? 'producție' : 'test'}) · id descărcare ${message.id}.`,
        amounts.converted ? '' : `Sume în ${inv.currency}: furnizorul nu a declarat TVA-ul în lei, cursul nu este cunoscut.`,
        ...inv.notes
      ].filter(Boolean)

      const { data: created, error } = await insertWithOptionalColumns(db, {
        ...tenantWrite({ ownerUserId: opts.ownerUserId, actorUserId: opts.userId, companyId: opts.companyId }),
        client_id: supplier.id,
        series: inv.series,
        invoice_number: inv.number || inv.id,
        issue_date: inv.issueDate,
        due_date: inv.dueDate,
        subtotal: amounts.subtotal,
        tva_rate: inv.lines[0]?.vatRate ?? 0,
        tva_amount: amounts.vat,
        total: amounts.total,
        prepaid_amount: amounts.prepaid,
        currency: amounts.currency,
        exchange_rate: amounts.exchangeRate,
        notes: notesWithPurchaseMark(noteParts.join('\n')),
        invoice_type_code: inv.typeCode,
        payment_means_code: '42',
        tax_point_date: inv.issueDate,
        delivery_date: inv.issueDate,
        buyer_reference: message.id,
        efactura_status: 'accepted',
        efactura_index: message.idSolicitare,
        efactura_environment: anafEfacturaEnvironment(),
        efactura_uploaded_at: message.createdAt,
        efactura_zip_path: zipPath,
        efactura_signature: signature,
        direction: 'purchase',
        ...invoicePartySnapshots({ status: 'sent', seller: supplier, buyer: opts.buyer as Record<string, unknown> })
      })
      if (error || !created) throw new Error(error?.message || 'Factura nu a putut fi salvată.')

      const itemRows = amounts.lines.map(line => ({ ...line, invoice_id: created.id }))
      if (itemRows.length) {
        const itemsInsert = await db.from('invoice_items').insert(itemRows)
        if (itemsInsert.error) throw new Error(itemsInsert.error.message)
      }

      knownIndexes.add(message.idSolicitare)
      existing.push({ ...created, clients: supplier })
      result.added += 1
      await log({ outcome: 'ok', invoiceId: created.id, messageId: message.id, indexIncarcare: message.idSolicitare, invoiceRef: inv.id, code: inv.syntax, durationMs: Date.now() - started })
      result.invoices.push(purchaseInvoiceFromRow({ invoice: created, items: itemRows, supplier, buyer: opts.buyer }))
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      await log({ outcome: isAnafUnavailable(e) ? 'unavailable' : 'error', messageId: message.id, indexIncarcare: message.idSolicitare, message: error, durationMs: Date.now() - started })
      result.failed.push({ messageId: message.id, error })
    }
  }

  result.invoices.sort((a, b) => b.issueDate.localeCompare(a.issueDate))
  return result
}
