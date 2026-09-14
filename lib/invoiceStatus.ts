export const INVOICE_STATUS_LABEL: Record<string, { label: string; style: string }> = {
  draft: { label: 'Ciornă', style: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Emisă', style: 'bg-blue-50 text-blue-600' },
  paid: { label: 'Plătită', style: 'bg-green-50 text-green-600' },
  overdue: { label: 'Restantă', style: 'bg-red-50 text-red-600' }
}

export function isDraftInvoice(status?: string | null) {
  return status === 'draft' || !status
}

/** Issued documents only — drafts are not sent to e-Factura. */
export function canSendToEfactura(status?: string | null) {
  return !isDraftInvoice(status)
}

export function isCreditNote(typeCode?: string | null) {
  return typeCode === '381'
}
