export const AUTO_APPLY_THRESHOLD = 90
export const OVERPAYMENT_EPSILON_BANI = 1
export const DUPLICATE_REF_MAX_CONFIDENCE = 70

export const RULE = {
  invoiceRef: 'invoice_ref',
  invoiceRefMulti: 'invoice_ref_multi',
  invoiceRefPartial: 'invoice_ref_partial',
  ibanAmount: 'iban_amount',
  multiInvoice: 'multi_invoice',
  partialOldest: 'partial_oldest',
  nameAmount: 'name_amount',
  duplicateRef: 'duplicate_ref',
  overpayment: 'overpayment',
  alreadyCollected: 'already_collected'
} as const

export type MatchRule = (typeof RULE)[keyof typeof RULE]
