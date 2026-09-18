import { vatCategoryFromRate } from '@/lib/efactura'
import { isCreditNote } from '@/lib/invoiceStatus'

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

export async function loadCatalogItems(
  client: QueryClient,
  opts: { userId?: string | null; companyId?: string | null; activeOnly?: boolean }
) {
  let query = client
    .from('catalog_items')
    .select('*')
    .order('name', { ascending: true })
  query = scopedQuery(query, opts.companyId, opts.userId)
  if (opts.activeOnly !== false) query = query.eq('active', true)
  const { data, error } = await query
  if (error) {
    if (isMissingCatalogTableError(error)) return { items: [] as CatalogItem[], missingTable: true }
    return { items: [] as CatalogItem[], missingTable: false, error: error.message }
  }
  return { items: (data || []).map(rowToCatalogItem), missingTable: false }
}

export async function loadRecentInvoiceLines(
  client: QueryClient,
  opts: { userId?: string | null; companyId?: string | null; invoiceLimit?: number }
) {
  let query = client
    .from('invoices')
    .select('issue_date, status, invoice_type_code, invoice_items(description, quantity, unit_price, tva_rate, unit_code, vat_category, vat_exemption_reason, discount_percent)')
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
    invoice_items?: Array<Record<string, unknown>> | null
  }>) {
    if (isCreditNote(invoice.invoice_type_code)) continue
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
      const key = suggestionKey(suggestion)
      if (seen.has(key)) continue
      seen.add(key)
      lines.push(suggestion)
    }
  }
  return lines
}

export function catalogWriteRow(draft: CatalogDraft, opts: { userId: string; actorUserId?: string; companyId?: string | null }) {
  const name = normalizeCatalogName(draft.name)
  const tva_rate = Number(draft.tva_rate) || 0
  return {
    user_id: opts.userId,
    ...(opts.actorUserId ? { created_by: opts.actorUserId } : {}),
    ...(opts.companyId ? { company_id: opts.companyId } : {}),
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
    return { error: error.message }
  }
  return { item: rowToCatalogItem(data), alreadyExisted: false }
}

export async function importCatalogFromRecent(
  client: QueryClient,
  opts: { userId: string; companyId?: string | null; items: CatalogItem[] }
) {
  const recent = await loadRecentInvoiceLines(client, { ...opts, invoiceLimit: 80 })
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
