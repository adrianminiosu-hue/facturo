export async function downloadInvoicePdf(invoiceId: string, userId: string) {
  window.open(`/api/invoice-pdf?id=${invoiceId}&userId=${userId}`, '_blank')
}

export async function downloadInvoiceXml(invoiceId: string, userId: string, filename: string) {
  const res = await fetch(`/api/invoice-xml?id=${invoiceId}&userId=${userId}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Eroare XML' }))
    throw new Error(data.error || 'Nu s-a putut genera XML-ul e-Factura. Completează județul, adresa și UM.')
  }
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
  URL.revokeObjectURL(href)
}

export async function sendInvoiceEmail(invoiceId: string, userId: string) {
  const res = await fetch('/api/send-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId, userId })
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Emailul nu a plecat')
}

export type SimulatedSpvUpload = {
  invoiceRef: string
  simulated: true
  environment: string
  endpoint: string
  executionStatus: string
  indexIncarcare?: string
  stare?: string
  error?: string
  uploadResponseXml: string
  statusResponseXml?: string
  note: string
  invoicePatch?: {
    status?: string | null
    efactura_status?: string | null
    notes?: string | null
  }
}

export type BulkSpvOutcome = 'accepted' | 'rejected' | 'skipped' | 'error'

export type BulkSpvResultItem = {
  invoiceId: string
  invoiceRef: string
  outcome: BulkSpvOutcome
  error?: string
}

export async function simulateSpvUpload(invoiceId: string, userId: string): Promise<SimulatedSpvUpload> {
  const res = await fetch('/api/efactura/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId, userId })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Eroare simulare SPV')
  return data
}

export async function simulateSpvUploads(
  invoiceIds: string[],
  userId: string
): Promise<{ simulated: true; note: string; results: BulkSpvResultItem[] }> {
  const res = await fetch('/api/efactura/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceIds, userId })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Eroare simulare SPV')
  return data
}
