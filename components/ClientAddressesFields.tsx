'use client'
import { useEffect, useState } from 'react'
import RoAddressFields from '@/components/RoAddressFields'
import { countyNameFromCode } from '@/lib/romania'
import {
  CLIENT_ADDRESS_TYPES,
  addClientAddress,
  canRemoveClientAddress,
  formatAddressLine,
  isAddressComplete,
  removeClientAddress,
  setDefaultAddress,
  type ClientAddressDraft
} from '@/lib/clientDirectory'
import { useLocale } from '@/components/LocaleProvider'
import { addressTypeKey } from '@/lib/uiLabels'

export default function ClientAddressesFields({
  addresses,
  onChange
}: {
  addresses: ClientAddressDraft[]
  onChange: (next: ClientAddressDraft[]) => void
}) {
  const { t } = useLocale()
  const rows = addresses
  const addressKeys = rows.map(row => row.key).join('|')
  const [editingKey, setEditingKey] = useState<string | null>(
    rows.length === 1 && !isAddressComplete(rows[0]) ? rows[0].key : null
  )
  const [snapshot, setSnapshot] = useState<ClientAddressDraft | null>(
    rows.length === 1 && !isAddressComplete(rows[0]) ? { ...rows[0] } : null
  )

  useEffect(() => {
    if (editingKey && rows.some(row => row.key === editingKey)) return
    const first = rows[0]
    if (rows.length === 1 && first && !isAddressComplete(first)) {
      setEditingKey(first.key)
      setSnapshot({ ...first })
      return
    }
    if (!editingKey) return
    setEditingKey(null)
    setSnapshot(null)
  }, [addressKeys, editingKey, rows])

  const update = (key: string, patch: Partial<ClientAddressDraft>) => {
    const source = addresses.length ? addresses : rows
    onChange(source.map(a => a.key === key ? { ...a, ...patch } : a))
  }

  const editing = rows.find(row => row.key === editingKey) || null
  const savedRows = rows.filter(row => row.key !== editingKey)
  const showCancel = savedRows.length > 0 || (!!snapshot && isAddressComplete(snapshot))

  const startEdit = (row: ClientAddressDraft) => {
    setSnapshot({ ...row })
    setEditingKey(row.key)
  }

  const startNew = () => {
    if (editingKey) {
      alert(t('addr.saveFirst'))
      return
    }
    const next = addClientAddress(rows)
    const created = next[next.length - 1]
    setSnapshot({ ...created })
    setEditingKey(created.key)
    onChange(next)
  }

  const saveAddress = () => {
    if (!editing) return
    if (!isAddressComplete(editing)) {
      alert(t('addr.completeFirst'))
      return
    }
    setEditingKey(null)
    setSnapshot(null)
  }

  const deleteAddress = (row: ClientAddressDraft) => {
    if (!canRemoveClientAddress(rows, row.key)) {
      alert(t('addr.cannotDeleteDefault'))
      return
    }
    onChange(removeClientAddress(rows, row.key))
  }

  const cancelEdit = () => {
    if (!editingKey) return
    const current = rows.find(row => row.key === editingKey)
    const isNewUnsaved = !!current && !current.id && !isAddressComplete(snapshot || current)
    if (isNewUnsaved && savedRows.length) {
      onChange(savedRows)
    } else if (snapshot) {
      onChange(rows.map(row => row.key === editingKey ? snapshot : row))
    }
    setEditingKey(null)
    setSnapshot(null)
  }

  return (
    <div className="mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">
            {t('addr.title')}
          </p>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
            {t('addr.lead')}
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          disabled={!!editingKey}
          className="btn btn-outline px-3 py-2 text-xs whitespace-nowrap disabled:opacity-50"
        >
          {t('addr.add')}
        </button>
      </div>

      {savedRows.length > 0 && (
        <div className="border border-gray-100 rounded-xl overflow-hidden mb-3">
          <div className="hidden md:grid grid-cols-12 px-4 py-2 border-b border-gray-100 bg-gray-50">
            <span className="col-span-3 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('common.type')}</span>
            <span className="col-span-5 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('common.street')}</span>
            <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('addr.default')}</span>
            <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider text-right">{t('common.actions')}</span>
          </div>
          {savedRows.map((row, index) => {
            const county = countyNameFromCode(row.county_code) || row.county
            return (
              <div
                key={row.key}
                className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-0 px-4 py-3 items-center ${index !== savedRows.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <div className="md:col-span-3 min-w-0">
                  <p className="text-sm font-medium text-[color:var(--color-foreground)] truncate">
                    {t(addressTypeKey(row.address_type))}
                  </p>
                </div>
                <div className="md:col-span-5 min-w-0">
                  <p className="text-sm text-[color:var(--color-foreground)] truncate" title={formatAddressLine(row)}>
                    {row.address || '—'}
                  </p>
                  <p className="text-xs text-[color:var(--color-muted-foreground)] truncate">
                    {[row.city, county, row.postal_code, row.country].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <label className="md:col-span-2 flex items-center gap-2 text-sm text-[color:var(--color-foreground)]">
                  <input
                    type="radio"
                    name="client-default-address"
                    checked={row.is_default}
                    onChange={() => onChange(setDefaultAddress(rows, row.key))}
                  />
                  {t('addr.default')}
                </label>
                <div className="md:col-span-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAddress(row)}
                    disabled={row.is_default}
                    title={row.is_default ? t('addr.markOther') : t('addr.deleteTitle')}
                    className="text-xs border border-red-100 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <div className="border border-gray-100 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
              {savedRows.length === 0 && rows[0]?.key === editing.key ? t('addr.hqAnaf') : t('addr.newEdit')}
            </p>
            <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground)]">
              <input
                type="radio"
                name="client-default-address"
                checked={editing.is_default}
                onChange={() => onChange(setDefaultAddress(rows, editing.key))}
              />
              {t('addr.defaultEfactura')}
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('addr.type')}</label>
              <select
                value={editing.address_type}
                onChange={e => update(editing.key, { address_type: e.target.value })}
                className="input bg-white"
              >
                {CLIENT_ADDRESS_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{t(addressTypeKey(type.value))}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">
                {t('addr.street')}
              </label>
              <input
                type="text"
                value={editing.address}
                onChange={e => update(editing.key, { address: e.target.value })}
                className="input"
                placeholder="Str. Exemplu, nr. 1"
              />
            </div>
            <RoAddressFields
              value={{
                county_code: editing.county_code,
                postal_code: editing.postal_code,
                city: editing.city,
                country: editing.country
              }}
              onChange={value => update(editing.key, value)}
            />
          </div>
          <div className="flex gap-3 mt-4">
            <button type="button" onClick={saveAddress} className="btn btn-primary">
              {t('addr.save')}
            </button>
            {showCancel && (
              <button type="button" onClick={cancelEdit} className="btn btn-outline">
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>
      )}

      {!editing && savedRows.length === 0 && (
        <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('addr.empty')}</p>
      )}
    </div>
  )
}
