'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useLocale } from '@/components/LocaleProvider'
import { useCompany } from '@/components/CompanyProvider'
import { unitMessageKey, vatCategoryKey } from '@/lib/uiLabels'
import { supabase } from '@/lib/supabase'
import { UNIT_CODES, VAT_CATEGORIES, unitLabel, vatCategoryFromRate } from '@/lib/efactura'
import { formatAmount } from '@/lib/money'
import { vatRateOptions } from '@/lib/invoiceMath'
import {
  catalogWarnings,
  catalogWriteRow,
  emptyCatalogDraft,
  importCatalogFromRecent,
  isCatalogDuplicateError,
  loadCatalogItems,
  type CatalogDraft,
  type CatalogItem
} from '@/lib/catalog'

export default function NomenclatorPage() {
  const router = useRouter()
  const { t } = useLocale()
  const { userId, ownerUserId, company, companies, loading: companyLoading } = useCompany()
  const [items, setItems] = useState<CatalogItem[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<CatalogItem | null>(null)
  const [form, setForm] = useState<CatalogDraft>(emptyCatalogDraft())
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  // Common to all firms (company_id null) vs. only the current firm.
  const [shared, setShared] = useState(false)
  const [fixingId, setFixingId] = useState('')

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await loadItems()
    }
    init()
  }, [ownerUserId, userId, companyLoading, company?.id])

  const loadItems = async () => {
    const result = await loadCatalogItems(supabase, {
      userId: ownerUserId || userId,
      companyId: company?.id,
      activeOnly: false
    })
    setMissingTable(!!result.missingTable)
    setItems(result.items)
    setLoading(false)
  }

  const filtered = search.trim()
    ? items.filter(item =>
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.code.toLowerCase().includes(search.toLowerCase())
      )
    : items

  const warnings = catalogWarnings(items)
  const firmName = company?.company_name || ''

  const fixVat = async (item: CatalogItem) => {
    setFixingId(item.id)
    const { error } = await supabase.from('catalog_items').update({ tva_rate: 21, vat_category: 'S', vat_exemption_reason: '', updated_at: new Date().toISOString() }).eq('id', item.id)
    setFixingId('')
    if (error) { alert(error.message); return }
    await loadItems()
  }

  const deactivate = async (item: CatalogItem) => {
    setFixingId(item.id)
    const { error } = await supabase.from('catalog_items').update({ active: false, updated_at: new Date().toISOString() }).eq('id', item.id)
    setFixingId('')
    if (error) { alert(error.message); return }
    await loadItems()
  }

  const openNew = () => {
    setEditItem(null)
    setShared(false)
    setForm(emptyCatalogDraft())
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openEdit = (item: CatalogItem) => {
    setEditItem(item)
    setShared(!item.company_id)
    setForm({
      code: item.code,
      name: item.name,
      kind: item.kind,
      unit_code: item.unit_code,
      unit_price: item.unit_price,
      tva_rate: item.tva_rate,
      vat_category: item.vat_category,
      vat_exemption_reason: item.vat_exemption_reason,
      discount_percent: item.discount_percent,
      active: item.active
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const setKind = (kind: CatalogDraft['kind']) => {
    setForm(f => ({
      ...f,
      kind,
      unit_code: kind === 'service'
        ? (f.unit_code === 'H87' ? 'E48' : f.unit_code)
        : (f.unit_code === 'E48' ? 'H87' : f.unit_code)
    }))
  }

  const save = async () => {
    if (!userId) return
    if (!form.name.trim()) {
      alert(t('cat.nameRequired'))
      return
    }
    setSaving(true)
    const payload = catalogWriteRow(form, { userId: ownerUserId || userId, actorUserId: userId, companyId: company?.id, shared })
    const result = editItem
      ? await supabase.from('catalog_items').update(payload).eq('id', editItem.id)
      : await supabase.from('catalog_items').insert(payload)
    setSaving(false)
    if (result.error) {
      alert(isCatalogDuplicateError(result.error)
        ? t('cat.dup')
        : result.error.message)
      return
    }
    setShowForm(false)
    setEditItem(null)
    await loadItems()
  }

  const remove = async (item: CatalogItem) => {
    if (!confirm(t('cat.confirmDelete', { name: item.name }))) return
    // Only this article: a same-named article of another firm stays.
    const result = await supabase.from('catalog_items').delete().eq('id', item.id)
    if (result.error) {
      alert(result.error.message)
      return
    }
    await loadItems()
  }

  const importRecent = async () => {
    if (!userId) return
    setImporting(true)
    const result = await importCatalogFromRecent(supabase, {
      userId: ownerUserId || userId,
      companyId: company?.id,
      items
    })
    setImporting(false)
    if (result.error) {
      alert(result.error)
      return
    }
    if (!result.inserted) {
      alert(t('cat.noImport'))
      return
    }
    await loadItems()
  }

  if (loading || companyLoading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppNav active="nomenclator" />
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">{t('cat.title')}</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              {t('cat.lead')}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={importRecent} disabled={importing || missingTable} className="btn btn-outline disabled:opacity-50">
              {importing ? t('common.importing') : t('cat.import')}
            </button>
            <button onClick={openNew} disabled={missingTable} className="btn btn-primary disabled:opacity-50">
              {t('cat.newBtn')}
            </button>
          </div>
        </div>

        {missingTable && (
          <div className="card p-6 mb-6">
            <p className="font-medium text-[color:var(--color-foreground)]">{t('cat.missing')}</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
              {t('cat.missingLead')}
            </p>
          </div>
        )}

        {showForm && !missingTable && (
          <div className="card p-8 mb-6">
            <div className="flex items-start justify-between mb-6">
              <h3 className="font-bold text-[color:var(--color-foreground)] text-lg">
                {editItem ? t('cat.edit') : t('cat.new')}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditItem(null) }}
                className="text-gray-300 hover:text-gray-500 transition text-xl"
              >×</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cat.name')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input"
                  placeholder={t('cat.namePh')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cat.code')}</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className="input"
                  placeholder={t('common.optional')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cat.kind')}</label>
                <select
                  value={form.kind}
                  onChange={e => setKind(e.target.value as CatalogDraft['kind'])}
                  className="input bg-white"
                >
                  <option value="service">{t('cat.service')}</option>
                  <option value="product">{t('cat.product')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('inv.unit')}</label>
                <select
                  value={form.unit_code}
                  onChange={e => setForm(f => ({ ...f, unit_code: e.target.value }))}
                  className="input bg-white"
                >
                  {UNIT_CODES.map(unit => (
                    <option key={unit.code} value={unit.code}>{unitMessageKey(unit.code) ? t(unitMessageKey(unit.code)!) : unit.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('inv.unitPrice')}</label>
                <input
                  type="number"
                  min="0"
                  value={form.unit_price}
                  onChange={e => setForm(f => ({ ...f, unit_price: parseFloat(e.target.value) || 0 }))}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cat.discount')}</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.discount_percent}
                  onChange={e => setForm(f => ({ ...f, discount_percent: parseFloat(e.target.value) || 0 }))}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('inv.vat')}</label>
                <select
                  value={form.tva_rate}
                  onChange={e => {
                    const tva_rate = parseFloat(e.target.value)
                    setForm(f => ({
                      ...f,
                      tva_rate,
                      vat_category: vatCategoryFromRate(tva_rate, f.vat_category),
                      vat_exemption_reason: tva_rate > 0 ? '' : f.vat_exemption_reason
                    }))
                  }}
                  className="input bg-white"
                >
                  {vatRateOptions(form.tva_rate).map(rate => (
                    <option key={rate} value={rate}>{rate}%</option>
                  ))}
                </select>
              </div>
              {form.tva_rate === 0 && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cat.vatCat')}</label>
                    <select
                      value={form.vat_category}
                      onChange={e => setForm(f => ({ ...f, vat_category: e.target.value }))}
                      className="input bg-white"
                    >
                      {VAT_CATEGORIES.filter(cat => cat.code !== 'S').map(cat => (
                        <option key={cat.code} value={cat.code}>{vatCategoryKey(cat.code) ? t(vatCategoryKey(cat.code)!) : cat.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cat.exemption')}</label>
                    <input
                      type="text"
                      value={form.vat_exemption_reason}
                      onChange={e => setForm(f => ({ ...f, vat_exemption_reason: e.target.value }))}
                      className="input"
                    />
                  </div>
                </>
              )}
              {company && (
                <label className="md:col-span-2 flex items-center gap-2 text-sm text-[color:var(--color-foreground)]">
                  <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} />
                  {t('cat.shared')}
                  <span className="text-xs text-[color:var(--color-muted-foreground)]">
                    {shared ? t('cat.sharedHint') : t('cat.firmHint', { firm: firmName })}
                  </span>
                </label>
              )}
              {editItem && (
                <label className="md:col-span-2 flex items-center gap-2 text-sm text-[color:var(--color-foreground)]">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  />
                  {t('cat.active')}
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setShowForm(false); setEditItem(null) }} className="btn btn-outline">
                {t('common.cancel')}
              </button>
              <button onClick={save} disabled={saving} className="btn btn-primary disabled:opacity-50">
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        )}

        {!missingTable && items.length > 0 && (
          <div className="card p-5 mb-6">
            <label className="block text-xs font-medium text-[color:var(--color-muted-foreground)] mb-1">
              {t('cat.search')}
            </label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input"
              placeholder={t('cat.searchPh')}
            />
          </div>
        )}

        {!missingTable && filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="font-medium text-[color:var(--color-foreground)]">
              {items.length === 0 ? t('cat.empty') : t('cat.noneFound')}
            </p>
            <p className="text-[color:var(--color-muted-foreground)] text-sm mt-1 mb-4">
              {items.length === 0
                ? t('cat.emptyLead')
                : t('cat.tryOther')}
            </p>
            {items.length === 0 ? (
              <div className="flex justify-center gap-2">
                <button onClick={importRecent} disabled={importing} className="btn btn-outline">
                  {t('cat.import')}
                </button>
                <button onClick={openNew} className="btn btn-primary">{t('cat.newBtn')}</button>
              </div>
            ) : (
              <button onClick={() => setSearch('')} className="btn btn-outline">{t('cli.resetSearch')}</button>
            )}
          </div>
        ) : !missingTable ? (
          <div className="card overflow-hidden">
            <div className="grid grid-cols-12 px-6 py-3 border-b border-gray-100 bg-gray-50">
              <span className="col-span-5 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('cat.item')}</span>
              <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('inv.unit')}</span>
              <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('cat.price')}</span>
              <span className="col-span-1 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('inv.vat')}</span>
              <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider text-right">{t('common.actions')}</span>
            </div>
            {filtered.map((item, i) => (
              <div
                key={item.id}
                className={`grid grid-cols-12 px-6 py-3 items-center ${i !== filtered.length - 1 ? 'border-b border-gray-50' : ''} ${item.active ? '' : 'opacity-50'}`}
              >
                <div className="col-span-5 min-w-0">
                  <p className="font-medium text-[color:var(--color-foreground)] truncate">{item.name}</p>
                  <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">
                    {item.kind === 'product' ? t('cat.product') : t('cat.service')}
                    {item.code ? ` · ${item.code}` : ''}
                    {item.active ? '' : ` · ${t('cat.inactive')}`}
                    {companies.length > 1 && ` · ${item.company_id ? t('cat.scopeFirm', { firm: firmName }) : t('cat.scopeShared')}`}
                  </p>
                  {warnings[item.id]?.oldVat && (
                    <p className="text-xs text-amber-800 mt-1">
                      {t('cat.oldVat', { rate: item.tva_rate })}{' '}
                      <button type="button" className="underline font-medium" disabled={fixingId === item.id} onClick={() => fixVat(item)}>{t('cat.fixVat')}</button>
                      {' · '}
                      <button type="button" className="underline" disabled={fixingId === item.id} onClick={() => deactivate(item)}>{t('cat.deactivate')}</button>
                    </p>
                  )}
                  {warnings[item.id]?.duplicateOf && (
                    <p className="text-xs text-amber-800 mt-1">
                      {t('cat.similar', { name: warnings[item.id].duplicateOf! })}{' '}
                      <button type="button" className="underline" disabled={fixingId === item.id} onClick={() => deactivate(item)}>{t('cat.deactivate')}</button>
                    </p>
                  )}
                </div>
                <p className="col-span-2 text-sm text-[color:var(--color-muted-foreground)]">{unitMessageKey(item.unit_code) ? t(unitMessageKey(item.unit_code)!) : unitLabel(item.unit_code)}</p>
                <p className="col-span-2 text-sm tabular-nums">{formatAmount(item.unit_price)}</p>
                <p className="col-span-1 text-sm tabular-nums">{item.tva_rate}%</p>
                <div className="col-span-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => openEdit(item)}
                    className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    onClick={() => remove(item)}
                    className="text-xs border border-red-100 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
