import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeZip } from './__fixtures__/makeZip'

vi.mock('@/lib/efacturaXmlBuild', () => ({
  buildInvoiceXml: async () => ({ xml: '<Invoice/>', seller: { cui: 'RO12345674' }, buyer: { country: 'RO' } })
}))

import { sendInvoice } from './efacturaSend'
import { runEfacturaSync } from './efacturaSync'
import { nextAttemptAt, QUEUE_MAX_ATTEMPTS } from './efacturaQueue'

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** Supabase stand-in: updates on invoices, inserts into the journal, simple selects for the sync. */
function fakeDb(invoices: Row[], opts: { withoutQueueColumns?: boolean } = {}) {
  const tables: Record<string, Row[]> = { invoices, efactura_log: [] }
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = []
    let patch: Row | null = null
    let insert: Row | null = null
    const run = () => {
      if (insert) { tables[table].push({ ...insert, created_at: new Date().toISOString() }); return { data: [insert], error: null } }
      if (patch) {
        if (opts.withoutQueueColumns && Object.keys(patch).some(k => /efactura_(attempts|next_attempt_at|queued_at)/.test(k))) {
          return { data: null, error: { message: 'column invoices.efactura_attempts does not exist' } }
        }
        tables[table].filter(r => filters.every(f => f(r))).forEach(r => Object.assign(r, patch))
        return { data: null, error: null }
      }
      return { data: tables[table].filter(r => filters.every(f => f(r))), error: null }
    }
    const b: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      select: () => b,
      update: (p: Row) => { patch = p; return b },
      insert: (r: Row) => { insert = r; return b },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b },
      in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return b },
      not: (c: string, _op: string, _v: unknown) => { filters.push(r => r[c] !== null && r[c] !== undefined); return b },
      lte: (c: string, v: string) => { filters.push(r => r[c] !== null && r[c] !== undefined && String(r[c]) <= v); return b },
      order: () => b,
      limit: () => b,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve)
    }
    return b
  }
  return { tables, from }
}

type AnafScript = {
  upload?: () => Response | Promise<Response>
  stare?: string
  sent?: Array<{ id: string; idSolicitare: string; xml: string }>
}

function mockAnaf(script: AnafScript) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url)
    if (url.includes('/validare/')) return new Response(JSON.stringify({ stare: 'ok', trace_id: 't' }))
    if (url.includes('/upload')) return script.upload ? script.upload() : new Response('<header ExecutionStatus="0" index_incarcare="777"/>')
    if (url.includes('/stareMesaj')) return new Response(`<header stare="${script.stare || 'ok'}" id_descarcare="888"/>`)
    if (url.includes('/listaMesajePaginatieFactura')) {
      const sent = script.sent || []
      return new Response(JSON.stringify(sent.length
        ? { mesaje: sent.map(m => ({ id: m.id, id_solicitare: m.idSolicitare, tip: 'FACTURA TRIMISA', cif: '12345674', data_creare: '202609260900', detalii: '' })), numar_total_pagini: 1 }
        : { eroare: 'Nu exista mesaje in intervalul selectat' }))
    }
    if (url.includes('/descarcare')) {
      const id = new URL(url).searchParams.get('id')
      const m = (script.sent || []).find(x => x.id === id)
      if (m) return new Response(makeZip([{ name: `${m.idSolicitare}.xml`, text: m.xml }]))
    }
    return new Response('{}', { status: 404 })
  }))
  return calls
}

const invoice = (over: Row = {}): Row & { id: string; user_id: string } => ({
  id: 'inv-1', user_id: 'u1', company_id: 'c1', series: 'FCT', invoice_number: '0005', status: 'sent',
  invoice_type_code: '380', efactura_status: null, efactura_index: null, notes: '', ...over
})

beforeEach(() => {
  process.env.ANAF_EFACTURA_MODE = 'test'
  process.env.ANAF_EFACTURA_BASE = 'https://api.anaf.ro/test/FCTEL/rest'
})
afterEach(() => vi.unstubAllGlobals())

describe('retry queue', () => {
  it('spaces retries out and stops after the last attempt', () => {
    const now = Date.parse('2026-09-26T10:00:00Z')
    expect(nextAttemptAt(1, now)).toBe('2026-09-26T10:05:00.000Z')
    expect(nextAttemptAt(3, now)).toBe('2026-09-26T10:30:00.000Z')
    expect(nextAttemptAt(12, now)).toBe('2026-09-26T22:00:00.000Z')
    expect(nextAttemptAt(QUEUE_MAX_ATTEMPTS, now)).toBeNull()
  })
})

describe('sendInvoice', () => {
  it('queues the invoice when ANAF answers 503, instead of marking it rejected', async () => {
    mockAnaf({ upload: () => new Response('Service Unavailable', { status: 503 }) })
    const inv = invoice()
    const db = fakeDb([inv])
    const r = await sendInvoice(db, { invoice: inv, accessToken: 't', trigger: 'user' })
    expect(r.outcome).toBe('queued')
    expect(r.httpStatus).toBe(202)
    expect(r.body).toMatchObject({ queued: true, code: 'ANAF_QUEUED', attempts: 1 })
    expect(inv).toMatchObject({ efactura_status: 'queued', efactura_attempts: 1 })
    expect(inv.efactura_error).toContain('HTTP 503')
    expect(inv.efactura_error).toContain('se retrimite automat')
    expect(db.tables.efactura_log).toMatchObject([{ direction: 'out', operation: 'upload', outcome: 'unavailable', attempt: 1, invoice_ref: 'FCT0005' }])
  })

  it('queues on a timeout too', async () => {
    mockAnaf({ upload: () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError') } })
    const inv = invoice()
    const r = await sendInvoice(fakeDb([inv]), { invoice: inv, accessToken: 't', trigger: 'user' })
    expect(r.outcome).toBe('queued')
    expect(inv.efactura_error).toContain('nu a răspuns în 30 secunde')
  })

  it('still queues before the queue migration is applied', async () => {
    mockAnaf({ upload: () => new Response('', { status: 502 }) })
    const inv = invoice()
    const r = await sendInvoice(fakeDb([inv], { withoutQueueColumns: true }), { invoice: inv, accessToken: 't', trigger: 'user' })
    expect(r.outcome).toBe('queued')
    expect(inv.efactura_status).toBe('queued')
    expect(inv.efactura_attempts).toBeUndefined()
  })

  it('retries a queued invoice: nothing at ANAF yet, so it uploads and gets accepted', async () => {
    const calls = mockAnaf({ stare: 'ok' })
    const inv = invoice({ efactura_status: 'queued', efactura_attempts: 2, efactura_queued_at: '2026-09-26T08:00:00Z', efactura_next_attempt_at: '2026-09-26T08:20:00Z' })
    const db = fakeDb([inv])
    const r = await sendInvoice(db, { invoice: inv, accessToken: 't', trigger: 'job' })
    expect(r.outcome).toBe('accepted')
    expect(calls.some(u => u.includes('filtru=T'))).toBe(true)
    expect(calls.some(u => u.includes('/upload'))).toBe(true)
    expect(inv).toMatchObject({ efactura_status: 'accepted', efactura_index: '777', status: 'spv', efactura_attempts: 0, efactura_next_attempt_at: null })
    expect(db.tables.efactura_log.map(l => [l.operation, l.outcome, l.trigger])).toEqual([['upload', 'ok', 'job'], ['status', 'ok', 'job']])
    expect(db.tables.efactura_log[0].attempt).toBe(3)
  })

  it('does not upload twice when the timed-out attempt had reached ANAF', async () => {
    const calls = mockAnaf({ stare: 'ok', sent: [{ id: '900', idSolicitare: '555', xml: fixture('ubl-invoice-fct0005.xml') }] })
    const inv = invoice({ efactura_status: 'queued', efactura_attempts: 1, efactura_queued_at: '2026-09-26T08:00:00Z' })
    const db = fakeDb([inv])
    const r = await sendInvoice(db, { invoice: inv, accessToken: 't', trigger: 'job' })
    expect(r.outcome).toBe('accepted')
    expect(calls.some(u => u.includes('/upload'))).toBe(false)
    expect(inv).toMatchObject({ efactura_status: 'accepted', efactura_index: '555' })
    expect(db.tables.efactura_log[0]).toMatchObject({ operation: 'upload', outcome: 'ok', code: 'FOUND_IN_SPV', index_incarcare: '555' })
  })

  it('records a real rejection as final (no retry)', async () => {
    mockAnaf({ upload: () => new Response('<header ExecutionStatus="1"><Errors errorMessage="CIF emitent invalid"/></header>') })
    const inv = invoice()
    const db = fakeDb([inv])
    const r = await sendInvoice(db, { invoice: inv, accessToken: 't', trigger: 'user' })
    expect(r.outcome).toBe('rejected')
    expect(inv.efactura_status).toBe('rejected')
    expect(db.tables.efactura_log).toMatchObject([{ operation: 'upload', outcome: 'rejected', message: 'CIF emitent invalid' }])
  })
})

describe('runEfacturaSync', () => {
  it('checks invoices ANAF has not answered for and retries the due queue', async () => {
    process.env.ANAF_OAUTH_CLIENT_ID = 'x'
    process.env.ANAF_OAUTH_CLIENT_SECRET = 'y'
    process.env.ANAF_OAUTH_REDIRECT_URI = 'https://example.test/cb'
    vi.doMock('@/lib/anafOAuth', async (orig) => ({ ...(await orig<object>()), getValidAccessToken: async () => ({ access_token: 't' }) }))
    vi.resetModules()
    const { runEfacturaSync: sync } = await import('./efacturaSync')
    mockAnaf({ stare: 'nok' })
    const waiting = invoice({ id: 'inv-2', efactura_status: 'in_processing', efactura_index: '123', efactura_uploaded_at: '2026-09-26T07:00:00Z' })
    const queued = invoice({ id: 'inv-3', invoice_number: '0006', efactura_status: 'queued', efactura_attempts: 1, efactura_next_attempt_at: '2026-01-01T00:00:00Z' })
    const later = invoice({ id: 'inv-4', invoice_number: '0007', efactura_status: 'queued', efactura_attempts: 1, efactura_next_attempt_at: '2999-01-01T00:00:00Z' })
    const db = fakeDb([waiting, queued, later])
    const report = await sync(db)
    expect(report.checked).toBe(1)
    expect(report.retried).toBe(1)
    expect(waiting.efactura_status).toBe('rejected')
    expect(queued.efactura_status).toBe('rejected') // uploaded, then ANAF answered nok
    expect(later.efactura_status).toBe('queued')    // not due yet
    vi.doUnmock('@/lib/anafOAuth')
  })

  it('does nothing in simulation mode', async () => {
    process.env.ANAF_EFACTURA_MODE = 'simulate'
    const report = await runEfacturaSync(fakeDb([]))
    expect(report.skipped).toContain('simulare')
  })
})
