import { notesWithoutSpvMark } from '@/lib/invoiceStatus'
import { computeInvoiceTotals, roundMoney } from '@/lib/invoiceMath'
import { VAT_ON_COLLECTION_MENTION } from '@/lib/invoiceNotes'

export { roundMoney }

export const INVOICE_TYPE_CODES = [
  { code: '380', label: 'Factură' },
  { code: '386', label: 'Factură avans' },
  { code: '381', label: 'Notă de creditare' },
  { code: '384', label: 'Factură corectată' },
  { code: '389', label: 'Autofactură' },
  { code: '751', label: 'Factură — informații contabile' }
] as const

export const PAYMENT_MEANS_CODES = [
  { code: '42', label: 'Virament bancar' },
  { code: '31', label: 'Transfer debit' },
  { code: '10', label: 'Numerar' },
  { code: '48', label: 'Card bancar' },
  { code: '49', label: 'Debit direct' }
] as const

export const UNIT_CODES = [
  { code: 'H87', label: 'Bucată' },
  { code: 'C62', label: 'Unitate' },
  { code: 'E48', label: 'Serviciu' },
  { code: 'HUR', label: 'Oră' },
  { code: 'DAY', label: 'Zi' },
  { code: 'MON', label: 'Lună' },
  { code: 'KGM', label: 'Kilogram' },
  { code: 'LTR', label: 'Litru' },
  { code: 'MTR', label: 'Metru' },
  { code: 'MTK', label: 'm²' },
  { code: 'MTQ', label: 'm³' },
  { code: 'KWH', label: 'kWh' },
  { code: 'SET', label: 'Set' }
] as const

export const VAT_CATEGORIES = [
  { code: 'S', label: 'S — Cota standard / redusă' },
  { code: 'Z', label: 'Z — Cotă zero' },
  { code: 'E', label: 'E — Scutit' },
  { code: 'AE', label: 'AE — Taxare inversă' },
  { code: 'K', label: 'K — Intra-comunitar' },
  { code: 'G', label: 'G — Export' },
  { code: 'O', label: 'O — Nu face obiectul TVA' }
] as const

export function vatCategoryFromRate(rate: number, current?: string) {
  if (rate > 0) return 'S'
  if (current && current !== 'S') return current
  return 'Z'
}

export function unitLabel(code?: string | null) {
  return UNIT_CODES.find(unit => unit.code === code)?.label || code || ''
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function el(name: string, value?: string | number | null, attrs?: Record<string, string>) {
  if (value === undefined || value === null || value === '') return ''
  const attr = attrs
    ? Object.entries(attrs).map(([k, v]) => ` ${k}="${xmlEscape(v)}"`).join('')
    : ''
  return `<${name}${attr}>${xmlEscape(String(value))}</${name}>`
}

export type EfacturaParty = {
  company_name: string
  cui: string
  reg_com?: string | null
  address: string
  city: string
  county_code: string
  postal_code?: string | null
  country?: string | null
  vat_registered?: boolean | null
  email?: string | null
  phone?: string | null
  contact_person?: string | null
  iban?: string | null
  bank_name?: string | null
  bic?: string | null
  vat_on_collection?: boolean | null
  is_public_institution?: boolean | null
}

export type EfacturaLine = {
  description: string
  quantity: number
  unit_price: number
  tva_rate: number
  unit_code?: string | null
  vat_category?: string | null
  vat_exemption_reason?: string | null
  discount_percent?: number | null
  discount_amount?: number | null
}

export type EfacturaInvoice = {
  series: string
  invoice_number: string
  issue_date: string
  due_date?: string | null
  notes?: string | null
  invoice_type_code?: string | null
  currency?: string | null
  payment_means_code?: string | null
  tax_point_date?: string | null
  delivery_date?: string | null
  buyer_reference?: string | null
  order_reference?: string | null
  period_start?: string | null
  period_end?: string | null
  billing_reference?: string | null
  billing_reference_date?: string | null
  discount_percent?: number | null
  discount_amount?: number | null
  prepaid_amount?: number | null
}

export function missingEfacturaFields(input: {
  invoice: EfacturaInvoice
  seller: EfacturaParty
  buyer: EfacturaParty
  items: EfacturaLine[]
}) {
  const missing: string[] = []
  const { invoice, seller, buyer, items } = input
  if (!invoice.invoice_number) missing.push('Număr factură')
  if (!invoice.issue_date) missing.push('Data emiterii')
  if (invoice.currency && invoice.currency !== 'RON') missing.push('Monedă RON (valuta nu este suportată fără total TVA în RON)')
  if (!seller.company_name) missing.push('Denumire furnizor')
  if (!seller.cui) missing.push('CUI furnizor')
  if (!seller.address) missing.push('Adresă furnizor')
  if (!seller.city) missing.push('Localitate / sector furnizor')
  if (!seller.county_code) missing.push('Județ furnizor (cod ISO)')
  if (!buyer.company_name) missing.push('Denumire client')
  if (!buyer.cui) missing.push('CUI client')
  if (!buyer.address) missing.push('Adresă client')
  if (!buyer.city) missing.push('Localitate / sector client')
  if (!buyer.county_code) missing.push('Județ client (cod ISO)')
  if (buyer.is_public_institution && !invoice.buyer_reference) {
    missing.push('Referință cumpărător (obligatorie pentru instituții publice)')
  }
  if (invoice.invoice_type_code === '381' && !invoice.billing_reference) {
    missing.push('Referință factură stornată')
  }
  if (!items.length) missing.push('Cel puțin o linie de factură')
  items.forEach((item, i) => {
    if (!item.description) missing.push(`Descriere linie ${i + 1}`)
    if (!item.unit_code) missing.push(`Unitate de măsură linie ${i + 1}`)
    const category = item.vat_category || vatCategoryFromRate(item.tva_rate)
    if (['E', 'O', 'AE', 'K', 'G'].includes(category) && !item.vat_exemption_reason) {
      missing.push(`Motiv scutire TVA linie ${i + 1}`)
    }
  })
  const payCode = invoice.payment_means_code || '42'
  if (['31', '42'].includes(payCode) && !seller.iban) missing.push('IBAN furnizor (pentru virament)')
  if (seller.county_code === 'B' && !/^Sector [1-6]$/.test(seller.city || '')) {
    missing.push('Sector București furnizor (Sector 1–6)')
  }
  if (buyer.county_code === 'B' && !/^Sector [1-6]$/.test(buyer.city || '')) {
    missing.push('Sector București client (Sector 1–6)')
  }
  return missing
}

function postalAddress(party: EfacturaParty) {
  const country = (party.country || 'RO').toUpperCase()
  return `<cac:PostalAddress>
      ${el('cbc:StreetName', party.address)}
      ${el('cbc:CityName', party.city)}
      ${el('cbc:PostalZone', party.postal_code)}
      ${el('cbc:CountrySubentity', party.county_code)}
      <cac:Country>${el('cbc:IdentificationCode', country)}</cac:Country>
    </cac:PostalAddress>`
}

function contactXml(party: EfacturaParty) {
  if (!party.contact_person && !party.phone && !party.email) return ''
  return `<cac:Contact>
      ${el('cbc:Name', party.contact_person)}
      ${el('cbc:Telephone', party.phone)}
      ${el('cbc:ElectronicMail', party.email)}
    </cac:Contact>`
}

function partyXml(party: EfacturaParty) {
  const vatRegistered = party.vat_registered !== false
  const cuiDigits = (party.cui || '').replace(/\D/g, '')
  const vatId = vatRegistered ? `RO${cuiDigits}` : ''
  const endpoint = cuiDigits
    ? `<cbc:EndpointID schemeID="9947">${xmlEscape(cuiDigits)}</cbc:EndpointID>`
    : party.email
      ? `<cbc:EndpointID schemeID="EM">${xmlEscape(party.email)}</cbc:EndpointID>`
      : ''
  return `<cac:Party>
      ${endpoint}
      <cac:PartyName>${el('cbc:Name', party.company_name)}</cac:PartyName>
      ${postalAddress(party)}
      ${vatRegistered && vatId ? `<cac:PartyTaxScheme>
        ${el('cbc:CompanyID', vatId)}
        <cac:TaxScheme>${el('cbc:ID', 'VAT')}</cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        ${el('cbc:RegistrationName', party.company_name)}
        ${el('cbc:CompanyID', cuiDigits)}
        ${el('cbc:CompanyLegalForm', party.reg_com)}
      </cac:PartyLegalEntity>
      ${contactXml(party)}
    </cac:Party>`
}

function allowanceXml(amount: number, currency: string, reason: string) {
  if (amount <= 0) return ''
  return `<cac:AllowanceCharge>
    ${el('cbc:ChargeIndicator', 'false')}
    ${el('cbc:AllowanceChargeReason', reason)}
    ${el('cbc:Amount', amount.toFixed(2), { currencyID: currency })}
  </cac:AllowanceCharge>`
}

export function generateEfacturaXml(input: {
  invoice: EfacturaInvoice
  seller: EfacturaParty
  buyer: EfacturaParty
  items: EfacturaLine[]
}) {
  const missing = missingEfacturaFields(input)
  if (missing.length) {
    throw new Error(`Lipsesc câmpuri e-Factura: ${missing.join(', ')}`)
  }

  const { invoice, seller, buyer, items } = input
  const currency = 'RON'
  const typeCode = invoice.invoice_type_code || '380'
  const credit = typeCode === '381'
  const paymentCode = invoice.payment_means_code || '42'
  const invoiceId = `${invoice.series || ''}${invoice.invoice_number}`
  const publicNotes = notesWithoutSpvMark(invoice.notes)
  const taxPoint = invoice.tax_point_date || invoice.issue_date
  const dueDate = invoice.due_date || invoice.issue_date
  const totals = computeInvoiceTotals(items, invoice)

  const lines = items.map((item, index) => {
    const computed = totals.lines[index]
    const category = item.vat_category || vatCategoryFromRate(item.tva_rate)
    return { item, computed, category }
  })

  const taxMap = new Map<string, { category: string; rate: number; taxable: number; tax: number; reason?: string }>()
  const factor = totals.lineExtension > 0 ? totals.subtotal / totals.lineExtension : 1
  for (const line of lines) {
    const key = `${line.category}:${line.item.tva_rate}`
    const current = taxMap.get(key) || {
      category: line.category,
      rate: Number(line.item.tva_rate),
      taxable: 0,
      tax: 0,
      reason: line.item.vat_exemption_reason || undefined
    }
    current.taxable = roundMoney(current.taxable + roundMoney(line.computed.net * factor))
    current.tax = roundMoney(current.tax + roundMoney(line.computed.vat * factor))
    taxMap.set(key, current)
  }

  const taxSubtotals = [...taxMap.values()].map(group => `      <cac:TaxSubtotal>
        ${el('cbc:TaxableAmount', group.taxable.toFixed(2), { currencyID: currency })}
        ${el('cbc:TaxAmount', group.tax.toFixed(2), { currencyID: currency })}
        <cac:TaxCategory>
          ${el('cbc:ID', group.category)}
          ${el('cbc:Percent', group.rate.toFixed(2))}
          ${group.reason ? el('cbc:TaxExemptionReason', group.reason) : ''}
          <cac:TaxScheme>${el('cbc:ID', 'VAT')}</cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>`).join('\n')

  const lineTag = credit ? 'CreditNoteLine' : 'InvoiceLine'
  const qtyTag = credit ? 'CreditedQuantity' : 'InvoicedQuantity'
  const invoiceLines = lines.map((line, index) => `  <cac:${lineTag}>
    ${el('cbc:ID', index + 1)}
    ${el(`cbc:${qtyTag}`, line.item.quantity, { unitCode: line.item.unit_code || 'H87' })}
    ${el('cbc:LineExtensionAmount', line.computed.net.toFixed(2), { currencyID: currency })}
    ${allowanceXml(line.computed.discount, currency, 'Discount linie')}
    <cac:Item>
      ${el('cbc:Name', line.item.description)}
      <cac:ClassifiedTaxCategory>
        ${el('cbc:ID', line.category)}
        ${el('cbc:Percent', Number(line.item.tva_rate).toFixed(2))}
        ${line.item.vat_exemption_reason ? el('cbc:TaxExemptionReason', line.item.vat_exemption_reason) : ''}
        <cac:TaxScheme>${el('cbc:ID', 'VAT')}</cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      ${el('cbc:PriceAmount', Number(line.item.unit_price).toFixed(2), { currencyID: currency })}
    </cac:Price>
  </cac:${lineTag}>`).join('\n')

  const notes = [
    publicNotes,
    seller.vat_on_collection && !(publicNotes || '').includes(VAT_ON_COLLECTION_MENTION) ? VAT_ON_COLLECTION_MENTION : ''
  ].filter(Boolean).join('\n')

  const root = credit ? 'CreditNote' : 'Invoice'
  const xmlns = credit
    ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'
    : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'
  const typeEl = credit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'

  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="${xmlns}"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  ${el('cbc:CustomizationID', 'urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1')}
  ${el('cbc:ProfileID', 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0')}
  ${el('cbc:ID', invoiceId)}
  ${el('cbc:IssueDate', invoice.issue_date)}
  ${el('cbc:TaxPointDate', taxPoint)}
  ${credit ? '' : el('cbc:DueDate', dueDate)}
  ${el(`cbc:${typeEl}`, typeCode)}
  ${notes ? el('cbc:Note', notes) : ''}
  ${el('cbc:DocumentCurrencyCode', currency)}
  ${invoice.buyer_reference ? el('cbc:BuyerReference', invoice.buyer_reference) : ''}
  ${invoice.order_reference ? `<cac:OrderReference>${el('cbc:ID', invoice.order_reference)}</cac:OrderReference>` : ''}
  ${invoice.billing_reference ? `<cac:BillingReference>
    <cac:InvoiceDocumentReference>
      ${el('cbc:ID', invoice.billing_reference)}
      ${invoice.billing_reference_date ? el('cbc:IssueDate', invoice.billing_reference_date) : ''}
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>` : ''}
  ${(invoice.period_start || invoice.period_end) ? `<cac:InvoicePeriod>
    ${el('cbc:StartDate', invoice.period_start)}
    ${el('cbc:EndDate', invoice.period_end)}
  </cac:InvoicePeriod>` : ''}
  <cac:AccountingSupplierParty>
    ${partyXml(seller)}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    ${partyXml(buyer)}
  </cac:AccountingCustomerParty>
  ${invoice.delivery_date ? `<cac:Delivery>
    ${el('cbc:ActualDeliveryDate', invoice.delivery_date)}
  </cac:Delivery>` : ''}
  <cac:PaymentMeans>
    ${el('cbc:PaymentMeansCode', paymentCode)}
    ${seller.iban ? `<cac:PayeeFinancialAccount>
      ${el('cbc:ID', seller.iban)}
      ${el('cbc:Name', seller.company_name)}
      ${seller.bic ? `<cac:FinancialInstitutionBranch>${el('cbc:ID', seller.bic)}</cac:FinancialInstitutionBranch>` : ''}
    </cac:PayeeFinancialAccount>` : ''}
  </cac:PaymentMeans>
  <cac:PaymentTerms>
    ${el('cbc:Note', notes || `Plata până la ${dueDate}`)}
  </cac:PaymentTerms>
  ${allowanceXml(totals.headerDiscount, currency, 'Discount document')}
  <cac:TaxTotal>
    ${el('cbc:TaxAmount', totals.tvaAmount.toFixed(2), { currencyID: currency })}
${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    ${el('cbc:LineExtensionAmount', totals.lineExtension.toFixed(2), { currencyID: currency })}
    ${totals.headerDiscount > 0 ? el('cbc:AllowanceTotalAmount', totals.headerDiscount.toFixed(2), { currencyID: currency }) : ''}
    ${el('cbc:TaxExclusiveAmount', totals.subtotal.toFixed(2), { currencyID: currency })}
    ${el('cbc:TaxInclusiveAmount', totals.taxInclusive.toFixed(2), { currencyID: currency })}
    ${totals.prepaid > 0 ? el('cbc:PrepaidAmount', totals.prepaid.toFixed(2), { currencyID: currency }) : ''}
    ${el('cbc:PayableAmount', totals.payable.toFixed(2), { currencyID: currency })}
  </cac:LegalMonetaryTotal>
${invoiceLines}
</${root}>
`
}
