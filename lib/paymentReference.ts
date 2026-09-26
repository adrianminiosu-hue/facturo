/**
 * What the customer should write in the payment details ("FCT0032"). Compact, no spaces or dashes:
 * banks cut or mangle punctuation, and this is the form the statement matcher reads with certainty.
 */
export function paymentReference(invoice: { series?: string | null; invoice_number?: string | number | null }) {
  const series = String(invoice.series || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const number = String(invoice.invoice_number ?? '').replace(/[^0-9A-Za-z]/g, '')
  return `${series}${number}`
}

/** Shown next to the reference on the PDF and in emails. */
export const PAYMENT_REFERENCE_HINT = 'Vă rugăm să treceți referința în detaliile plății.'
