import { at, kids, numAt, parseXml, textAt, type XmlNode } from '@/lib/xmlTree'
import { isCiiDocument, parseCiiInvoice } from '@/lib/ciiInvoice'

export type UblParty = {
  name: string
  /** Digits only, without the RO prefix. */
  cui: string
  vatId: string
  address: string
  city: string
  county: string
  country: string
}

export type UblLine = {
  description: string
  quantity: number
  unitCode: string
  unitPrice: number
  /** Line net amount as stated by the issuer (after line allowances/charges). */
  net: number
  vatRate: number
  vatCategory: string
}

export type UblInvoice = {
  /** Source syntax: UBL (Invoice / CreditNote) or CII (CrossIndustryInvoice). */
  syntax: 'UBL' | 'CII'
  typeCode: string
  isCreditNote: boolean
  id: string
  series: string
  number: string
  issueDate: string
  dueDate: string
  currency: string
  /** Lei per 1 unit of `currency` when the invoice is not in RON and states its VAT in RON. */
  fxRate: number | null
  supplier: UblParty
  customer: UblParty
  lines: UblLine[]
  totals: {
    net: number
    vat: number
    total: number
    prepaid: number
    payable: number
  }
  notes: string[]
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function cuiDigits(value: string) {
  return String(value || '').replace(/^\s*RO/i, '').replace(/\D/g, '')
}

/** "NT1048" → NT / 1048; "FCT 0032" → FCT / 0032; "A-12/2026" → A / 12/2026; "12345" → '' / 12345. */
export function splitInvoiceId(id: string) {
  const value = String(id || '').trim()
  const m = value.match(/^([^\d]*?)[\s\-_/.#]*(\d.*)$/)
  if (!m) return { series: value, number: '' }
  return { series: m[1].trim(), number: m[2].trim() }
}

function party(node: XmlNode | undefined): UblParty {
  const p = at(node, 'Party')
  const taxIds = kids(p, 'PartyTaxScheme').map(t => textAt(t, 'CompanyID')).filter(Boolean)
  const legalId = textAt(p, 'PartyLegalEntity/CompanyID')
  const vatId = taxIds.find(id => /^[A-Z]{2}/i.test(id)) || taxIds[0] || ''
  const address = at(p, 'PostalAddress')
  const street = [textAt(address, 'StreetName'), textAt(address, 'AdditionalStreetName'), textAt(address, 'AddressLine/Line')]
    .filter(Boolean)
    .join(', ')
  return {
    name: textAt(p, 'PartyLegalEntity/RegistrationName') || textAt(p, 'PartyName/Name'),
    cui: cuiDigits(vatId || legalId || textAt(p, 'EndpointID')),
    vatId,
    address: street,
    city: textAt(address, 'CityName'),
    county: textAt(address, 'CountrySubentity'),
    country: (textAt(address, 'Country/IdentificationCode') || 'RO').toUpperCase()
  }
}

function taxTotalIn(root: XmlNode, currency: string) {
  const totals = kids(root, 'TaxTotal')
  const match = totals.find(t => (at(t, 'TaxAmount')?.attrs.currencyID || currency) === currency) || totals[0]
  return match ? numAt(match, 'TaxAmount') : 0
}

/**
 * Reads an invoice as received from SPV: UBL 2.1 Invoice / CreditNote or CII CrossIndustryInvoice
 * (both CIUS-RO / EN 16931). The name stays for history; the result shape is the same for both.
 */
export function parseUblInvoice(xml: string): UblInvoice {
  const root = parseXml(xml)
  if (isCiiDocument(root)) return parseCiiInvoice(root)
  if (root.name !== 'Invoice' && root.name !== 'CreditNote') {
    throw new Error(`Documentul nu este o factură UBL sau CII (${root.name}).`)
  }
  const isCreditNote = root.name === 'CreditNote'
  const id = textAt(root, 'ID')
  const currency = (textAt(root, 'DocumentCurrencyCode') || 'RON').toUpperCase()
  const taxCurrency = textAt(root, 'TaxCurrencyCode').toUpperCase()
  const issueDate = textAt(root, 'IssueDate')
  const dueDate = textAt(root, 'DueDate')
    || kids(root, 'PaymentMeans').map(pm => textAt(pm, 'PaymentDueDate')).find(Boolean)
    || issueDate

  const lineTag = isCreditNote ? 'CreditNoteLine' : 'InvoiceLine'
  const quantityTag = isCreditNote ? 'CreditedQuantity' : 'InvoicedQuantity'
  const lines: UblLine[] = kids(root, lineTag).map(line => {
    const qtyNode = at(line, quantityTag)
    const quantity = Number(qtyNode?.text.trim() || 0) || 0
    const baseQty = numAt(line, 'Price/BaseQuantity') || 1
    const net = numAt(line, 'LineExtensionAmount')
    const price = numAt(line, 'Price/PriceAmount') / baseQty
    const category = at(line, 'Item/ClassifiedTaxCategory')
    return {
      description: textAt(line, 'Item/Name') || textAt(line, 'Item/Description') || 'Articol',
      quantity,
      unitCode: qtyNode?.attrs.unitCode || 'H87',
      unitPrice: price || (quantity ? round2(net / quantity) : net),
      net,
      vatRate: numAt(category, 'Percent'),
      vatCategory: textAt(category, 'ID') || 'S'
    }
  })

  const totalsNode = at(root, 'LegalMonetaryTotal')
  const vat = taxTotalIn(root, currency)
  let fxRate: number | null = null
  if (currency !== 'RON' && taxCurrency === 'RON') {
    const vatRon = taxTotalIn(root, 'RON')
    if (vat > 0 && vatRon > 0) fxRate = Math.round((vatRon / vat) * 1e4) / 1e4
  }

  const { series, number } = splitInvoiceId(id)
  return {
    syntax: 'UBL',
    typeCode: textAt(root, isCreditNote ? 'CreditNoteTypeCode' : 'InvoiceTypeCode') || (isCreditNote ? '381' : '380'),
    isCreditNote,
    id,
    series,
    number,
    issueDate,
    dueDate,
    currency,
    fxRate,
    supplier: party(at(root, 'AccountingSupplierParty')),
    customer: party(at(root, 'AccountingCustomerParty')),
    lines,
    totals: {
      net: numAt(totalsNode, 'TaxExclusiveAmount'),
      vat,
      total: numAt(totalsNode, 'TaxInclusiveAmount'),
      prepaid: numAt(totalsNode, 'PrepaidAmount'),
      payable: numAt(totalsNode, 'PayableAmount')
    },
    notes: kids(root, 'Note').map(n => n.text.trim()).filter(Boolean)
  }
}

/** Metadata of ANAF's signature file (semnatura_<id>.xml) in the download archive. Not a cryptographic check. */
export function readAnafSignature(xml: string) {
  const root = parseXml(xml)
  const find = (node: XmlNode, name: string): XmlNode | undefined => {
    if (node.name === name) return node
    for (const c of node.children) {
      const hit = find(c, name)
      if (hit) return hit
    }
    return undefined
  }
  return {
    subject: (find(root, 'X509SubjectName')?.text || '').trim(),
    serial: (find(root, 'X509SerialNumber')?.text || '').trim(),
    signedAt: (find(root, 'SigningTime')?.text || '').trim(),
    algorithm: find(root, 'SignatureMethod')?.attrs.Algorithm || '',
    digest: (find(root, 'DigestValue')?.text || '').trim()
  }
}
