import { describe, expect, it } from 'vitest'
import { matchStats } from '@/lib/bank/matchStats'

describe('matchStats', () => {
  it('splits statement lines into automatic, clicked and pending, leaving ignored ones out', () => {
    const stats = matchStats(
      [
        { id: 'a', match_status: 'matched' },
        { id: 'b', match_status: 'matched' },
        { id: 'c', match_status: 'partially_matched' },
        { id: 'd', match_status: 'suggested' },
        { id: 'e', match_status: 'unmatched' },
        { id: 'f', match_status: 'ignored' }
      ],
      [
        { bank_transaction_id: 'a', match_rule: 'invoice_ref' },
        { bank_transaction_id: 'b', match_rule: 'manual_confirm' },
        { bank_transaction_id: 'c', match_rule: 'already_collected' },
        { bank_transaction_id: null, match_rule: 'manual_confirm' }
      ]
    )
    expect(stats).toMatchObject({ total: 5, auto: 2, confirmed: 1, pending: 2, ignored: 1 })
    expect(stats.autoRate).toBeCloseTo(0.4)
    expect(stats.resolvedRate).toBeCloseTo(0.6)
  })

  it('has no rate when there is nothing to measure', () => {
    expect(matchStats([{ id: 'x', match_status: 'ignored' }], []).autoRate).toBeNull()
  })
})
