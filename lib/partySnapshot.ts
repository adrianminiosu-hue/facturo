export type PartySnapshot = {
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
  email: string
  phone: string
  contact_person: string
  iban: string
  bank_name: string
  bic: string
  vat_on_collection?: boolean
  is_public_institution?: boolean
}

function text(value: unknown) {
  return String(value || '')
}

export function snapshotParty(row: Record<string, unknown> | null | undefined, extras: Partial<PartySnapshot> = {}): PartySnapshot {
  const source = row || {}
  return {
    company_name: text(source.company_name),
    cui: text(source.cui),
    reg_com: text(source.reg_com),
    address: text(source.address),
    city: text(source.city),
    county: text(source.county),
    county_code: text(source.county_code),
    postal_code: text(source.postal_code),
    country: text(source.country || 'RO'),
    vat_registered: source.vat_registered !== false,
    email: text(source.email),
    phone: text(source.phone),
    contact_person: text(source.contact_person),
    iban: text(source.iban),
    bank_name: text(source.bank_name),
    bic: text(source.bic),
    vat_on_collection: Boolean(source.vat_on_collection),
    is_public_institution: Boolean(source.is_public_institution),
    ...extras
  }
}

export function resolveParty(
  snapshot: PartySnapshot | Record<string, unknown> | null | undefined,
  live: Record<string, unknown> | null | undefined
): PartySnapshot {
  const fromLive = snapshotParty(live || undefined)
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.company_name) return fromLive
  const frozen = snapshotParty(snapshot as Record<string, unknown>)
  const merged = { ...fromLive, ...frozen }
  const textKeys: Array<keyof PartySnapshot> = [
    'company_name', 'cui', 'reg_com', 'address', 'city', 'county', 'county_code',
    'postal_code', 'country', 'email', 'phone', 'contact_person', 'iban', 'bank_name', 'bic'
  ]
  for (const key of textKeys) {
    if (!merged[key]) merged[key] = fromLive[key]
  }
  return merged
}

export function formatPartyCui(cui?: string | null, vatRegistered?: boolean | null) {
  const digits = (cui || '').replace(/\D/g, '')
  if (!digits) return '—'
  return vatRegistered === false ? digits : `RO${digits}`
}
