import { describe, expect, it } from 'vitest'
import { rememberSupplierIbans } from '@/lib/supplierIbans'

type Row = Record<string, unknown>

function mockDb(tables: Record<string, Row[]>) {
  return {
    tables,
    from(table: string) {
      tables[table] ||= []
      const filters: Array<[string, unknown]> = []
      const rows = () => tables[table].filter(row => filters.every(([key, value]) => row[key] === value))
      const api = {
        select: () => api,
        eq: (key: string, value: unknown) => {
          filters.push([key, value])
          return api
        },
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows(), error: null }),
        insert: async (list: Row[]) => {
          tables[table].push(...list)
          return { error: null }
        },
        update: (patch: Row) => ({
          eq: async (key: string, value: unknown) => {
            for (const row of tables[table]) if (row[key] === value) Object.assign(row, patch)
            return { error: null }
          }
        })
      }
      return api
    }
  }
}

describe('rememberSupplierIbans', () => {
  it('adds a new supplier IBAN as its default account and fills the legacy column', async () => {
    const db = mockDb({ clients: [{ id: 's1', iban: '' }], client_bank_accounts: [] })
    const added = await rememberSupplierIbans(db, {
      supplier: { id: 's1', iban: '' },
      ibans: ['RO49 AAAA 1B31 0075 9384 0000'],
      ownerUserId: 'u1',
      companyId: 'c1',
      currency: 'RON'
    })
    expect(added).toBe(1)
    expect(db.tables.client_bank_accounts).toEqual([
      expect.objectContaining({ client_id: 's1', iban: 'RO49AAAA1B31007593840000', iban_currency: 'LEI', is_default: true })
    ])
    expect(db.tables.clients[0].iban).toBe('RO49AAAA1B31007593840000')
  })

  it('never duplicates or overrides what the user already has', async () => {
    const db = mockDb({
      clients: [{ id: 's1', iban: 'RO49AAAA1B31007593840000' }],
      client_bank_accounts: [{ client_id: 's1', iban: 'RO49AAAA1B31007593840000', iban_currency: 'LEI', is_default: true }]
    })
    const added = await rememberSupplierIbans(db, {
      supplier: { id: 's1', iban: 'RO49AAAA1B31007593840000' },
      ibans: ['RO49AAAA1B31007593840000', 'RO12BTRL0000000000000001'],
      ownerUserId: 'u1'
    })
    expect(added).toBe(1)
    expect(db.tables.client_bank_accounts).toHaveLength(2)
    expect(db.tables.client_bank_accounts[1]).toMatchObject({ iban: 'RO12BTRL0000000000000001', is_default: false })
    expect(db.tables.clients[0].iban).toBe('RO49AAAA1B31007593840000')
  })
})
