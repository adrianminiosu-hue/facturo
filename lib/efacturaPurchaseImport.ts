import { addDaysIso, calendarDateInBucharest } from '@/lib/dates'

export const SPV_TEST_LIST_URL = 'https://api.anaf.ro/test/FCTEL/rest/listaMesajeFactura'
export const SPV_PURCHASE_NOTE =
  'Simulare mediu test ANAF. Nu s-a folosit certificat și nu s-a trimis nimic în SPV real.'

export type PurchaseInvoiceLine = {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  vatRate: number
}

export type PurchaseInvoiceSeal = {
  valid: true
  issuer: string
  signedAt: string
  certificate: string
  serial: string
  algorithm: string
  digest: string
}

export type SimulatedPurchaseInvoice = {
  id: string
  indexIncarcare: string
  idDescarcare: string
  supplierName: string
  supplierCui: string
  supplierAddress: string
  buyerName: string
  buyerCui: string
  buyerAddress: string
  series: string
  invoiceNumber: string
  issueDate: string
  dueDate: string
  currency: 'RON'
  lines: PurchaseInvoiceLine[]
  subtotal: number
  vat: number
  total: number
  amountPaid?: number
  paymentStatus?: string
  seal: PurchaseInvoiceSeal
}

export type PurchaseBuyer = {
  id?: string | null
  company_name?: string | null
  cui?: string | null
  address?: string | null
  city?: string | null
}

function numericCif(cui?: string | null) {
  return (cui || '').replace(/\D/g, '') || '00000000'
}

function partyLabel(name?: string | null) {
  return (name || '').trim() || 'Firma ta'
}

function partyCui(cui?: string | null) {
  const digits = numericCif(cui)
  return digits === '00000000' ? 'RO00000000' : `RO${digits}`
}

function partyAddress(buyer: PurchaseBuyer) {
  return [buyer.address, buyer.city].map(part => String(part || '').trim()).filter(Boolean).join(', ') || 'România'
}

function lineAmount(line: PurchaseInvoiceLine) {
  return roundMoney(line.quantity * line.unitPrice)
}

function lineVat(line: PurchaseInvoiceLine) {
  return roundMoney(lineAmount(line) * (line.vatRate / 100))
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function totals(lines: PurchaseInvoiceLine[]) {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + lineAmount(line), 0))
  const vat = roundMoney(lines.reduce((sum, line) => sum + lineVat(line), 0))
  return { subtotal, vat, total: roundMoney(subtotal + vat) }
}

function stableDigits(seed: string, length: number) {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const value = Math.abs(hash >>> 0).toString().padStart(length, '7')
  return value.slice(-length)
}

function digest(seed: string) {
  const raw = `${seed}:efactura-seal`
  let hash = 0
  for (let i = 0; i < raw.length; i++) hash = (hash * 33 + raw.charCodeAt(i)) >>> 0
  return hash.toString(16).padStart(8, '0').repeat(8).slice(0, 64)
}

export function sealFor(id: string, signedAt: string): PurchaseInvoiceSeal {
  return {
    valid: true,
    issuer: 'Ministerul Finanțelor — ANAF e-Factura (simulare test)',
    signedAt,
    certificate: 'CN=ANAF e-Factura TEST, O=Agenția Națională de Administrare Fiscală, C=RO',
    serial: `ANAF-TEST-${stableDigits(id, 10)}`,
    algorithm: 'SHA-256 with RSA',
    digest: digest(id)
  }
}

export function simulatedPurchaseInvoices(buyer: PurchaseBuyer): SimulatedPurchaseInvoice[] {
  const buyerName = partyLabel(buyer.company_name)
  const buyerCui = partyCui(buyer.cui)
  const buyerAddress = partyAddress(buyer)
  const companyKey = buyer.id || buyerCui || buyerName
  const firstDate = calendarDateInBucharest(-12)
  const secondDate = calendarDateInBucharest(-5)

  const firstLines: PurchaseInvoiceLine[] = [
    { description: 'Abonament internet business', quantity: 1, unit: 'LUN', unitPrice: 189, vatRate: 19 },
    { description: 'Garanție echipamente rețea', quantity: 1, unit: 'BUC', unitPrice: 95, vatRate: 19 }
  ]
  const secondLines: PurchaseInvoiceLine[] = [
    { description: 'Hârtie A4 80g (top)', quantity: 8, unit: 'BUC', unitPrice: 24.5, vatRate: 19 },
    { description: 'Toner laser negru', quantity: 2, unit: 'BUC', unitPrice: 215, vatRate: 19 }
  ]

  const firstTotals = totals(firstLines)
  const secondTotals = totals(secondLines)
  const firstId = `spv-${stableDigits(`${companyKey}:1`, 12)}`
  const secondId = `spv-${stableDigits(`${companyKey}:2`, 12)}`

  return [
    {
      id: firstId,
      indexIncarcare: stableDigits(`${companyKey}:idx:1`, 12),
      idDescarcare: `${stableDigits(`${companyKey}:idx:1`, 12)}1`,
      supplierName: 'NordNet Telecom SRL',
      supplierCui: 'RO37829104',
      supplierAddress: 'Str. Aviatorilor 12, București',
      buyerName,
      buyerCui,
      buyerAddress,
      series: 'NT',
      invoiceNumber: '1048',
      issueDate: firstDate,
      dueDate: addDaysIso(firstDate, 15),
      currency: 'RON',
      lines: firstLines,
      ...firstTotals,
      seal: sealFor(firstId, `${firstDate}T08:41:12+03:00`)
    },
    {
      id: secondId,
      indexIncarcare: stableDigits(`${companyKey}:idx:2`, 12),
      idDescarcare: `${stableDigits(`${companyKey}:idx:2`, 12)}1`,
      supplierName: 'Paper & Print SA',
      supplierCui: 'RO29184736',
      supplierAddress: 'Bd. 21 Decembrie 104, Cluj-Napoca',
      buyerName,
      buyerCui,
      buyerAddress,
      series: 'PP',
      invoiceNumber: '3312',
      issueDate: secondDate,
      dueDate: addDaysIso(secondDate, 15),
      currency: 'RON',
      lines: secondLines,
      ...secondTotals,
      seal: sealFor(secondId, `${secondDate}T14:17:44+03:00`)
    }
  ]
}

export function findSimulatedPurchaseInvoice(buyer: PurchaseBuyer, id: string) {
  return simulatedPurchaseInvoices(buyer).find(invoice => invoice.id === id) || null
}

export function spvListEndpoint(cui?: string | null) {
  return `${SPV_TEST_LIST_URL}?zile=60&cif=${numericCif(cui)}`
}

export { numericCif }
