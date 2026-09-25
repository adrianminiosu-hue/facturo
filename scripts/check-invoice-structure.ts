/**
 * Invoice structure checks: 2026 VAT, discounts, payable after avans.
 * Run: npx tsx scripts/check-invoice-structure.ts
 */
import { computeInvoiceTotals, invoiceConvertedHeader, remainingOf, resolveExchangeRate, VAT_RATES } from '../lib/invoiceMath'
import { generateEfacturaXml, missingEfacturaFields } from '../lib/efactura'
import { defaultInvoiceNotes, VAT_ON_COLLECTION_MENTION } from '../lib/invoiceNotes'

function assert(name: string, ok: boolean) {
  if (!ok) throw new Error(name)
  console.log('ok', name)
}

const seller = {
  company_name: 'Facturo SRL',
  cui: '12345678',
  address: 'Str. Test 1',
  city: 'Sector 1',
  county_code: 'B',
  vat_registered: true,
  iban: 'RO13RNCB0000000000000001',
  bic: 'RNCBROBU',
  email: 'office@test.ro',
  phone: '0721234567',
  contact_person: 'Ana Pop'
}

const buyer = {
  company_name: 'Client SA',
  cui: '87654321',
  address: 'Bd. Unirii 2',
  city: 'Sector 2',
  county_code: 'B',
  vat_registered: true,
  is_public_institution: true
}

const items = [{
  description: 'Consultanță',
  quantity: 1,
  unit_price: 1000,
  tva_rate: 21,
  unit_code: 'E48',
  vat_category: 'S',
  discount_percent: 10
}]

assert('VAT rates are 21/11/0', VAT_RATES.join(',') === '21,11,0')

const totals = computeInvoiceTotals(items, { discount_percent: 0, prepaid_amount: 100 })
assert('line discount 10% net 900', totals.lineExtension === 900)
assert('vat on discounted net', totals.tvaAmount === 189)
assert('prepaid reduces payable', totals.payable === 989)

assert('notes mention TVA la încasare', defaultInvoiceNotes({ vat_on_collection: true, iban: seller.iban }).includes(VAT_ON_COLLECTION_MENTION))

const missingPublic = missingEfacturaFields({
  invoice: {
    series: 'FCT',
    invoice_number: '1',
    issue_date: '2026-09-16',
    buyer_reference: '',
    payment_means_code: '42'
  },
  seller,
  buyer,
  items
})
assert('public buyer requires BT-10', missingPublic.some(m => m.includes('Referință cumpărător')))

const xml = generateEfacturaXml({
  invoice: {
    series: 'FCT',
    invoice_number: '1',
    issue_date: '2026-09-16',
    tax_point_date: '2026-09-16',
    invoice_type_code: '381',
    payment_means_code: '42',
    billing_reference: 'FCT0001',
    billing_reference_date: '2026-09-01',
    buyer_reference: 'PO-1',
    notes: 'Storno'
  },
  seller,
  buyer,
  items
})
assert('credit note root', xml.includes('<CreditNote '))
assert('tax point date', xml.includes('<cbc:TaxPointDate>2026-09-16</cbc:TaxPointDate>'))
assert('contact in xml', xml.includes('<cac:Contact>'))
assert('no EUR', !xml.includes('EUR'))
assert('remaining accounts for prepaid', remainingOf({ total: 1089, prepaid_amount: 100, amount_paid: 0 }) === 989)

const fxItems = [
  { quantity: 1, unit_price: 3000, tva_rate: 21, total: 18222.60 },
  { quantity: 1, unit_price: 2500, tva_rate: 21, total: 15185.50 }
]
const inferred = resolveExchangeRate(fxItems, { subtotal: 5500, total: 6655 })
assert('infer eur rate from converted line totals', inferred === 5.02)
const fxHeader = invoiceConvertedHeader(fxItems, { subtotal: 5500, tva_amount: 1155, total: 6655 })
assert('converted baza uses rate', fxHeader.totals.subtotal === 27610)
assert('converted vat uses rate', fxHeader.totals.tvaAmount === 5798.1)
assert('converted total uses rate', fxHeader.totals.taxInclusive === 33408.1)
assert('backfill needed when header is unconverted', fxHeader.needsPersist === true)
assert('remaining uses converted line totals', remainingOf({
  total: 6655,
  invoice_items: fxItems
}) === 33408.1)

console.log('all invoice structure checks passed')
