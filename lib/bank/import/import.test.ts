import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectFormat } from '@/lib/bank/import/detectFormat'
import { importStatement } from '@/lib/bank/import/importStatement'
import { parseCamt053 } from '@/lib/bank/import/parseCamt053'
import { decodeCsvBytes, parseCsv, parseCsvAmount } from '@/lib/bank/import/parseCsv'
import { parseXml940 } from '@/lib/bank/import/parseXml940'
import { paymentFingerprint } from '@/lib/multicash940'
import type { QueryClient, QueryResult } from '@/lib/bank/tenantWriteServer'

const camtSample = readFileSync(resolve('fixtures/multicash940-sample.xml'), 'utf8')
const camtBatch = readFileSync(resolve('__fixtures__/bank/camt053-batch.xml'), 'utf8')
const csvDebit = readFileSync(resolve('__fixtures__/bank/statement-debit-credit.csv'), 'utf8')
const csvSigned = readFileSync(resolve('__fixtures__/bank/statement-signed.csv'), 'utf8')

describe('detectFormat', () => {
  it('sniffs camt, xml940 and csv', () => {
    expect(detectFormat('extras.xml', camtSample)).toBe('camt053')
    expect(detectFormat('extras.xml', '<Stmt><Ntry>1</Ntry></Stmt>')).toBe('xml940')
    expect(detectFormat('extras.csv', 'Data;Suma')).toBe('csv')
  })
})

describe('parsers', () => {
  it('parses CAMT sample and signed amounts', () => {
    const parsed = parseCamt053(camtSample)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.lines).toHaveLength(3)
    expect(parsed.lines[0].amount).toBe(1500)
    expect(parsed.lines[2].amount).toBe(-250)
    expect(parsed.lines[0].counterpartyName).toMatch(/Pădurea|Padurea/i)
  })

  it('expands a CAMT batch entry into several TxDtls', () => {
    const parsed = parseCamt053(camtBatch)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines.map(line => line.providerRef)).toEqual(['TX-1', 'TX-2'])
    expect(parsed.lines[0].amount).toBe(100)
    expect(parsed.lines[1].amount).toBe(200)
  })

  it('parses Multicash XML via the existing parser and keeps its fingerprint', () => {
    const parsed = parseXml940(camtSample)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const first = parsed.lines[0]
    expect(first.fingerprint).toBe(paymentFingerprint({
      statementIban: first.statementIban,
      paidOn: first.bookingDate,
      amount: Math.abs(first.amount),
      counterpartIban: first.counterpartyIban,
      bankTxnId: first.providerRef || '',
      details: first.description
    }))
  })

  it('parses CSV debit/credit with decimal comma and keeps a malformed line', () => {
    const parsed = parseCsv(csvDebit, {
      delimiter: ';',
      encoding: 'utf-8',
      header: true,
      columns: ['date', 'debit', 'credit', 'name', 'iban', 'details']
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.lines[0].amount).toBe(1500)
    expect(parsed.lines[1].amount).toBe(-80.5)
    expect(parsed.lines[2].lineError).toBeTruthy()
  })

  it('parses signed CSV amounts', () => {
    expect(parseCsvAmount('1.234,56')).toBe(1234.56)
    const parsed = parseCsv(csvSigned, {
      delimiter: ',',
      encoding: 'utf-8',
      header: true,
      columns: ['date', 'amount', 'name', 'iban', 'details']
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.lines[0].amount).toBe(1234.56)
    expect(parsed.lines[1].amount).toBe(-250)
  })

  it('decodes Windows-1250 Romanian characters', () => {
    const bytes = Uint8Array.from([0x50, 0xE3, 0x64, 0x75, 0x72, 0x65])
    expect(decodeCsvBytes(bytes, 'windows-1250')).toMatch(/P[aă]dure/i)
  })
})

type Row = Record<string, unknown>

function createMock(seed: Record<string, Row[]>): QueryClient & { tables: Record<string, Row[]> } {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([key, rows]) => [key, rows.map(row => ({ ...row }))])
  )
  const from = (table: string) => {
    if (!tables[table]) tables[table] = []
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: unknown
    const filters: Array<(row: Row) => boolean> = []
    const matches = () => (tables[table] || []).filter(row => filters.every(filter => filter(row)))
    const result = (data: unknown): QueryResult<unknown> => ({ data, error: null })
    const api = {
      select() { return api },
      eq(column: string, value: unknown) { filters.push(row => row[column] === value); return api },
      in(column: string, values: unknown[]) { filters.push(row => values.includes(row[column])); return api },
      neq(column: string, value: unknown) { filters.push(row => row[column] !== value); return api },
      insert(values: unknown) {
        mode = 'insert'
        const list = (Array.isArray(values) ? values : [values]) as Row[]
        const inserted = list.map(row => ({ id: String(row.id || `${table}-${tables[table].length + 1}`), ...row }))
        tables[table].push(...inserted)
        payload = inserted
        return api
      },
      update(values: Record<string, unknown>) { mode = 'update'; payload = values; return api },
      delete() { mode = 'delete'; return api },
      maybeSingle() { return Promise.resolve(result(matches()[0] || null)) },
      then(resolve: (value: QueryResult<unknown>) => unknown, reject?: (reason: unknown) => unknown) {
        if (mode === 'insert') return Promise.resolve(result(payload)).then(resolve, reject)
        if (mode === 'update') {
          for (const row of matches()) Object.assign(row, payload)
          return Promise.resolve(result(matches())).then(resolve, reject)
        }
        if (mode === 'delete') {
          const keep = new Set(matches())
          tables[table] = tables[table].filter(row => !keep.has(row))
          return Promise.resolve(result(null)).then(resolve, reject)
        }
        return Promise.resolve(result(matches())).then(resolve, reject)
      }
    }
    return api
  }
  // The hand-written mock covers only the calls under test; cast to the client type they receive.
  return { from, tables } as unknown as QueryClient & { tables: Record<string, Row[]> }
}

describe('importStatement', () => {
  const owner = 'user-1'
  const companyId = 'co-1'
  const companyIban = 'RO49AAAA1B31007593840000'

  function seed() {
    return createMock({
      companies: [{ id: companyId, user_id: owner, invoice_series: 'FCT', iban: companyIban }],
      bank_accounts: [{ id: 'acc-1', company_id: companyId, user_id: owner, iban: companyIban, currency: 'RON' }],
      bank_transactions: [],
      invoices: [],
      client_bank_accounts: [],
      invoice_payments: [],
      bank_match_suggestions: [],
      bank_match_rules: [],
      bank_match_events: [],
      portfolio_members: []
    })
  }

  it('re-importing the same CAMT file creates no new rows', async () => {
    const client = seed()
    const bytes = new TextEncoder().encode(camtSample)
    const first = await importStatement(client, {
      actorUserId: owner,
      userId: owner,
      companyId,
      fileName: 'extras.xml',
      bytes
    })
    expect('newCount' in first && first.newCount).toBeGreaterThan(0)
    const second = await importStatement(client, {
      actorUserId: owner,
      userId: owner,
      companyId,
      fileName: 'extras.xml',
      bytes
    })
    expect('duplicates' in second && second.duplicates).toBeGreaterThan(0)
    expect('newCount' in second && second.newCount).toBe(0)
  })

  it('marks an internal transfer as ignored', async () => {
    const client = seed()
    client.tables.bank_accounts.push({
      id: 'acc-2',
      company_id: companyId,
      user_id: owner,
      iban: 'RO99INT1B31007593840000',
      currency: 'RON'
    })
    const xml = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt><Acct><Id><IBAN>${companyIban}</IBAN></Id></Acct><Ntry><Amt Ccy="RON">10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-09-21</Dt></BookgDt><AcctSvcrRef>INT1</AcctSvcrRef><NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Cont intern</Nm></Dbtr><DbtrAcct><Id><IBAN>RO99INT1B31007593840000</IBAN></Id></DbtrAcct></RltdPties></TxDtls></NtryDtls></Ntry></Stmt></BkToCstmrStmt></Document>`
    const result = await importStatement(client, {
      actorUserId: owner,
      userId: owner,
      companyId,
      fileName: 'intern.xml',
      bytes: new TextEncoder().encode(xml)
    })
    expect('internalTransfers' in result && result.internalTransfers).toBe(1)
    expect(client.tables.bank_transactions[0].match_status).toBe('ignored')
    expect(client.tables.bank_transactions[0].ignored_reason).toBe('transfer_intern')
  })

  it('blocks an IBAN that belongs to another company until confirmed', async () => {
    const client = seed()
    client.tables.bank_accounts.push({
      id: 'other',
      company_id: 'co-other',
      user_id: owner,
      iban: 'RO77OTHR1B31007593840000',
      currency: 'RON'
    })
    const xml = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt><Acct><Id><IBAN>RO77OTHR1B31007593840000</IBAN></Id></Acct><Ntry><Amt Ccy="RON">10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-09-21</Dt></BookgDt><AcctSvcrRef>F1</AcctSvcrRef></Ntry></Stmt></BkToCstmrStmt></Document>`
    const result = await importStatement(client, {
      actorUserId: owner,
      userId: owner,
      companyId,
      fileName: 'foreign.xml',
      bytes: new TextEncoder().encode(xml)
    })
    expect(result).toMatchObject({ needsIbanConfirm: true, foreignIban: 'RO77OTHR1B31007593840000' })
  })
})
