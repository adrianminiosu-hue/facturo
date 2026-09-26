import { normalizeIban } from '@/lib/iban'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * Stores the accounts a supplier asks to be paid into (read from its e-Factura XML), so outgoing
 * bank lines to that IBAN are recognised as payments to this supplier. Adds only what is missing;
 * never changes or removes accounts the user entered. Best effort: returns how many were added.
 */
export async function rememberSupplierIbans(
  db: Db,
  opts: {
    supplier: { id: string; iban?: string | null; user_id?: string | null; company_id?: string | null }
    ibans: string[]
    ownerUserId: string
    companyId?: string | null
    currency?: string | null
  }
) {
  const wanted = [...new Set(opts.ibans.map(normalizeIban).filter(Boolean))]
  if (!wanted.length || !opts.supplier?.id) return 0
  const { data: rows, error } = await db.from('client_bank_accounts').select('iban, iban_currency, is_default').eq('client_id', opts.supplier.id)
  if (error) return 0
  const existing = (rows || []) as Array<{ iban?: string | null; iban_currency?: string | null; is_default?: boolean | null }>
  const known = new Set([opts.supplier.iban, ...existing.map(row => row.iban)].map(normalizeIban).filter(Boolean))
  const missing = wanted.filter(iban => !known.has(iban))
  if (!missing.length) return 0

  const ibanCurrency = String(opts.currency || '').toUpperCase() === 'EUR' ? 'EUR' : 'LEI'
  const hasDefault = existing.some(row => row.is_default && (row.iban_currency || 'LEI') === ibanCurrency)
  const insert = await db.from('client_bank_accounts').insert(missing.map((iban, index) => ({
    client_id: opts.supplier.id,
    user_id: opts.ownerUserId,
    company_id: opts.companyId || null,
    iban,
    iban_currency: ibanCurrency,
    is_default: !hasDefault && index === 0,
    sort_order: existing.length + index
  })))
  if (insert?.error) return 0

  // The client form and the PDF still read the legacy column: fill it when the supplier had no IBAN at all.
  if (!normalizeIban(opts.supplier.iban) && ibanCurrency === 'LEI') {
    await db.from('clients').update({ iban: missing[0] }).eq('id', opts.supplier.id)
  }
  return missing.length
}
