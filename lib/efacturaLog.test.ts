import { describe, expect, it } from 'vitest'
import { summarizeEfacturaLog, type EfacturaLogRow } from './efacturaLog'

let minute = 0
const row = (r: Partial<EfacturaLogRow>): EfacturaLogRow => ({
  direction: 'out', operation: 'upload', outcome: 'ok',
  created_at: new Date(Date.UTC(2026, 8, 26, 8, minute++)).toISOString(),
  ...r
})

describe('summarizeEfacturaLog', () => {
  it('counts each invoice once, by its latest ANAF answer', () => {
    const rows = [
      // A: accepted first time
      row({ invoice_id: 'A', operation: 'upload', outcome: 'ok' }), row({ invoice_id: 'A', operation: 'status', outcome: 'ok' }),
      // B: ANAF down twice, then accepted
      row({ invoice_id: 'B', outcome: 'unavailable', message: 'ANAF este indisponibil momentan (HTTP 503).' }),
      row({ invoice_id: 'B', outcome: 'unavailable', message: 'ANAF este indisponibil momentan (HTTP 503).' }),
      row({ invoice_id: 'B', operation: 'upload', outcome: 'ok' }), row({ invoice_id: 'B', operation: 'status', outcome: 'ok' }),
      // C: rejected, corrected, accepted
      row({ invoice_id: 'C', operation: 'status', outcome: 'rejected', message: 'BR-RO-110' }),
      row({ invoice_id: 'C', operation: 'upload', outcome: 'ok' }), row({ invoice_id: 'C', operation: 'status', outcome: 'ok' }),
      // D: rejected
      row({ invoice_id: 'D', operation: 'status', outcome: 'rejected', message: 'BR-RO-110' }),
      // E: still processing
      row({ invoice_id: 'E', operation: 'status', outcome: 'processing' }),
      // F: stopped before sending
      row({ invoice_id: 'F', operation: 'validate', outcome: 'invalid', message: 'CUI: CUI vanzator incorect' }),
      // imports
      row({ direction: 'in', operation: 'import', outcome: 'ok', message_id: '1' }),
      row({ direction: 'in', operation: 'import', outcome: 'ok', message_id: '2' }),
      row({ direction: 'in', operation: 'import', outcome: 'skipped', message_id: '3' }),
      row({ direction: 'in', operation: 'import', outcome: 'error', message_id: '4', message: 'Arhiva nu conține factura XML.' }),
      row({ direction: 'in', operation: 'import', outcome: 'ok', message_id: '4' }) // imported on the next run
    ]
    const s = summarizeEfacturaLog(rows.reverse()) // order of the input must not matter
    expect(s.out).toEqual({ sent: 5, accepted: 3, rejected: 1, pending: 1, acceptedFirstTry: 1, recoveredAfterOutage: 1, blockedBeforeSend: 1, acceptanceRate: 75 })
    expect(s.in).toEqual({ messages: 4, imported: 3, alreadyKnown: 1, failed: 0, importRate: 100 })
    expect(s.transferRate).toBe(87.5) // (3 + 3 + 1) / (7 + 1)
    expect(s.outages).toBe(2)
    expect(s.topErrors[0]).toEqual({ message: 'BR-RO-110', count: 2 })
  })

  it('has no rates without data', () => {
    const s = summarizeEfacturaLog([])
    expect(s.transferRate).toBeNull()
    expect(s.out.acceptanceRate).toBeNull()
  })
})
