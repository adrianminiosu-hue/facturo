/**
 * How much of the statement the app resolved on its own. Counted per statement line, ignored lines
 * left out (bank fees, own transfers): auto = booked without a click, confirmed = the user clicked
 * (a suggestion or a manual allocation), pending = still waiting in the inbox.
 */
export type MatchStats = {
  total: number
  auto: number
  confirmed: number
  pending: number
  ignored: number
  /** 0..1 of `total`; null when there is nothing to measure. */
  autoRate: number | null
  resolvedRate: number | null
}

export const MANUAL_RULE = 'manual_confirm'

export function matchStats(
  txs: Array<{ id: string; match_status?: string | null }>,
  payments: Array<{ bank_transaction_id?: string | null; match_rule?: string | null }>
): MatchStats {
  const clicked = new Set(
    payments.filter(payment => payment.bank_transaction_id && payment.match_rule === MANUAL_RULE).map(payment => payment.bank_transaction_id)
  )
  let auto = 0
  let confirmed = 0
  let pending = 0
  let ignored = 0
  for (const tx of txs) {
    const status = tx.match_status || 'unmatched'
    if (status === 'ignored') ignored += 1
    else if (status === 'matched' || status === 'partially_matched') {
      if (clicked.has(tx.id)) confirmed += 1
      else auto += 1
    } else pending += 1
  }
  const total = auto + confirmed + pending
  return {
    total,
    auto,
    confirmed,
    pending,
    ignored,
    autoRate: total ? auto / total : null,
    resolvedRate: total ? (auto + confirmed) / total : null
  }
}
