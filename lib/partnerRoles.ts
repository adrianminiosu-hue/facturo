/** Partner roles (migration 20260927). Rows from older databases have no flags: treat them as customers. */
export type PartnerRoleRow = {
  is_customer?: boolean | null
  is_supplier?: boolean | null
  payment_terms_days?: number | null
}

export type PartnerFilter = 'customers' | 'suppliers' | 'all'

export function isCustomer(row: PartnerRoleRow) {
  return row.is_customer !== false
}

export function isSupplier(row: PartnerRoleRow) {
  return row.is_supplier === true
}

export function matchesPartnerFilter(row: PartnerRoleRow, filter: PartnerFilter) {
  if (filter === 'customers') return isCustomer(row)
  if (filter === 'suppliers') return isSupplier(row)
  return true
}

/** Customer's own term, else the default. */
export function paymentTermsFor(row: PartnerRoleRow | null | undefined, fallbackDays: number) {
  const days = Number(row?.payment_terms_days)
  return Number.isInteger(days) && days >= 0 && days <= 365 ? days : fallbackDays
}

export function isMissingPartnerColumnError(error: { message?: string } | null | undefined) {
  return !!error?.message && /is_customer|is_supplier|payment_terms_days/i.test(error.message)
}

export function withoutPartnerColumns<T extends Record<string, unknown>>(row: T): T {
  const copy = { ...row }
  delete copy.is_customer
  delete copy.is_supplier
  delete copy.payment_terms_days
  return copy
}
