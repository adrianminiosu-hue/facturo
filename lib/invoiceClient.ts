import { authHeaders } from '@/lib/authHeaders'

/** Opens a PDF from our API in a new tab, sending the session token instead of a userId in the URL. */
async function openAuthedPdf(url: string) {
  const tab = window.open('', '_blank')
  try {
    const res = await fetch(url, { headers: await authHeaders() })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Eroare PDF' }))
      throw new Error(data.error || 'Nu s-a putut genera PDF-ul.')
    }
    const href = URL.createObjectURL(await res.blob())
    if (tab) tab.location.href = href
    else window.location.href = href
    setTimeout(() => URL.revokeObjectURL(href), 60_000)
  } catch (error) {
    tab?.close()
    alert(error instanceof Error ? error.message : 'Nu s-a putut deschide PDF-ul.')
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function downloadInvoicePdf(invoiceId: string, _userId?: string) {
  await openAuthedPdf(`/api/invoice-pdf?id=${encodeURIComponent(invoiceId)}`)
}

export async function downloadInvoiceXml(invoiceId: string, userId: string, filename: string) {
  const res = await fetch(`/api/invoice-xml?id=${encodeURIComponent(invoiceId)}`, { headers: await authHeaders() })
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
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ invoiceId, userId })
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Emailul nu a plecat')
}

export type SimulatedSpvUpload = {
  invoiceRef: string
  simulated?: boolean
  code?: string
  environment: string
  endpoint?: string
  executionStatus: string
  indexIncarcare?: string
  stare?: string
  error?: string
  uploadResponseXml?: string
  statusResponseXml?: string
  note: string
  invoicePatch?: {
    status?: string | null
    efactura_status?: string | null
    notes?: string | null
    efactura_index?: string | null
    efactura_error?: string | null
  }
}

export type BulkSpvOutcome = 'accepted' | 'rejected' | 'skipped' | 'error' | 'processing'

export type BulkSpvResultItem = {
  invoiceId: string
  invoiceRef: string
  outcome: BulkSpvOutcome
  error?: string
}

export async function uploadToEfactura(invoiceId: string, userId: string): Promise<SimulatedSpvUpload> {
  const res = await fetch('/api/efactura/upload', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ invoiceId, userId })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Eroare e-Factura')
  return data
}

export const simulateSpvUpload = uploadToEfactura

export async function simulateSpvUploads(
  invoiceIds: string[],
  userId: string
): Promise<{ simulated?: boolean; note: string; results: BulkSpvResultItem[] }> {
  const res = await fetch('/api/efactura/upload', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ invoiceIds, userId })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Eroare e-Factura')
  return data
}

export type EfacturaConnection = {
  configured: boolean
  connected: boolean
  missingTable?: boolean
  environment?: string
  expiresAt?: string | null
  certSerial?: string | null
  error?: string
}

export async function loadEfacturaConnection(userId: string, ownerUserId?: string): Promise<EfacturaConnection> {
  const params = new URLSearchParams({ userId })
  if (ownerUserId) params.set('ownerUserId', ownerUserId)
  const res = await fetch(`/api/efactura/oauth/status?${params.toString()}`, { headers: await authHeaders() })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Eroare conexiune e-Factura')
  return data
}

/** Asks the server (authenticated) for the ANAF authorize URL, then navigates there. */
export async function startEfacturaConnect(ownerUserId?: string) {
  const res = await fetch('/api/efactura/oauth/start', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ownerUserId })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.url) throw new Error(data.error || 'Conectarea ANAF nu a putut porni.')
  window.location.href = data.url
}

export async function disconnectEfactura(userId: string, ownerUserId?: string) {
  const res = await fetch('/api/efactura/oauth/disconnect', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId, ownerUserId })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Nu s-a putut deconecta e-Factura.')
  return data
}

export type SimulatedPurchaseImport = {
  simulated: true
  environment: string
  endpoint: string
  buyerName: string
  buyerCui: string
  count: number
  added?: number
  skipped?: number
  catalogInserted?: number
  note: string
  invoices: import('@/lib/efacturaPurchaseImport').SimulatedPurchaseInvoice[]
}

export async function importPurchaseInvoicesFromEfactura(
  userId: string,
  company?: {
    id?: string | null
    company_name?: string | null
    cui?: string | null
    address?: string | null
    city?: string | null
  } | null
): Promise<SimulatedPurchaseImport> {
  const res = await fetch('/api/efactura/import-purchases', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      userId,
      companyId: company?.id,
      company
    })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Eroare interogare e-Factura')
  return data
}

export function openPurchaseInvoicePdf(invoiceId: string, userId: string, companyId?: string | null) {
  const params = new URLSearchParams({ id: invoiceId, userId })
  if (companyId) params.set('companyId', companyId)
  params.delete('userId')
  return openAuthedPdf(`/api/efactura/purchase-pdf?${params.toString()}`)
}
