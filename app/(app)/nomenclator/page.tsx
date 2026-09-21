'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { supabase } from '@/lib/supabase'
import { UNIT_CODES, VAT_CATEGORIES, unitLabel, vatCategoryFromRate } from '@/lib/efactura'
import { formatAmount } from '@/lib/money'
import { vatRateOptions } from '@/lib/invoiceMath'
import {
  catalogWriteRow,
  deleteCatalogItemsByName,
  emptyCatalogDraft,
  importCatalogFromRecent,
  isCatalogDuplicateError,
  loadCatalogItems,
  type CatalogDraft,
  type CatalogItem
} from '@/lib/catalog'

export default function NomenclatorPage() {
  const router = useRouter()
  const { userId, ownerUserId, loading: companyLoading } = useCompany()
  const [items, setItems] = useState<CatalogItem[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<CatalogItem | null>(null)
  const [form, setForm] = useState<CatalogDraft>(emptyCatalogDraft())
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await loadItems()
    }
    init()
  }, [ownerUserId, userId, companyLoading])

  const loadItems = async () => {
    const result = await loadCatalogItems(supabase, {
      userId: ownerUserId || userId,
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

  const openNew = () => {
    setEditItem(null)
    setForm(emptyCatalogDraft())
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openEdit = (item: CatalogItem) => {
    setEditItem(item)
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
      alert('Denumirea este obligatorie.')
      return
    }
    setSaving(true)
    const payload = catalogWriteRow(form, { userId: ownerUserId || userId, actorUserId: userId })
    const result = editItem
      ? await supabase.from('catalog_items').update(payload).eq('id', editItem.id)
      : await supabase.from('catalog_items').insert(payload)
    setSaving(false)
    if (result.error) {
      alert(isCatalogDuplicateError(result.error)
        ? 'Există deja un articol cu această denumire în nomenclator.'
        : result.error.message)
      return
    }
    setShowForm(false)
    setEditItem(null)
    await loadItems()
  }

  const remove = async (item: CatalogItem) => {
    if (!confirm(`Ștergi „${item.name}” din nomenclator? Articolul dispare de pe toate firmele din profil.`)) return
    const result = await deleteCatalogItemsByName(supabase, {
      userId: ownerUserId || userId,
      name: item.name
    })
    if (result.error) {
      alert(result.error)
      return
    }
    await loadItems()
  }

  const importRecent = async () => {
    if (!userId) return
    setImporting(true)
    const result = await importCatalogFromRecent(supabase, {
      userId: ownerUserId || userId,
      items
    })
    setImporting(false)
    if (result.error) {
      alert(result.error)
      return
    }
    if (!result.inserted) {
      alert('Nu sunt linii noi de importat din facturile emise.')
      return
    }
    await loadItems()
  }

  if (loading || companyLoading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-gray-500">Se încarcă...</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppNav active="nomenclator" />
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">Nomenclator articole</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              Nomenclator comun pentru toate firmele din profil. Articolele din facturi emise sau din e-Factura se adaugă o dată și sunt disponibile pe orice firmă.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={importRecent} disabled={importing || missingTable} className="btn btn-outline disabled:opacity-50">
              {importing ? 'Se importă...' : 'Importă din facturi'}
            </button>
            <button onClick={openNew} disabled={missingTable} className="btn btn-primary disabled:opacity-50">
              + Articol nou
            </button>
          </div>
        </div>

        {missingTable && (
          <div className="card p-6 mb-6">
            <p className="font-medium text-[color:var(--color-foreground)]">Nomenclatorul nu este instalat pe baza de date.</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
              Rulează migrația <span className="font-mono">20260917_catalog_items.sql</span> în Supabase, apoi reîncarcă pagina.
            </p>
          </div>
        )}

        {showForm && !missingTable && (
          <div className="card p-8 mb-6">
            <div className="flex items-start justify-between mb-6">
              <h3 className="font-bold text-[color:var(--color-foreground)] text-lg">
                {editItem ? 'Editează articol' : 'Articol nou'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditItem(null) }}
                className="text-gray-300 hover:text-gray-500 transition text-xl"
              >×</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Denumire</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input"
                  placeholder="ex: Consultanță contabilă"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Cod articol</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className="input"
                  placeholder="opțional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Tip</label>
                <select
                  value={form.kind}
                  onChange={e => setKind(e.target.value as CatalogDraft['kind'])}
                  className="input bg-white"
                >
                  <option value="service">Serviciu</option>
                  <option value="product">Produs</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">UM</label>
                <select
                  value={form.unit_code}
                  onChange={e => setForm(f => ({ ...f, unit_code: e.target.value }))}
                  className="input bg-white"
                >
                  {UNIT_CODES.map(unit => (
                    <option key={unit.code} value={unit.code}>{unit.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Preț unitar</label>
                <input
                  type="number"
                  min="0"
                  value={form.unit_price}
                  onChange={e => setForm(f => ({ ...f, unit_price: parseFloat(e.target.value) || 0 }))}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Discount %</label>
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
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">TVA %</label>
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
                    <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Categorie TVA</label>
                    <select
                      value={form.vat_category}
                      onChange={e => setForm(f => ({ ...f, vat_category: e.target.value }))}
                      className="input bg-white"
                    >
                      {VAT_CATEGORIES.filter(cat => cat.code !== 'S').map(cat => (
                        <option key={cat.code} value={cat.code}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Motiv scutire</label>
                    <input
                      type="text"
                      value={form.vat_exemption_reason}
                      onChange={e => setForm(f => ({ ...f, vat_exemption_reason: e.target.value }))}
                      className="input"
                    />
                  </div>
                </>
              )}
              {editItem && (
                <label className="md:col-span-2 flex items-center gap-2 text-sm text-[color:var(--color-foreground)]">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  />
                  Activ — apare la completarea facturii
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setShowForm(false); setEditItem(null) }} className="btn btn-outline">
                Anulează
              </button>
              <button onClick={save} disabled={saving} className="btn btn-primary disabled:opacity-50">
                {saving ? 'Se salvează...' : 'Salvează'}
              </button>
            </div>
          </div>
        )}

        {!missingTable && items.length > 0 && (
          <div className="card p-5 mb-6">
            <label className="block text-xs font-medium text-[color:var(--color-muted-foreground)] mb-1">
              Caută articol
            </label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input"
              placeholder="Denumire sau cod..."
            />
          </div>
        )}

        {!missingTable && filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="font-medium text-[color:var(--color-foreground)]">
              {items.length === 0 ? 'Nomenclatorul este gol' : 'Niciun articol găsit'}
            </p>
            <p className="text-[color:var(--color-muted-foreground)] text-sm mt-1 mb-4">
              {items.length === 0
                ? 'Adaugă serviciile recurente o dată; apar pe toate firmele din profil. Poți importa și liniile deja emise.'
                : 'Încearcă alt termen de căutare.'}
            </p>
            {items.length === 0 ? (
              <div className="flex justify-center gap-2">
                <button onClick={importRecent} disabled={importing} className="btn btn-outline">
                  Importă din facturi
                </button>
                <button onClick={openNew} className="btn btn-primary">+ Articol nou</button>
              </div>
            ) : (
              <button onClick={() => setSearch('')} className="btn btn-outline">Resetează căutarea</button>
            )}
          </div>
        ) : !missingTable ? (
          <div className="card overflow-hidden">
            <div className="grid grid-cols-12 px-6 py-3 border-b border-gray-100 bg-gray-50">
              <span className="col-span-5 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">Articol</span>
              <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">UM</span>
              <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">Preț</span>
              <span className="col-span-1 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">TVA</span>
              <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider text-right">Acțiuni</span>
            </div>
            {filtered.map((item, i) => (
              <div
                key={item.id}
                className={`grid grid-cols-12 px-6 py-3 items-center ${i !== filtered.length - 1 ? 'border-b border-gray-50' : ''} ${item.active ? '' : 'opacity-50'}`}
              >
                <div className="col-span-5 min-w-0">
                  <p className="font-medium text-[color:var(--color-foreground)] truncate">{item.name}</p>
                  <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">
                    {item.kind === 'product' ? 'Produs' : 'Serviciu'}
                    {item.code ? ` · ${item.code}` : ''}
                    {item.active ? '' : ' · inactiv'}
                  </p>
                </div>
                <p className="col-span-2 text-sm text-[color:var(--color-muted-foreground)]">{unitLabel(item.unit_code)}</p>
                <p className="col-span-2 text-sm tabular-nums">{formatAmount(item.unit_price)}</p>
                <p className="col-span-1 text-sm tabular-nums">{item.tva_rate}%</p>
                <div className="col-span-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => openEdit(item)}
                    className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
                  >
                    Editează
                  </button>
                  <button
                    onClick={() => remove(item)}
                    className="text-xs border border-red-100 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
                  >
                    Șterge
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
