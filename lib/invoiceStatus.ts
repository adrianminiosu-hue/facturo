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

export const ALREADY_SENT_TO_SPV = 'Factura a fost deja transmisă.'

export function isDraftInvoice(status?: string | null) {
  return status === 'draft' || !status
}

export function isOpenReceivable(status?: string | null) {
  return status === 'sent' || status === 'overdue' || status === 'spv'
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
  if (invoice.status === 'paid') return false
  return alreadySentToSpv(invoice)
}

/** Issued documents that are not already in SPV. */
export function canSendToEfactura(invoice: {
  status?: string | null
  efactura_status?: string | null
  notes?: string | null
}) {
  return !isDraftInvoice(invoice.status) && !alreadySentToSpv(invoice)
}

export function isCreditNote(typeCode?: string | null) {
  return typeCode === '381'
}

export function notesWithoutSpvMark(notes?: string | null) {
  const cleaned = (notes || '').replace(/\s*\[\[FACTURO_SPV\]\]\s*/g, '').trim()
  return cleaned || null
}

export function notesWithSpvMark(notes?: string | null) {
  if ((notes || '').includes(SPV_NOTE_MARK)) return notes || SPV_NOTE_MARK
  const clean = notesWithoutSpvMark(notes)
  return clean ? `${clean}\n${SPV_NOTE_MARK}` : SPV_NOTE_MARK
}

export function invoiceStatusAppearance(invoice: {
  status?: string | null
  efactura_status?: string | null
  notes?: string | null
}) {
  if (isDraftInvoice(invoice.status)) return INVOICE_STATUS_LABEL.draft
  if (invoice.status === 'paid') return INVOICE_STATUS_LABEL.paid
  if (isTransferredToSpv(invoice)) return INVOICE_STATUS_LABEL.spv
  return INVOICE_STATUS_LABEL[invoice.status || 'sent'] || INVOICE_STATUS_LABEL.sent
}
