export { AUTO_APPLY_THRESHOLD, RULE } from '@/lib/bank/matching/constants'
export { matchBankTransaction } from '@/lib/bank/matching/engine'
export { extractInvoiceRefs } from '@/lib/bank/matching/extractRefs'
export {
  applyMatch,
  applyMatchWithContext,
  confirmMatch,
  ignoreMatch,
  loadMatchContext,
  logBankMatchEvent,
  undoAllocation,
  undoMatch
} from '@/lib/bank/matching/apply'
export { fromBani, toBani } from '@/lib/bank/matching/types'
export type { EngineInput, MatchCandidate, MatchInvoice, MatchTransaction } from '@/lib/bank/matching/types'
