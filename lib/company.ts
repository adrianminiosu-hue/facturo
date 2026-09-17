export type Company = {
  id: string
  user_id: string
  company_name: string
  cui: string
  reg_com: string
  address: string
  city: string
  county: string
  county_code: string
  postal_code: string
  country: string
  vat_registered: boolean
  vat_on_collection: boolean
  bank_name: string
  iban: string
  bic: string
  contact_person: string
  contact_role: string
  email: string
  phone: string
  invoice_series: string
  invoice_start_number: number
}

export const ACTIVE_COMPANY_KEY = 'facturo_active_company_id'

export const emptyCompanyFields = {
  company_name: '',
  cui: '',
  reg_com: '',
  address: '',
  city: '',
  county: '',
  county_code: '',
  postal_code: '',
  country: 'RO',
  vat_registered: true,
  vat_on_collection: false,
  bank_name: '',
  iban: '',
  bic: '',
  contact_person: '',
  contact_role: '',
  email: '',
  phone: '',
  invoice_series: 'FCT',
  invoice_start_number: 1
}

export function companyFromRow(row: Record<string, unknown>, userId: string): Company {
  return {
    id: String(row.id || ''),
    user_id: String(row.user_id || userId),
    company_name: String(row.company_name || ''),
    cui: String(row.cui || ''),
    reg_com: String(row.reg_com || ''),
    address: String(row.address || ''),
    city: String(row.city || ''),
    county: String(row.county || ''),
    county_code: String(row.county_code || ''),
    postal_code: String(row.postal_code || ''),
    country: String(row.country || 'RO'),
    vat_registered: row.vat_registered !== false,
    vat_on_collection: row.vat_on_collection === true,
    bank_name: String(row.bank_name || ''),
    iban: String(row.iban || ''),
    bic: String(row.bic || ''),
    contact_person: String(row.contact_person || ''),
    contact_role: String(row.contact_role || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    invoice_series: String(row.invoice_series || 'FCT'),
    invoice_start_number: Number(row.invoice_start_number || 1)
  }
}
