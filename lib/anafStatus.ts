/** ANAF registry status as stored on `clients` (migration 20260926_client_anaf_status.sql). Client-safe. */
export type AnafStatus = {
  checked_at: string | null
  inactive: boolean
  deregistered_on: string | null
  efactura_registered: boolean
  vat_on_collection: boolean
  split_vat: boolean
}

export type AnafStatusRow = {
  anaf_checked_at?: string | null
  anaf_inactive?: boolean | null
  anaf_deregistered_on?: string | null
  anaf_efactura_registered?: boolean | null
  anaf_vat_on_collection?: boolean | null
  anaf_split_vat?: boolean | null
}

export function anafStatusFromRow(row?: AnafStatusRow | null): AnafStatus | null {
  if (!row?.anaf_checked_at) return null
  return {
    checked_at: row.anaf_checked_at,
    inactive: !!row.anaf_inactive,
    deregistered_on: row.anaf_deregistered_on || null,
    efactura_registered: !!row.anaf_efactura_registered,
    vat_on_collection: !!row.anaf_vat_on_collection,
    split_vat: !!row.anaf_split_vat
  }
}

/** From the `anaf` block returned by /api/cui. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function anafStatusFromLookup(anaf: any, checkedAt = new Date().toISOString()): AnafStatus | null {
  if (!anaf) return null
  return {
    checked_at: checkedAt,
    inactive: !!anaf.inactive,
    deregistered_on: anaf.deregistered_on || null,
    efactura_registered: !!anaf.efactura_registered,
    vat_on_collection: !!anaf.vat_on_collection,
    split_vat: !!anaf.split_vat
  }
}

export function anafStatusToColumns(status: AnafStatus | null): AnafStatusRow {
  if (!status) return {}
  return {
    anaf_checked_at: status.checked_at,
    anaf_inactive: status.inactive,
    anaf_deregistered_on: status.deregistered_on,
    anaf_efactura_registered: status.efactura_registered,
    anaf_vat_on_collection: status.vat_on_collection,
    anaf_split_vat: status.split_vat
  }
}

export function isMissingAnafColumnError(error: { message?: string } | null | undefined) {
  return !!error?.message && /anaf_/i.test(error.message) && /column|schema cache/i.test(error.message)
}

export function withoutAnafColumns<T extends Record<string, unknown>>(row: T): T {
  const copy = { ...row }
  for (const key of Object.keys(copy)) if (key.startsWith('anaf_')) delete copy[key]
  return copy
}

export function anafRisk(status: AnafStatus | null): 'deregistered' | 'inactive' | null {
  if (!status) return null
  return status.deregistered_on ? 'deregistered' : status.inactive ? 'inactive' : null
}
