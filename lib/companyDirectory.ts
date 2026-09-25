import { countyNameFromCode } from '@/lib/romania'
import {
  contactsFromRows,
  type ClientAddressDraft,
  type ClientAddressRow,
  type ClientContactDraft,
  type ClientContactRow
} from '@/lib/clientDirectory'
import {
  ensureBankDefaults,
  isBankAccountComplete,
  type ClientBankAccountDraft
} from '@/lib/clientBanks'
import { normalizeIban } from '@/lib/iban'
import { normalizeBic, normalizeIbanCurrency } from '@/lib/roBanks'

export function isMissingCompanyDirectoryError(error: { message?: string; code?: string } | null | undefined) {
  const msg = (error?.message || '').toLowerCase()
  const tableHit = (
    msg.includes('company_addresses') ||
    msg.includes('company_bank_accounts') ||
    msg.includes('company_contacts')
  )
  return (
    error?.code === 'PGRST200' ||
    error?.code === 'PGRST205' ||
    error?.code === '42P01' ||
    (tableHit && (
      msg.includes('schema cache') ||
      msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('relationship')
    ))
  )
}

export function contactsFromCompany(company: {
  contact_person?: string | null
  contact_role?: string | null
  phone?: string | null
  company_contacts?: ClientContactRow[] | null
}): ClientContactDraft[] {
  if (company.company_contacts?.length) return contactsFromRows(company.company_contacts)
  if (company.contact_person?.trim()) {
    return [{
      key: 'legacy-contact',
      name: company.contact_person,
      phone: company.phone || '',
      contact_role: company.contact_role || ''
    }]
  }
  return []
}

export function firstContactFields(contacts: ClientContactDraft[]) {
  const first = contacts.find(contact => contact.name.trim())
  return {
    contact_person: first?.name.trim() || '',
    contact_role: first?.contact_role.trim() || ''
  }
}

export function companyContactInsertRows(
  companyId: string,
  userId: string,
  contacts: ClientContactDraft[]
) {
  return contacts
    .filter(contact => contact.name.trim())
    .map((contact, i) => ({
      company_id: companyId,
      user_id: userId,
      name: contact.name.trim(),
      phone: contact.phone.trim(),
      contact_role: contact.contact_role.trim(),
      sort_order: i
    }))
}

export function companyAddressInsertRows(
  companyId: string,
  userId: string,
  addresses: ClientAddressDraft[]
) {
  const rows = addresses.map((address, i) => ({
    company_id: companyId,
    user_id: userId,
    address_type: address.address_type || 'sediu_social',
    address: address.address,
    city: address.city,
    county: countyNameFromCode(address.county_code) || address.county,
    county_code: address.county_code,
    postal_code: address.postal_code,
    country: address.country || 'RO',
    is_default: !!address.is_default,
    sort_order: i
  }))
  if (rows.length && !rows.some(row => row.is_default)) rows[0].is_default = true
  if (rows.filter(row => row.is_default).length > 1) {
    let seen = false
    for (const row of rows) {
      if (row.is_default && !seen) { seen = true; continue }
      row.is_default = false
    }
  }
  return rows
}

export function companyBankInsertRows(
  companyId: string,
  userId: string,
  accounts: ClientBankAccountDraft[]
) {
  return ensureBankDefaults(accounts.filter(isBankAccountComplete)).map((account, i) => ({
    company_id: companyId,
    user_id: userId,
    bank_name: account.bank_name.trim(),
    iban: normalizeIban(account.iban),
    bic: normalizeBic(account.bic),
    iban_currency: normalizeIbanCurrency(account.iban_currency),
    is_default: !!account.is_default,
    sort_order: i
  }))
}

export type { ClientAddressRow, ClientContactRow }
