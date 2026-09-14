import { countyNameFromCode } from '@/lib/romania'

export const CLIENT_CONTACT_ROLES = [
  'Administrator',
  'Contabil',
  'Director',
  'Contact facturare',
  'Altele'
] as const

export const CLIENT_ADDRESS_TYPES = [
  { value: 'sediu_social', label: 'Sediu social' },
  { value: 'sediu_corespondenta', label: 'Sediu corespondență' },
  { value: 'punct_de_lucru', label: 'Punct de lucru' },
  { value: 'depozit', label: 'Depozit' },
  { value: 'livrare', label: 'Adresă de livrare' },
  { value: 'altele', label: 'Altele' }
] as const

export type ClientContactDraft = {
  key: string
  id?: string
  name: string
  phone: string
  contact_role: string
}

export type ClientAddressDraft = {
  key: string
  id?: string
  address_type: string
  address: string
  city: string
  county: string
  county_code: string
  postal_code: string
  country: string
  is_default: boolean
}

export type ClientContactRow = {
  id: string
  name?: string | null
  phone?: string | null
  contact_role?: string | null
  sort_order?: number | null
}

export type ClientAddressRow = {
  id: string
  address_type?: string | null
  address?: string | null
  city?: string | null
  county?: string | null
  county_code?: string | null
  postal_code?: string | null
  country?: string | null
  is_default?: boolean | null
  sort_order?: number | null
}

export function newDraftKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `k-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function emptyClientContact(): ClientContactDraft {
  return { key: newDraftKey(), name: '', phone: '', contact_role: '' }
}

export function emptyClientAddress(isDefault = false): ClientAddressDraft {
  return {
    key: newDraftKey(),
    address_type: isDefault ? 'sediu_social' : 'sediu_corespondenta',
    address: '',
    city: '',
    county: '',
    county_code: '',
    postal_code: '',
    country: 'RO',
    is_default: isDefault
  }
}

export function addressTypeLabel(value?: string | null) {
  return CLIENT_ADDRESS_TYPES.find(t => t.value === value)?.label || 'Sediu social'
}

export function defaultAddressFromList<T extends { is_default?: boolean | null }>(addresses: T[]) {
  return addresses.find(a => a.is_default) || addresses[0] || null
}

export function contactsFromRows(rows?: ClientContactRow[] | null): ClientContactDraft[] {
  if (!rows?.length) return []
  return [...rows]
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(row => ({
      key: row.id,
      id: row.id,
      name: row.name || '',
      phone: row.phone || '',
      contact_role: row.contact_role || ''
    }))
}

export function addressesFromClient(client: {
  address?: string | null
  city?: string | null
  county?: string | null
  county_code?: string | null
  postal_code?: string | null
  country?: string | null
  client_addresses?: ClientAddressRow[] | null
}): ClientAddressDraft[] {
  if (client.client_addresses?.length) {
    return [...client.client_addresses]
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(row => ({
        key: row.id,
        id: row.id,
        address_type: row.address_type || 'sediu_social',
        address: row.address || '',
        city: row.city || '',
        county: row.county || '',
        county_code: row.county_code || '',
        postal_code: row.postal_code || '',
        country: row.country || 'RO',
        is_default: !!row.is_default
      }))
  }
  return [{
    key: newDraftKey(),
    address_type: 'sediu_social',
    address: client.address || '',
    city: client.city || '',
    county: client.county || '',
    county_code: client.county_code || '',
    postal_code: client.postal_code || '',
    country: client.country || 'RO',
    is_default: true
  }]
}

export function applyCuiToDefaultAddress(
  addresses: ClientAddressDraft[],
  data: Partial<Pick<ClientAddressDraft, 'address' | 'city' | 'county' | 'county_code' | 'postal_code' | 'country'>>
): ClientAddressDraft[] {
  const next = addresses.length ? addresses.map(a => ({ ...a })) : [emptyClientAddress(true)]
  let idx = next.findIndex(a => a.is_default)
  if (idx < 0) idx = 0
  const headOffice = next.findIndex(a => a.is_default && a.address_type === 'sediu_social')
  const target = headOffice >= 0 ? headOffice : idx
  const current = next[target]
  next[target] = {
    ...current,
    address_type: current.address_type || 'sediu_social',
    address: data.address || current.address,
    city: data.city || current.city,
    county: data.county || current.county,
    county_code: data.county_code || current.county_code,
    postal_code: data.postal_code || current.postal_code,
    country: data.country || current.country || 'RO',
    is_default: true
  }
  return next.map((row, i) => ({ ...row, is_default: i === target }))
}

export function setDefaultAddress(addresses: ClientAddressDraft[], key: string): ClientAddressDraft[] {
  if (!addresses.some(a => a.key === key)) return addresses
  return addresses.map(row => ({ ...row, is_default: row.key === key }))
}

export function addClientAddress(addresses: ClientAddressDraft[]): ClientAddressDraft[] {
  const next = emptyClientAddress(addresses.length === 0)
  return [...addresses, next]
}

export function removeClientAddress(addresses: ClientAddressDraft[], key: string): ClientAddressDraft[] {
  if (addresses.length <= 1) return addresses
  const next = addresses.filter(a => a.key !== key)
  if (!next.some(a => a.is_default) && next[0]) {
    next[0] = { ...next[0], is_default: true }
  }
  return next
}

export function defaultAddressFields(addresses: ClientAddressDraft[]) {
  const d = defaultAddressFromList(addresses)
  if (!d) {
    return {
      address: '',
      city: '',
      county: '',
      county_code: '',
      postal_code: '',
      country: 'RO'
    }
  }
  return {
    address: d.address,
    city: d.city,
    county: countyNameFromCode(d.county_code) || d.county,
    county_code: d.county_code,
    postal_code: d.postal_code,
    country: d.country || 'RO'
  }
}

export function contactInsertRows(
  clientId: string,
  userId: string,
  companyId: string | null | undefined,
  contacts: ClientContactDraft[]
) {
  return contacts
    .filter(c => c.name.trim())
    .map((c, i) => ({
      client_id: clientId,
      user_id: userId,
      company_id: companyId || null,
      name: c.name.trim(),
      phone: c.phone.trim(),
      contact_role: c.contact_role.trim(),
      sort_order: i
    }))
}

export function addressInsertRows(
  clientId: string,
  userId: string,
  companyId: string | null | undefined,
  addresses: ClientAddressDraft[]
) {
  const rows = addresses.map((a, i) => ({
    client_id: clientId,
    user_id: userId,
    company_id: companyId || null,
    address_type: a.address_type || 'sediu_social',
    address: a.address,
    city: a.city,
    county: countyNameFromCode(a.county_code) || a.county,
    county_code: a.county_code,
    postal_code: a.postal_code,
    country: a.country || 'RO',
    is_default: !!a.is_default,
    sort_order: i
  }))
  if (rows.length && !rows.some(r => r.is_default)) rows[0].is_default = true
  if (rows.filter(r => r.is_default).length > 1) {
    let seen = false
    for (const row of rows) {
      if (row.is_default && !seen) { seen = true; continue }
      row.is_default = false
    }
  }
  return rows
}
