export const INVOICE_STATUS_LABEL: Record<string, { label: string; style: string }> = {
  draft: { label: 'Ciornă', style: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Emisă', style: 'bg-blue-50 text-blue-600' },
  spv: { label: 'Transferată în SPV', style: 'bg-teal-50 text-teal-700' },
  paid: { label: 'Plătită', style: 'bg-green-50 text-green-600' },
  overdue: { label: 'Restantă', style: 'bg-red-50 text-red-600' }
}

/** Issued, still collectible — includes invoices already uploaded to SPV. */
export const OPEN_INVOICE_STATUSES = ['sent', 'overdue', 'spv'] as const

/** Încasări list: open invoices plus fully paid ones. */
export const RECEIVABLE_LIST_STATUSES = ['sent', 'overdue', 'spv', 'paid'] as const

/** Hidden marker used when the DB check constraint still forbids status=spv. */
export const SPV_NOTE_MARK = '[[FACTURO_SPV]]'

/** Hidden marker for purchase invoices registered from e-Factura, if direction is missing. */
export const PURCHASE_NOTE_MARK = '[[FACTURO_PURCHASE]]'

export const ALREADY_SENT_TO_SPV = 'Factura a fost deja transmisă.'
export const EFACTURA_PROCESSING = 'Factura este încă în prelucrare la ANAF.'

export type EfacturaStatus = 'uploaded' | 'in_processing' | 'accepted' | 'rejected'

export function isDraftInvoice(status?: string | null) {
  return status === 'draft' || !status
}

export function isOpenReceivable(status?: string | null) {
  return status === 'sent' || status === 'overdue' || status === 'spv'
}

export function isEfacturaProcessing(invoice: {
  efactura_status?: string | null
}) {
  return invoice.efactura_status === 'uploaded' || invoice.efactura_status === 'in_processing'
}

export function alreadySentToSpv(invoice: {
  status?: string | null
  efactura_status?: string | null
  notes?: string | null
}) {
  return invoice.status === 'spv'
    || invoice.efactura_status === 'accepted'
    || (invoice.notes || '').includes(SPV_NOTE_MARK)
}

export function isTransferredToSpv(invoice: {
  status?: string | null
  efactura_status?: string | null
  notes?: string | null
}) {
  return alreadySentToSpv(invoice)
}

export function invoiceStatusAppearance(invoice: {
  status?: string | null
  efactura_status?: string | null
  notes?: string | null
}) {
  if (isDraftInvoice(invoice.status)) {
    return { ...INVOICE_STATUS_LABEL.draft, key: 'status.draft' as const }
  }
  if (isEfacturaProcessing(invoice)) {
    return { key: 'status.anafProcessing' as const, label: 'În prelucrare ANAF', style: 'bg-amber-50 text-amber-800' }
  }
  // A rejected e-Factura is not a validly issued invoice: that outranks "paid" until it is corrected and resent.
  if (invoice.efactura_status === 'rejected') {
    return invoice.status === 'paid'
      ? { key: 'status.rejectedPaid' as const, label: 'Respinsă ANAF · încasată', style: 'bg-red-50 text-red-700' }
      : { key: 'status.rejected' as const, label: 'Respinsă ANAF', style: 'bg-red-50 text-red-700' }
  }
  const transferred = alreadySentToSpv(invoice)
  if (invoice.status === 'paid' && transferred) {
    return { key: 'status.paidSpv' as const, label: 'Plătită · SPV', style: INVOICE_STATUS_LABEL.spv.style }
  }
  if (transferred) return { ...INVOICE_STATUS_LABEL.spv, key: 'status.spv' as const }
  if (invoice.status === 'paid') return { ...INVOICE_STATUS_LABEL.paid, key: 'status.paid' as const }
  if (invoice.status === 'overdue') return { ...INVOICE_STATUS_LABEL.overdue, key: 'status.overdue' as const }
  return { ...INVOICE_STATUS_LABEL.sent, key: 'status.sent' as const }
}

/** Issued documents that are not already in SPV. */
export function canSendToEfactura(invoice: {
  status?: string | null
  efactura_status?: string | null
  notes?: string | null
}) {
  return !isDraftInvoice(invoice.status) && !alreadySentToSpv(invoice) && !isEfacturaProcessing(invoice)
}

export function isCreditNote(typeCode?: string | null) {
  return typeCode === '381'
}

export function isPurchaseInvoice(invoice: {
  direction?: string | null
  notes?: string | null
}) {
  return invoice.direction === 'purchase' || (invoice.notes || '').includes(PURCHASE_NOTE_MARK)
}

export function notesWithPurchaseMark(notes?: string | null) {
  let next = notesWithSpvMark(notes)
  if (!(next || '').includes(PURCHASE_NOTE_MARK)) {
    next = next ? `${next}\n${PURCHASE_NOTE_MARK}` : PURCHASE_NOTE_MARK
  }
  return next
}

export function notesWithoutSpvMark(notes?: string | null) {
  const cleaned = (notes || '')
    .replace(/\s*\[\[FACTURO_SPV\]\]\s*/g, '')
    .replace(/\s*\[\[FACTURO_PURCHASE\]\]\s*/g, '')
    .trim()
  return cleaned || null
}

export function notesWithSpvMark(notes?: string | null) {
  if ((notes || '').includes(SPV_NOTE_MARK)) return notes || SPV_NOTE_MARK
  const clean = notesWithoutSpvMark(notes)
  return clean ? `${clean}\n${SPV_NOTE_MARK}` : SPV_NOTE_MARK
}
