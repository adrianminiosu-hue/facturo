export type InvoiceOpenRow = {
  status?: string | null
  efactura_status?: string | null
  notes?: string | null
  due_date?: string | null
}

export function invoiceOpenStatus(inv: InvoiceOpenRow, today = new Date().toISOString().slice(0, 10)) {
  if (!inv.status || inv.status === 'draft') return 'draft'
  if (
    inv.efactura_status === 'uploaded'
    || inv.efactura_status === 'in_processing'
    || inv.efactura_status === 'accepted'
    || (inv.notes || '').includes('[[FACTURO_SPV]]')
  ) {
    return 'spv'
  }
  if (inv.due_date && inv.due_date < today) return 'overdue'
  return 'sent'
}
