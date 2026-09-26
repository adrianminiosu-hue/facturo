import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeZip } from './__fixtures__/makeZip'
import { importSpvPurchases } from './spvPurchaseImport'

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

type Row = Record<string, any>

/** In-memory stand-in for the Supabase client, covering the calls the import makes. */
function fakeDb() {
  const tables: Record<string, Row[]> = { invoices: [], clients: [], invoice_items: [], efactura_log: [] }
  const uploads: string[] = []
  let seq = 0
  const query = (table: string) => {
    let rows = () => tables[table]
    const filters: Array<(r: Row) => boolean> = []
    let pendingInsert: Row[] | null = null
    let pendingUpdate: Row | null = null
    const run = () => {
      if (pendingInsert) {
        const inserted = pendingInsert.map(r => ({ id: `${table}-${++seq}`, ...r }))
        tables[table].push(...inserted)
        return { data: inserted, error: null }
      }
      const matched = rows().filter(r => filters.every(f => f(r)))
      if (pendingUpdate) {
        matched.forEach(r => Object.assign(r, pendingUpdate))
        return { data: matched, error: null }
      }
      const withJoins = matched.map(r => table === 'invoices'
        ? { ...r, clients: tables.clients.find(c => c.id === r.client_id) || null, invoice_items: tables.invoice_items.filter(i => i.invoice_id === r.id) }
        : r)
      return { data: withJoins, error: null }
    }
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); return builder },
      is: (col: string, val: unknown) => { filters.push(r => (r[col] ?? null) === val); return builder },
      order: () => builder,
      limit: () => builder,
      insert: (payload: Row | Row[]) => { pendingInsert = Array.isArray(payload) ? payload : [payload]; return builder },
      update: (payload: Row) => { pendingUpdate = payload; return builder },
      single: async () => { const r = run(); return { data: r.data[0] || null, error: r.data[0] ? null : { message: 'not found' } } },
      maybeSingle: async () => { const r = run(); return { data: r.data[0] || null, error: null } },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve)
    }
    return builder
  }
  return {
    tables,
    uploads,
    from: query,
    storage: { from: () => ({ upload: async (path: string) => { uploads.push(path); return { error: null } } }) }
  }
}

function mockAnaf(messages: Array<{ id: string; idSolicitare: string; files: Array<{ name: string; text: string }> }>) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url)
    if (url.includes('/listaMesajePaginatieFactura')) {
      return new Response(JSON.stringify({
        mesaje: messages.map(m => ({ id: m.id, id_solicitare: m.idSolicitare, tip: 'FACTURA PRIMITA', cif: '12312343', data_creare: '202609211015', detalii: '' })),
        numar_total_pagini: 1
      }))
    }
    const id = new URL(url).searchParams.get('id')
    const msg = messages.find(m => m.id === id)
    if (url.includes('/descarcare') && msg) return new Response(makeZip(msg.files))
    return new Response(JSON.stringify({ eroare: 'necunoscut' }), { status: 400 })
  }))
  return calls
}

afterEach(() => vi.unstubAllGlobals())

const buyer = { id: 'company-1', company_name: 'Finsquare IT Solutions', cui: 'RO12312343' }
const opts = (db: ReturnType<typeof fakeDb>) => ({ accessToken: 't', userId: 'u1', ownerUserId: 'u1', companyId: 'company-1', buyer, })

describe('importSpvPurchases (end to end with a fake ANAF and database)', () => {
  it('downloads, archives and registers received invoices, then skips them on the next run', async () => {
    const calls = mockAnaf([
      { id: '3001', idSolicitare: '5001', files: [{ name: '5001.xml', text: fixture('ubl-invoice-fct0005.xml') }, { name: 'semnatura_5001.xml', text: fixture('anaf-semnatura.xml') }] },
      { id: '3002', idSolicitare: '5002', files: [{ name: '5002.xml', text: fixture('ubl-creditnote-eur.xml') }, { name: 'semnatura_5002.xml', text: fixture('anaf-semnatura.xml') }] },
      { id: '3003', idSolicitare: '5003', files: [{ name: 'semnatura_5003.xml', text: fixture('anaf-semnatura.xml') }] },
      { id: '3004', idSolicitare: '5004', files: [{ name: '5004.xml', text: fixture('cii-invoice-eur.xml') }, { name: 'semnatura_5004.xml', text: fixture('anaf-semnatura.xml') }] }
    ])
    const db = fakeDb()

    const first = await importSpvPurchases(db, opts(db))
    expect(first.total).toBe(4)
    expect(first.added).toBe(3)
    expect(first.failed).toEqual([{ messageId: '3003', error: 'Arhiva nu conține factura XML.' }])
    expect(calls.some(u => u.includes('/listaMesajePaginatieFactura') && u.includes('cif=12312343') && u.includes('filtru=P'))).toBe(true)

    const invoices = db.tables.invoices
    expect(invoices).toHaveLength(3)
    const invoice = invoices.find(r => r.efactura_index === '5001')!
    expect(invoice).toMatchObject({ direction: 'purchase', series: 'FCT', invoice_number: '0005', total: 108897.58, buyer_reference: '3001', efactura_status: 'accepted', company_id: 'company-1' })
    expect(invoice.efactura_signature).toMatchObject({ serial: '1234567890', signedAt: '2026-09-21T10:15:00Z' })
    const credit = invoices.find(r => r.efactura_index === '5002')!
    expect(credit).toMatchObject({ invoice_type_code: '381', currency: 'RON', exchange_rate: 5.0852, total: -615.31 })
    expect(db.tables.invoice_items.filter(i => i.invoice_id === credit.id)).toHaveLength(1)
    const cii = invoices.find(r => r.efactura_index === '5004')!
    expect(cii).toMatchObject({ series: 'LOG', invoice_number: '2026/0917', currency: 'RON', exchange_rate: 5.0851, total: 6152.97 })
    expect(db.tables.invoice_items.filter(i => i.invoice_id === cii.id)).toHaveLength(2)
    expect(db.tables.clients.map(c => c.cui).sort()).toEqual(['12312343', '14399840'])
    expect(db.tables.clients.every(c => c.is_supplier === true)).toBe(true)
    expect(db.uploads).toEqual(['u1/company-1/primite/3001.zip', 'u1/company-1/primite/3002.zip', 'u1/company-1/primite/3004.zip'])

    const journal = db.tables.efactura_log
    expect(journal.map(r => [r.message_id, r.outcome, r.code])).toEqual([
      ['3001', 'ok', 'UBL'],
      ['3002', 'ok', 'UBL'],
      ['3003', 'error', null],
      ['3004', 'ok', 'CII']
    ])
    expect(journal.every(r => r.direction === 'in' && r.operation === 'import' && r.user_id === 'u1')).toBe(true)

    const second = await importSpvPurchases(db, opts(db))
    expect(second.added).toBe(0)
    expect(second.skipped).toBe(3)
    expect(db.tables.invoices).toHaveLength(3)
  })

  it('reports ANAF errors instead of importing nothing silently', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ eroare: 'Nu aveti drept in SPV pentru CIF=12312343' }))))
    const db = fakeDb()
    await expect(importSpvPurchases(db, opts(db))).rejects.toThrow('Nu aveti drept')
    expect(db.tables.efactura_log).toMatchObject([{ outcome: 'error', code: 'LIST' }])
  })
})
