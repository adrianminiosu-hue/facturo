import { describe, expect, it } from 'vitest'
import { applyMatch, applyMatchWithContext, confirmMatch, loadMatchContext, undoMatch } from '@/lib/bank/matching/apply'
import type { QueryClient, QueryResult } from '@/lib/bank/tenantWriteServer'

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
      select() {
        return api
      },
      eq(column: string, value: unknown) {
        filters.push(row => row[column] === value)
        return api
      },
      in(column: string, values: unknown[]) {
        filters.push(row => values.includes(row[column]))
        return api
      },
      insert(values: unknown) {
        mode = 'insert'
        payload = values
        const list = (Array.isArray(values) ? values : [values]) as Row[]
        const inserted = list.map(row => ({ id: String(row.id || `${table}-${tables[table].length + 1}`), ...row }))
        tables[table].push(...inserted)
        payload = inserted
        return api
      },
      update(values: Record<string, unknown>) {
        mode = 'update'
        payload = values
        return api
      },
      delete() {
        mode = 'delete'
        return api
      },
      maybeSingle() {
        return Promise.resolve(result(matches()[0] || null))
      },
      then(resolve: (value: QueryResult<unknown>) => unknown, reject?: (reason: unknown) => unknown) {
        if (mode === 'insert') {
          return Promise.resolve(result(payload)).then(resolve, reject)
        }
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

  return { from, tables }
}

const owner = 'user-1'
const companyId = 'co-1'

function baseSeed() {
  return {
    companies: [{ id: companyId, user_id: owner, invoice_series: 'FCT' }],
    bank_transactions: [{
      id: 'tx-1',
      user_id: owner,
      company_id: companyId,
      booking_date: '2026-09-20',
      amount: 100,
      currency: 'RON',
      counterparty_name: 'Client SRL',
      counterparty_iban: 'RO49AAAA1B31007593840000',
      description: 'plata FCT0026',
      source: 'xml940',
      match_status: 'unmatched'
    }],
    invoices: [{
      id: 'inv-26',
      user_id: owner,
      company_id: companyId,
      series: 'FCT',
      invoice_number: '0026',
      client_id: 'c1',
      issue_date: '2026-09-01',
      due_date: '2026-09-16',
      total: 100,
      amount_paid: 0,
      prepaid_amount: 0,
      status: 'sent',
      currency: 'RON',
      invoice_type_code: '380',
      direction: 'issued',
      notes: null,
      clients: { company_name: 'Client SRL', cui: 'RO123', iban: 'RO49AAAA1B31007593840000' }
    }],
    client_bank_accounts: [{ client_id: 'c1', iban: 'RO49AAAA1B31007593840000' }],
    invoice_payments: [] as Row[],
    bank_match_suggestions: [] as Row[],
    bank_match_rules: [] as Row[],
    portfolio_members: [] as Row[]
  }
}

describe('applyMatch', () => {
  it('is a no-op when the transaction is already matched', async () => {
    const seed = baseSeed()
    seed.bank_transactions[0].match_status = 'matched'
    const client = createMock(seed)
    const result = await applyMatch(client, { transactionId: 'tx-1', actorUserId: owner })
    expect(result).toEqual({ status: 'matched', applied: false })
    expect(client.tables.invoice_payments).toHaveLength(0)
  })

  it('only proposes a match when autoApply is off', async () => {
    const client = createMock(baseSeed())
    const context = await loadMatchContext(client, companyId, owner)
    const result = await applyMatchWithContext(client, {
      transactionId: 'tx-1',
      actorUserId: owner,
      context,
      autoApply: false
    })
    expect(result.applied).toBe(false)
    expect(result.status).toBe('suggested')
    expect(client.tables.invoice_payments).toHaveLength(0)
    expect(client.tables.bank_match_suggestions).toHaveLength(1)
    expect(client.tables.bank_match_suggestions[0].invoice_id).toBe('inv-26')
    expect(client.tables.bank_transactions[0].match_status).toBe('suggested')
  })

  it('auto-applies a unique invoice reference at confidence 98', async () => {
    const client = createMock(baseSeed())
    const result = await applyMatch(client, { transactionId: 'tx-1', actorUserId: owner })
    expect(result.applied).toBe(true)
    expect(result.status).toBe('matched')
    expect(client.tables.invoice_payments).toHaveLength(1)
    expect(client.tables.invoice_payments[0].invoice_id).toBe('inv-26')
    expect(client.tables.invoice_payments[0].bank_transaction_id).toBe('tx-1')
    expect(client.tables.bank_transactions[0].match_status).toBe('matched')
  })

  it('links a statement line to an already-collected invoice instead of allocating again', async () => {
    const seed = baseSeed()
    seed.invoice_payments.push({
      id: 'pay-old',
      invoice_id: 'inv-26',
      amount: 100,
      source: 'manual',
      bank_transaction_id: null
    })
    seed.invoices.push({
      id: 'inv-27',
      user_id: owner,
      company_id: companyId,
      series: 'FCT',
      invoice_number: '0027',
      client_id: 'c1',
      issue_date: '2026-09-02',
      due_date: '2026-09-17',
      total: 100,
      amount_paid: 0,
      prepaid_amount: 0,
      status: 'sent',
      currency: 'RON',
      invoice_type_code: '380',
      direction: 'issued',
      notes: null,
      clients: { company_name: 'Client SRL', cui: 'RO123', iban: 'RO49AAAA1B31007593840000' }
    })
    const client = createMock(seed)
    const result = await applyMatch(client, { transactionId: 'tx-1', actorUserId: owner })
    expect(result.applied).toBe(true)
    expect(result.status).toBe('matched')
    expect(result.candidate?.rule).toBe('already_collected')
    expect(client.tables.invoice_payments).toHaveLength(1)
    expect(client.tables.invoice_payments[0].id).toBe('pay-old')
    expect(client.tables.invoice_payments[0].bank_transaction_id).toBe('tx-1')
    expect(client.tables.invoice_payments[0].invoice_id).toBe('inv-26')
  })

  it('leaves the transaction unmatched when no invoice remains and none can be linked', async () => {
    const seed = baseSeed()
    seed.invoice_payments.push({
      id: 'pay-old',
      invoice_id: 'inv-26',
      amount: 100,
      source: 'manual',
      bank_transaction_id: null
    })
    seed.bank_transactions[0].description = 'transfer'
    seed.bank_transactions[0].counterparty_iban = ''
    seed.bank_transactions[0].counterparty_name = ''
    const client = createMock(seed)
    const result = await applyMatch(client, { transactionId: 'tx-1', actorUserId: owner })
    expect(result.applied).toBe(false)
    expect(result.status).toBe('unmatched')
    expect(client.tables.invoice_payments[0].bank_transaction_id).toBeNull()
  })

  it('writes suggestions when confidence is below the auto threshold', async () => {
    const seed = baseSeed()
    seed.bank_transactions[0].description = 'transfer'
    seed.bank_transactions[0].counterparty_iban = ''
    seed.bank_transactions[0].counterparty_name = 'Client SRL'
    const client = createMock(seed)
    const result = await applyMatch(client, { transactionId: 'tx-1', actorUserId: owner })
    expect(result.applied).toBe(false)
    expect(result.status).toBe('suggested')
    expect(client.tables.invoice_payments).toHaveLength(0)
    expect(client.tables.bank_match_suggestions).toHaveLength(1)
    expect(client.tables.bank_transactions[0].match_status).toBe('suggested')
  })
})

describe('undoMatch / confirmMatch', () => {
  it('deletes allocations and returns the transaction to unmatched', async () => {
    const seed = baseSeed()
    seed.bank_transactions[0].match_status = 'matched'
    seed.invoice_payments.push({
      id: 'pay-1',
      invoice_id: 'inv-26',
      bank_transaction_id: 'tx-1',
      amount: 100
    })
    const client = createMock(seed)
    const result = await undoMatch(client, { transactionId: 'tx-1', actorUserId: owner })
    expect(result.status).toBe('unmatched')
    expect(client.tables.invoice_payments).toHaveLength(0)
    expect(client.tables.bank_transactions[0].match_status).toBe('unmatched')
  })

  it('learns an unknown counterparty IBAN on confirm', async () => {
    const seed = baseSeed()
    seed.bank_transactions[0].description = 'manual'
    seed.bank_transactions[0].counterparty_iban = 'RO11BBBB1B31007593840099'
    seed.invoices[0].clients = { company_name: 'Client SRL', cui: 'RO123', iban: 'RO49AAAA1B31007593840000' }
    seed.client_bank_accounts = [{ client_id: 'c1', iban: 'RO49AAAA1B31007593840000' }]
    const client = createMock(seed)
    const result = await confirmMatch(client, {
      transactionId: 'tx-1',
      actorUserId: owner,
      allocations: [{ invoiceId: 'inv-26', amount_bani: 10000 }]
    })
    expect(result.applied).toBe(true)
    expect(client.tables.invoice_payments).toHaveLength(1)
    expect(client.tables.bank_match_rules).toHaveLength(1)
    expect(client.tables.bank_match_rules[0].counterparty_iban).toBe('RO11BBBB1B31007593840099')
    expect(client.tables.bank_match_rules[0].created_from_payment_id).toBeTruthy()
  })
})
