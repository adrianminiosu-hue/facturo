import type { EfacturaInvoice, EfacturaLine, EfacturaParty } from '@/lib/efactura'

/**
 * Invoice shapes Facturo can issue, used to check the generated XML against ANAF's validator.
 * CUIs are fictitious but have a valid check digit, so ANAF's CUI checks pass.
 */
export type EfacturaSample = {
  key: string
  label: string
  invoice: EfacturaInvoice & { invoice_type_code: string }
  seller: EfacturaParty
  buyer: EfacturaParty
  items: EfacturaLine[]
}

const seller: EfacturaParty = {
  company_name: 'Test Vanzator SRL',
  cui: '12345674',
  reg_com: 'J40/1234/2020',
  address: 'Str. Exemplu nr. 1',
  city: 'Sector 1',
  county_code: 'B',
  postal_code: '010101',
  country: 'RO',
  vat_registered: true,
  email: 'facturi@vanzator.test',
  iban: 'RO49AAAA1B31007593840000',
  bank_name: 'Banca Test'
}

const buyerRo: EfacturaParty = {
  company_name: 'Test Cumparator SRL',
  cui: '76543210',
  address: 'Calea Turzii 10',
  city: 'Cluj-Napoca',
  county_code: 'CJ',
  postal_code: '400001',
  country: 'RO',
  vat_registered: true
}

const baseInvoice = {
  series: 'TST',
  issue_date: '2026-09-25',
  due_date: '2026-10-10',
  currency: 'RON',
  payment_means_code: '42',
  tax_point_date: '2026-09-25',
  notes: 'Factura de test.'
}

const line = (over: Partial<EfacturaLine> = {}): EfacturaLine => ({
  description: 'Servicii consultanta',
  quantity: 2,
  unit_price: 1000,
  tva_rate: 21,
  unit_code: 'HUR',
  vat_category: 'S',
  ...over
})

export const EFACTURA_SAMPLES: EfacturaSample[] = [
  {
    key: 'standard',
    label: 'Factură standard 21%',
    invoice: { ...baseInvoice, invoice_number: '0001', invoice_type_code: '380' },
    seller, buyer: buyerRo, items: [line()]
  },
  {
    key: 'multi-rate',
    label: 'Mai multe cote (21% + 11%)',
    invoice: { ...baseInvoice, invoice_number: '0002', invoice_type_code: '380' },
    seller, buyer: buyerRo,
    items: [line(), line({ description: 'Carte tehnica', quantity: 3, unit_price: 49.9, tva_rate: 11, unit_code: 'H87' })]
  },
  {
    key: 'discounts',
    label: 'Discount pe linie și pe factură',
    invoice: { ...baseInvoice, invoice_number: '0003', invoice_type_code: '380', discount_percent: 5 },
    seller, buyer: buyerRo,
    items: [line({ discount_percent: 10 }), line({ description: 'Licenta software', quantity: 1, unit_price: 500, unit_code: 'C62', discount_amount: 50 })]
  },
  {
    key: 'prepaid',
    label: 'Avans dedus',
    invoice: { ...baseInvoice, invoice_number: '0004', invoice_type_code: '380', prepaid_amount: 1000 },
    seller, buyer: buyerRo, items: [line()]
  },
  {
    key: 'advance',
    label: 'Factură de avans (380, CIUS-RO nu acceptă 386)',
    invoice: { ...baseInvoice, invoice_number: '0005', invoice_type_code: '380', notes: 'Factura de avans conform contractului.' },
    seller, buyer: buyerRo, items: [line({ description: 'Avans proiect', quantity: 1, unit_price: 3000, unit_code: 'C62' })]
  },
  {
    key: 'credit-note',
    label: 'Notă de credit (381)',
    invoice: { ...baseInvoice, invoice_number: '0006', invoice_type_code: '381', billing_reference: 'TST0001', billing_reference_date: '2026-09-20' },
    seller, buyer: buyerRo, items: [line({ quantity: 1 })]
  },
  {
    key: 'storno-384',
    label: 'Factură corectată negativă (384)',
    invoice: { ...baseInvoice, invoice_number: '0007', invoice_type_code: '384', billing_reference: 'TST0001', billing_reference_date: '2026-09-20' },
    seller, buyer: buyerRo, items: [line({ quantity: -1 })]
  },
  {
    key: 'exempt',
    label: 'Scutit de TVA (E)',
    invoice: { ...baseInvoice, invoice_number: '0008', invoice_type_code: '380' },
    seller, buyer: buyerRo,
    items: [line({ description: 'Curs de formare profesionala', tva_rate: 0, vat_category: 'E', vat_exemption_reason: 'Scutit conform art. 292 alin. (1) lit. a) din Codul fiscal' })]
  },
  {
    key: 'reverse-charge',
    label: 'Taxare inversă (AE)',
    invoice: { ...baseInvoice, invoice_number: '0009', invoice_type_code: '380' },
    seller, buyer: buyerRo,
    items: [line({ description: 'Deseuri feroase', quantity: 100, unit_price: 2.5, unit_code: 'KGM', tva_rate: 0, vat_category: 'AE', vat_exemption_reason: 'Taxare inversa conform art. 331 din Codul fiscal' })]
  },
  {
    key: 'intra-eu',
    label: 'Client UE, livrare intracomunitară (K)',
    invoice: { ...baseInvoice, invoice_number: '0010', invoice_type_code: '380' },
    seller,
    buyer: { company_name: 'Test Kunde GmbH', cui: 'DE123456789', address: 'Hauptstrasse 1', city: 'Berlin', county_code: '', postal_code: '10115', country: 'DE', vat_registered: true },
    items: [line({ tva_rate: 0, vat_category: 'K', vat_exemption_reason: 'Scutit cu drept de deducere conform art. 294 alin. (2) lit. a) din Codul fiscal' })]
  },
  {
    key: 'export',
    label: 'Export în afara UE (G)',
    invoice: { ...baseInvoice, invoice_number: '0011', invoice_type_code: '380' },
    seller,
    buyer: { company_name: 'Test Client Ltd', cui: 'GB123456789', address: '1 High Street', city: 'London', county_code: '', postal_code: 'SW1A 1AA', country: 'GB', vat_registered: false },
    items: [line({ tva_rate: 0, vat_category: 'G', vat_exemption_reason: 'Scutit cu drept de deducere conform art. 294 alin. (1) lit. a) din Codul fiscal' })]
  },
  {
    key: 'person',
    label: 'Client persoană fizică (fără CUI)',
    invoice: { ...baseInvoice, invoice_number: '0012', invoice_type_code: '380' },
    seller,
    buyer: { company_name: 'Ion Popescu', cui: '0000000000000', address: 'Str. Florilor 5', city: 'Brasov', county_code: 'BV', country: 'RO', vat_registered: false },
    items: [line({ quantity: 1 })]
  },
  {
    key: 'eur',
    label: 'Prețuri în EUR, facturat în lei',
    invoice: { ...baseInvoice, invoice_number: '0013', invoice_type_code: '380', exchange_rate: 5.0851, exchange_rate_source: 'BNR', exchange_rate_date: '2026-09-24' },
    seller, buyer: buyerRo, items: [line({ unit_price: 200 })]
  },
  {
    key: 'non-vat-seller',
    label: 'Vânzător neplătitor de TVA (O)',
    invoice: { ...baseInvoice, invoice_number: '0014', invoice_type_code: '380' },
    seller: { ...seller, company_name: 'Test Micro SRL', vat_registered: false },
    buyer: buyerRo,
    items: [line({ tva_rate: 0, vat_category: 'O', vat_exemption_reason: 'Neplatitor de TVA' })]
  },
  {
    key: 'public-institution',
    label: 'Instituție publică (referință cumpărător)',
    invoice: { ...baseInvoice, invoice_number: '0015', invoice_type_code: '380', buyer_reference: 'CTR-2026-17' },
    seller,
    buyer: { ...buyerRo, company_name: 'Primaria Test', cui: '24681350', vat_registered: false, is_public_institution: true },
    items: [line()]
  }
]
