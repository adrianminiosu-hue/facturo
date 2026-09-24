import type { MatchRule } from '@/lib/bank/matching/constants'

export type InvoiceDirection = 'issued' | 'purchase'

export type MatchInvoice = {
  id: string
  series: string
  invoice_number: string
  client_id: string | null
  client_name: string
  client_cui: string
  client_ibans: string[]
  issue_date: string | null
  due_date: string | null
  remaining_bani: number
  currency: string
  direction: InvoiceDirection
}

export type MatchTransaction = {
  amount_bani: number
  currency: string
  counterparty_name: string
  counterparty_iban: string
  description: string
}

export type LearnedRule = {
  client_id: string
  counterparty_iban: string | null
  counterparty_name_norm: string | null
}

export type EngineInput = {
  transaction: MatchTransaction
  invoices: MatchInvoice[]
  seriesList: string[]
  defaultSeries: string
  rules: LearnedRule[]
}

export type MatchAllocation = {
  invoiceId: string
  amount_bani: number
}

export type MatchCandidate = {
  allocations: MatchAllocation[]
  confidence: number
  rule: MatchRule
  overpayment_bani: number
  auto: boolean
}

export function toBani(amount: number) {
  return Math.round(Number(amount) * 100)
}

export function fromBani(bani: number) {
  return Math.round(bani) / 100
}
