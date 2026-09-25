import { vatCategoryFromRate } from '@/lib/efactura'
import { isCreditNote, isPurchaseInvoice } from '@/lib/invoiceStatus'

export type CatalogKind = 'service' | 'product'

export type CatalogItem = {
  id: string
  user_id?: string
  company_id?: string | null
  code: string
  name: string
  kind: CatalogKind
  unit_code: string
  unit_price: number
  tva_rate: number
  vat_category: string
  vat_exemption_reason: string
  discount_percent: number
  active: boolean
  last_used_at?: string | null
}

export type CatalogDraft = Omit<CatalogItem, 'id' | 'user_id' | 'company_id' | 'last_used_at'>

export type CatalogLineValues = {
  description: string
  unit_code: string
  unit_price: number
  tva_rate: number
  vat_category: string
  vat_exemption_reason: string
  discount_percent: number
}

export type CatalogSuggestion = CatalogLineValues & {
  source: 'catalog' | 'recent'
  catalogId?: string
  code?: string
}

type QueryClient = { from: (table: string) => any }

export function emptyCatalogDraft(): CatalogDraft {
  return {
    code: '',
    name: '',
    kind: 'service',
    unit_code: 'E48',
    unit_price: 0,
    tva_rate: 21,
    vat_category: 'S',
    vat_exemption_reason: '',
    discount_percent: 0,
    active: true
  }
}

export function normalizeCatalogName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

export function catalogNameKey(name: string) {
  return normalizeCatalogName(name).toLowerCase()
}

export function suggestionKey(line: Pick<CatalogLineValues, 'description' | 'unit_code' | 'unit_price' | 'tva_rate'>) {
  return [
    catalogNameKey(line.description),
    line.unit_code || 'H87',
    Number(line.unit_price || 0).toFixed(2),
    Number(line.tva_rate || 0).toFixed(2)
  ].join('|')
}

export function isCatalogDuplicateError(error: { message?: string } | null | undefined) {
  const msg = String(error?.message || '').toLowerCase()
  return (
    msg.includes('duplicate') ||
    msg.includes('catalog_items_company_name') ||
    msg.includes('catalog_items_user_name') ||
    msg.includes('catalog_items_company_code') ||
    msg.includes('catalog_items_user_code')
  )
}

export function isMissingCatalogTableError(error: { message?: string; code?: string } | null | undefined) {
  const msg = (error?.message || '').toLowerCase()
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    (msg.includes('catalog_items') && (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')))
  )
}

export function itemToLineValues(item: CatalogItem): CatalogLineValues {
  return {
    description: item.name,
    unit_code: item.unit_code || 'E48',
    unit_price: Number(item.unit_price) || 0,
    tva_rate: Number(item.tva_rate) || 0,
    vat_category: item.vat_category || vatCategoryFromRate(Number(item.tva_rate) || 0),
    vat_exemption_reason: item.vat_exemption_reason || '',
    discount_percent: Number(item.discount_percent) || 0
  }
}

export function rowToCatalogItem(row: Record<string, unknown>): CatalogItem {
  return {
    id: String(row.id),
    user_id: row.user_id ? String(row.user_id) : undefined,
    company_id: row.company_id ? String(row.company_id) : null,
    code: String(row.code || ''),
    name: String(row.name || ''),
    kind: row.kind === 'product' ? 'product' : 'service',
    unit_code: String(row.unit_code || 'E48'),
    unit_price: Number(row.unit_price) || 0,
    tva_rate: Number(row.tva_rate) || 0,
    vat_category: String(row.vat_category || 'S'),
    vat_exemption_reason: String(row.vat_exemption_reason || ''),
    discount_percent: Number(row.discount_percent) || 0,
    active: row.active !== false,
    last_used_at: row.last_used_at ? String(row.last_used_at) : null
  }
}

function scopedQuery(query: any, companyId?: string | null, userId?: string | null) {
  return companyId ? query.eq('company_id', companyId) : query.eq('user_id', userId)
}

/** One article per name. A firm's own article wins over a common one with the same name. */
export function dedupeCatalogItems(items: CatalogItem[]) {
  const byName = new Map<string, CatalogItem>()
  for (const item of items) {
    const key = catalogNameKey(item.name)
    const current = byName.get(key)
    if (!current) {
      byName.set(key, item)
      continue
    }
    const newIsFirm = !!item.company_id
    const currentIsFirm = !!current.company_id
    const newerUse = (item.last_used_at || '') > (current.last_used_at || '')
    if ((newIsFirm && !currentIsFirm) || (newIsFirm === currentIsFirm && newerUse)) {
      byName.set(key, item)
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'ro'))
}

export async function loadCatalogItems(
  client: QueryClient,
  opts: { userId?: string | null; companyId?: string | null; activeOnly?: boolean }
) {
  let query = client
    .from('catalog_items')
    .select('*')
    .order('name', { ascending: true })
  // Common articles (company_id null) are shared by all firms of the owner; the rest belong to one firm.
  if (opts.userId) {
    query = query.eq('user_id', opts.userId)
    if (opts.companyId) query = query.or(`company_id.is.null,company_id.eq.${opts.companyId}`)
  } else {
    query = scopedQuery(query, opts.companyId, opts.userId)
  }
  if (opts.activeOnly !== false) query = query.eq('active', true)
  const { data, error } = await query
  if (error) {
    if (isMissingCatalogTableError(error)) return { items: [] as CatalogItem[], missingTable: true }
    return { items: [] as CatalogItem[], missingTable: false, error: error.message }
  }
  return { items: dedupeCatalogItems((data || []).map(rowToCatalogItem)), missingTable: false }
}

export async function loadRecentInvoiceLines(
  client: QueryClient,
  opts: { userId?: string | null; companyId?: string | null; invoiceLimit?: number }
) {
  let query = client
    .from('invoices')
    .select('issue_date, status, invoice_type_code, notes, direction, invoice_items(description, quantity, unit_price, tva_rate, unit_code, vat_category, vat_exemption_reason, discount_percent)')
    .neq('status', 'draft')
    .order('issue_date', { ascending: false })
    .limit(opts.invoiceLimit ?? 40)
  query = scopedQuery(query, opts.companyId, opts.userId)
  const { data, error } = await query
  if (error || !data) return [] as CatalogSuggestion[]

  const seen = new Set<string>()
  const lines: CatalogSuggestion[] = []
  for (const invoice of data as Array<{
    invoice_type_code?: string | null
    direction?: string | null
    notes?: string | null
    invoice_items?: Array<Record<string, unknown>> | null
  }>) {
    if (isCreditNote(invoice.invoice_type_code) || isPurchaseInvoice(invoice)) continue
    for (const item of invoice.invoice_items || []) {
      const description = normalizeCatalogName(String(item.description || ''))
      if (!description) continue
      const suggestion: CatalogSuggestion = {
        source: 'recent',
        description,
        unit_code: String(item.unit_code || 'H87'),
        unit_price: Number(item.unit_price) || 0,
        tva_rate: Number(item.tva_rate) || 0,
        vat_category: String(item.vat_category || vatCategoryFromRate(Number(item.tva_rate) || 0)),
        vat_exemption_reason: String(item.vat_exemption_reason || ''),
        discount_percent: Number(item.discount_percent) || 0
      }
      // One suggestion per article name: invoices come newest first, so the latest price wins.
      const key = catalogNameKey(suggestion.description)
      if (seen.has(key)) continue
      seen.add(key)
      lines.push(suggestion)
    }
  }
  return lines
}

export function catalogWriteRow(
  draft: CatalogDraft,
  opts: { userId: string; actorUserId?: string; companyId?: string | null; shared?: boolean }
) {
  const name = normalizeCatalogName(draft.name)
  const tva_rate = Number(draft.tva_rate) || 0
  return {
    user_id: opts.userId,
    // New articles belong to the current firm unless marked common to all firms.
    company_id: opts.shared ? null : (opts.companyId || null),
    ...(opts.actorUserId ? { created_by: opts.actorUserId } : {}),
    code: draft.code.trim(),
    name,
    kind: draft.kind === 'product' ? 'product' : 'service',
    unit_code: draft.unit_code || (draft.kind === 'product' ? 'H87' : 'E48'),
    unit_price: Number(draft.unit_price) || 0,
    tva_rate,
    vat_category: tva_rate > 0 ? 'S' : (draft.vat_category || 'Z'),
    vat_exemption_reason: tva_rate > 0 ? '' : (draft.vat_exemption_reason || ''),
    discount_percent: Number(draft.discount_percent) || 0,
    active: draft.active !== false,
    updated_at: new Date().toISOString()
  }
}

export async function touchCatalogItem(client: QueryClient, id: string) {
  await client
    .from('catalog_items')
    .update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function saveLineToCatalog(
  client: QueryClient,
  line: CatalogLineValues,
  opts: { userId: string; companyId?: string | null; items: CatalogItem[] }
) {
  const name = normalizeCatalogName(line.description)
  if (!name) return { error: 'Descrierea este goală.' }
  const existing = opts.items.find(item => catalogNameKey(item.name) === catalogNameKey(name))
  if (existing) {
    await touchCatalogItem(client, existing.id)
    return { item: existing, alreadyExisted: true }
  }
  const { data, error } = await client
    .from('catalog_items')
    .insert(catalogWriteRow({
      ...emptyCatalogDraft(),
      name,
      unit_code: line.unit_code,
      unit_price: line.unit_price,
      tva_rate: line.tva_rate,
      vat_category: line.vat_category,
      vat_exemption_reason: line.vat_exemption_reason,
      discount_percent: line.discount_percent
    }, opts))
    .select('*')
    .single()
  if (error) {
    if (isMissingCatalogTableError(error)) {
      return { error: 'Nomenclatorul nu este instalat. Rulează migrația 20260917_catalog_items.sql.' }
    }
    if (isCatalogDuplicateError(error)) {
      const loaded = await loadCatalogItems(client, { userId: opts.userId, companyId: opts.companyId, activeOnly: false })
      const item = loaded.items.find(row => catalogNameKey(row.name) === catalogNameKey(name))
      if (item) return { item, alreadyExisted: true }
    }
    return { error: error.message }
  }
  return { item: rowToCatalogItem(data), alreadyExisted: false }
}

export async function deleteCatalogItemsByName(
  client: QueryClient,
  opts: { userId: string; name: string }
) {
  const loaded = await client
    .from('catalog_items')
    .select('id, name')
    .eq('user_id', opts.userId)
  if (loaded.error) {
    if (isMissingCatalogTableError(loaded.error)) return { error: loaded.error.message, missingTable: true as const }
    return { error: loaded.error.message }
  }
  const key = catalogNameKey(opts.name)
  const ids = (loaded.data || [])
    .filter((row: { name?: string }) => catalogNameKey(String(row.name || '')) === key)
    .map((row: { id: string }) => row.id)
  if (!ids.length) return { deleted: 0 }
  const { error } = await client.from('catalog_items').delete().in('id', ids)
  if (error) return { error: error.message }
  return { deleted: ids.length }
}

export async function importCatalogFromRecent(
  client: QueryClient,
  opts: { userId: string; companyId?: string | null; items: CatalogItem[] }
) {
  const recent = await loadRecentInvoiceLines(client, { userId: opts.userId, companyId: opts.companyId, invoiceLimit: 80 })
  const known = new Set(opts.items.map(item => catalogNameKey(item.name)))
  const rows = []
  for (const line of recent) {
    const key = catalogNameKey(line.description)
    if (known.has(key)) continue
    known.add(key)
    rows.push(catalogWriteRow({
      ...emptyCatalogDraft(),
      name: line.description,
      unit_code: line.unit_code,
      unit_price: line.unit_price,
      tva_rate: line.tva_rate,
      vat_category: line.vat_category,
      vat_exemption_reason: line.vat_exemption_reason,
      discount_percent: line.discount_percent
    }, opts))
  }
  if (rows.length === 0) return { inserted: 0 }
  const { error } = await client.from('catalog_items').insert(rows)
  if (error) return { inserted: 0, error: error.message }
  return { inserted: rows.length }
}

export function kindFromUnitCode(unit_code?: string | null): CatalogKind {
  const code = String(unit_code || '').toUpperCase()
  if (code === 'E48' || code === 'MON' || code === 'HUR' || code === 'DAY') return 'service'
  return 'product'
}

export type PurchaseCatalogLine = {
  description?: string | null
  unit_code?: string | null
  unit_price?: number | null
  tva_rate?: number | null
  vat_category?: string | null
  vat_exemption_reason?: string | null
  discount_percent?: number | null
}

/** Adds new nomenclator articles from e-Factura purchase lines. Never overwrites an existing name/price. */
export async function importCatalogFromPurchaseLines(
  client: QueryClient,
  opts: {
    userId: string
    actorUserId?: string
    companyId?: string | null
    lines: PurchaseCatalogLine[]
  }
) {
  const loaded = await loadCatalogItems(client, {
    userId: opts.userId,
    companyId: opts.companyId,
    activeOnly: false
  })
  if (loaded.missingTable) return { inserted: 0, skipped: opts.lines.length, missingTable: true as const }

  const known = new Set(loaded.items.map(item => catalogNameKey(item.name)))
  let inserted = 0
  let skipped = 0

  for (const line of opts.lines) {
    const name = normalizeCatalogName(String(line.description || ''))
    if (!name) continue
    const key = catalogNameKey(name)
    if (known.has(key)) {
      skipped += 1
      continue
    }
    known.add(key)
    const unit_code = String(line.unit_code || 'H87')
    const tva_rate = Number(line.tva_rate || 0)
    let row = catalogWriteRow({
      ...emptyCatalogDraft(),
      name,
      kind: kindFromUnitCode(unit_code),
      unit_code,
      unit_price: Number(line.unit_price) || 0,
      tva_rate,
      vat_category: String(line.vat_category || vatCategoryFromRate(tva_rate)),
      vat_exemption_reason: String(line.vat_exemption_reason || ''),
      discount_percent: Number(line.discount_percent) || 0
    }, opts)

    let { error } = await client.from('catalog_items').insert(row)
    if (error && String(error.message || '').toLowerCase().includes('created_by')) {
      const { created_by: _omit, ...withoutCreatedBy } = row as typeof row & { created_by?: string }
      row = withoutCreatedBy
      const retry = await client.from('catalog_items').insert(row)
      error = retry.error
    }
    if (error && isCatalogDuplicateError(error)) {
      skipped += 1
      continue
    }
    if (error) {
      if (isMissingCatalogTableError(error)) return { inserted, skipped, missingTable: true as const }
      return { inserted, skipped, error: error.message }
    }
    inserted += 1
  }

  return { inserted, skipped }
}

export function filterSuggestions(
  query: string,
  catalog: CatalogItem[],
  recent: CatalogSuggestion[],
  limit = 8
) {
  const q = catalogNameKey(query)
  const catalogMatches = catalog
    .filter(item => item.active)
    .filter(item => {
      if (!q) return true
      return catalogNameKey(item.name).includes(q) || catalogNameKey(item.code).includes(q)
    })
    .sort((a, b) => {
      const aUsed = a.last_used_at || ''
      const bUsed = b.last_used_at || ''
      if (aUsed !== bUsed) return bUsed.localeCompare(aUsed)
      return a.name.localeCompare(b.name, 'ro')
    })
    .slice(0, limit)
    .map(item => ({
      source: 'catalog' as const,
      catalogId: item.id,
      code: item.code,
      ...itemToLineValues(item)
    }))

  const catalogKeys = new Set(catalogMatches.map(item => catalogNameKey(item.description)))
  const recentMatches = recent
    .filter(line => {
      if (catalogKeys.has(catalogNameKey(line.description))) return false
      if (!q) return true
      return catalogNameKey(line.description).includes(q)
    })
    .slice(0, limit)
  return { catalogMatches, recentMatches }
}

/** VAT rates in force since 1 Aug 2025 (Legea 141/2025); anything else is an old rate. */
const CURRENT_VAT_RATES = [21, 11, 0]

function looseKey(name: string) {
  return normalizeCatalogName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bserviciu\b/g, 'servicii')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export type CatalogWarning = { oldVat: boolean; duplicateOf: string | null }

/** Flags articles with an outdated VAT rate and names that differ only by case, diacritics or singular/plural. */
export function catalogWarnings(items: CatalogItem[]): Record<string, CatalogWarning> {
  const firstByKey = new Map<string, CatalogItem>()
  const out: Record<string, CatalogWarning> = {}
  for (const item of items) {
    const key = looseKey(item.name)
    const first = firstByKey.get(key)
    if (!first) firstByKey.set(key, item)
    out[item.id] = {
      oldVat: item.active && !CURRENT_VAT_RATES.includes(Number(item.tva_rate)),
      duplicateOf: first && first.id !== item.id && item.active ? first.name : null
    }
  }
  return out
}
