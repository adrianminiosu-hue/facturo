'use client'
import { useEffect, useState } from 'react'
import {
  CLIENT_CONTACT_ROLES,
  emptyClientContact,
  isContactComplete,
  type ClientContactDraft
} from '@/lib/clientDirectory'
import { isValidRomanianMobile } from '@/lib/romanianMobile'

const PRESET_ROLES = CLIENT_CONTACT_ROLES.filter(role => role !== 'Altele')

export default function ClientContactsFields({
  contacts,
  onChange
}: {
  contacts: ClientContactDraft[]
  onChange: (next: ClientContactDraft[]) => void
}) {
  const rows = contacts
  const contactKeys = rows.map(row => row.key).join('|')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<ClientContactDraft | null>(null)

  useEffect(() => {
    if (editingKey && rows.some(row => row.key === editingKey)) return
    if (!editingKey) return
    setEditingKey(null)
    setSnapshot(null)
  }, [contactKeys, editingKey, rows])

  const update = (key: string, patch: Partial<ClientContactDraft>) => {
    onChange(rows.map(c => c.key === key ? { ...c, ...patch } : c))
  }

  const editing = rows.find(row => row.key === editingKey) || null
  const savedRows = rows.filter(row => row.key !== editingKey)
  const showCancel = true

  const startEdit = (row: ClientContactDraft) => {
    setSnapshot({ ...row })
    setEditingKey(row.key)
  }

  const startNew = () => {
    if (editingKey) {
      alert('Salvează sau anulează persoana curentă înainte de a adăuga alta.')
      return
    }
    const created = emptyClientContact()
    setSnapshot({ ...created })
    setEditingKey(created.key)
    onChange([...rows, created])
  }

  const saveContact = () => {
    if (!editing) return
    if (!isContactComplete(editing)) {
      alert('Completează numele persoanei de contact înainte de a salva.')
      return
    }
    if (editing.phone && !isValidRomanianMobile(editing.phone)) {
      alert('Număr de mobil invalid. Format acceptat: 07xxxxxxxx sau +407xxxxxxxx.')
      return
    }
    setEditingKey(null)
    setSnapshot(null)
  }

  const deleteContact = (row: ClientContactDraft) => {
    onChange(rows.filter(c => c.key !== row.key))
  }

  const cancelEdit = () => {
    if (!editingKey) return
    const current = rows.find(row => row.key === editingKey)
    const isNewUnsaved = !!current && !current.id && !isContactComplete(snapshot || current)
    if (isNewUnsaved) {
      onChange(savedRows)
    } else if (snapshot) {
      onChange(rows.map(row => row.key === editingKey ? snapshot : row))
    }
    setEditingKey(null)
    setSnapshot(null)
  }

  const editingPreset = editing
    ? PRESET_ROLES.includes(editing.contact_role as typeof PRESET_ROLES[number])
    : false
  const editingSelectValue = editing
    ? (editingPreset ? editing.contact_role : (editing.contact_role ? '__custom' : ''))
    : ''
  const editingPhoneValid = !editing?.phone || isValidRomanianMobile(editing.phone)

  return (
    <div className="border-t border-gray-100 pt-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">
            Persoane de contact
          </p>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
            Opțional. Completează numele, telefonul și funcția, apoi apasă Salvează persoana.
            Persoanele salvate apar ca rânduri.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          disabled={!!editingKey}
          className="btn btn-outline px-3 py-2 text-xs whitespace-nowrap disabled:opacity-50"
        >
          + Adaugă persoană de contact
        </button>
      </div>

      {savedRows.length > 0 && (
        <div className="border border-gray-100 rounded-xl overflow-hidden mb-3">
          <div className="hidden md:grid grid-cols-12 px-4 py-2 border-b border-gray-100 bg-gray-50">
            <span className="col-span-4 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">Nume</span>
            <span className="col-span-3 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">Telefon</span>
            <span className="col-span-3 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">Funcție</span>
            <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider text-right">Acțiuni</span>
          </div>
          {savedRows.map((row, index) => (
            <div
              key={row.key}
              className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-0 px-4 py-3 items-center ${index !== savedRows.length - 1 ? 'border-b border-gray-50' : ''}`}
            >
              <p className="md:col-span-4 text-sm font-medium text-[color:var(--color-foreground)] truncate">
                {row.name || '—'}
              </p>
              <p className="md:col-span-3 text-sm text-[color:var(--color-foreground)] truncate">
                {row.phone || '—'}
              </p>
              <p className="md:col-span-3 text-sm text-[color:var(--color-muted-foreground)] truncate">
                {row.contact_role || '—'}
              </p>
              <div className="md:col-span-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
                >
                  Editează
                </button>
                <button
                  type="button"
                  onClick={() => deleteContact(row)}
                  className="text-xs border border-red-100 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
                >
                  Șterge
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] mb-4">
            {savedRows.length === 0 ? 'Persoană de contact' : 'Persoană nouă / editare'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Nume *</label>
              <input
                type="text"
                value={editing.name}
                onChange={e => update(editing.key, { name: e.target.value })}
                className="input"
                placeholder="Ion Popescu"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Telefon</label>
              <input
                type="text"
                value={editing.phone}
                onChange={e => update(editing.key, { phone: e.target.value })}
                className={`input ${editing.phone && !editingPhoneValid ? 'border-red-300 bg-red-50' : ''}`}
                placeholder="ex: 0721 234 567"
              />
              {editing.phone && !editingPhoneValid && (
                <p className="text-red-500 text-xs mt-1">Mobil invalid (ex: 0721234567 sau +40721234567)</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Funcție</label>
              <select
                value={editingSelectValue}
                onChange={e => {
                  const value = e.target.value
                  if (value === '__custom') update(editing.key, { contact_role: editingPreset ? '' : editing.contact_role })
                  else update(editing.key, { contact_role: value })
                }}
                className="input bg-white"
              >
                <option value="">Selectează funcția...</option>
                {PRESET_ROLES.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
                <option value="__custom">Altele</option>
              </select>
              {editingSelectValue === '__custom' && (
                <input
                  type="text"
                  value={editing.contact_role}
                  onChange={e => update(editing.key, { contact_role: e.target.value })}
                  className="input mt-2"
                  placeholder="Funcție personalizată"
                />
              )}
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="button" onClick={saveContact} className="btn btn-primary">
              Salvează persoana
            </button>
            {showCancel && (
              <button type="button" onClick={cancelEdit} className="btn btn-outline">
                Anulează
              </button>
            )}
          </div>
        </div>
      )}

      {!editing && savedRows.length === 0 && (
        <p className="text-sm text-[color:var(--color-muted-foreground)]">Nicio persoană de contact adăugată.</p>
      )}
    </div>
  )
}
