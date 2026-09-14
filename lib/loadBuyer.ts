export type BuyerClient = {
  id?: string
  company_name?: string | null
  cui?: string | null
  reg_com?: string | null
  address?: string | null
  city?: string | null
  county?: string | null
  county_code?: string | null
  postal_code?: string | null
  country?: string | null
  vat_registered?: boolean | null
  email?: string | null
  iban?: string | null
  bank_name?: string | null
  bic?: string | null
  [key: string]: unknown
}

type AddressRow = {
  address?: string | null
  city?: string | null
  county?: string | null
  county_code?: string | null
  postal_code?: string | null
  country?: string | null
  is_default?: boolean | null
  sort_order?: number | null
}

function mergeDefaultAddress(client: BuyerClient, addresses: AddressRow[]) {
  const def = addresses.find(a => a.is_default) || addresses[0]
  if (!def) return client
  return {
    ...client,
    address: def.address ?? client.address,
    city: def.city ?? client.city,
    county: def.county ?? client.county,
    county_code: def.county_code ?? client.county_code,
    postal_code: def.postal_code ?? client.postal_code,
    country: def.country ?? client.country
  }
}

export async function loadBuyer(
  supabase: { from: (table: string) => any },
  clientId: string | null | undefined
): Promise<any | null> {
  if (!clientId) return null

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (!client) return null

  const { data: addresses, error } = await supabase
    .from('client_addresses')
    .select('address, city, county, county_code, postal_code, country, is_default, sort_order')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: true })

  if (error || !addresses?.length) return client
  return mergeDefaultAddress(client, addresses)
}
