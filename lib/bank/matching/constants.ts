export const AUTO_APPLY_THRESHOLD = 90
export const OVERPAYMENT_EPSILON_BANI = 1
export const DUPLICATE_REF_MAX_CONFIDENCE = 70
/** A payment that is short of an invoice by at most this much is proposed as that invoice (bank fees withheld, rounding). */
export const NEAR_AMOUNT_MAX_BANI = 10000
export const NEAR_AMOUNT_MAX_RATIO = 0.01
/** Open invoices of one client searched for a combination that adds up to the payment. */
export const SUBSET_MAX_INVOICES = 14
export const SUBSET_MAX_SIZE = 6

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
  amountNear: 'amount_near',
  alreadyCollected: 'already_collected'
} as const

export type MatchRule = (typeof RULE)[keyof typeof RULE]
