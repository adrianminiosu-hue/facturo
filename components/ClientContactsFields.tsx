'use client'
import { CLIENT_CONTACT_ROLES, emptyClientContact, type ClientContactDraft } from '@/lib/clientDirectory'
import { isValidRomanianMobile } from '@/lib/romanianMobile'

const PRESET_ROLES = CLIENT_CONTACT_ROLES.filter(role => role !== 'Altele')

export default function ClientContactsFields({
  contacts,
  onChange
}: {
  contacts: ClientContactDraft[]
  onChange: (next: ClientContactDraft[]) => void
}) {
  const update = (key: string, patch: Partial<ClientContactDraft>) => {
    onChange(contacts.map(c => c.key === key ? { ...c, ...patch } : c))
  }

  return (
    <div className="border-t border-gray-100 pt-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">
            Persoane de contact
          </p>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
            Opțional. Adaugă una sau mai multe persoane (administrator, contabil etc.).
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...contacts, emptyClientContact()])}
          className="btn btn-outline px-3 py-2 text-xs whitespace-nowrap"
        >
          + Adaugă persoană de contact
        </button>
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted-foreground)]">Nicio persoană de contact adăugată.</p>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact, index) => {
            const preset = PRESET_ROLES.includes(contact.contact_role as typeof PRESET_ROLES[number])
            const selectValue = preset ? contact.contact_role : (contact.contact_role ? '__custom' : '')
            const phoneValid = !contact.phone || isValidRomanianMobile(contact.phone)
            return (
              <div key={contact.key} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                    Persoană {index + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => onChange(contacts.filter(c => c.key !== contact.key))}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Elimină
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Nume</label>
                    <input
                      type="text"
                      value={contact.name}
                      onChange={e => update(contact.key, { name: e.target.value })}
                      className="input"
                      placeholder="Ion Popescu"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Telefon</label>
                    <input
                      type="text"
                      value={contact.phone}
                      onChange={e => update(contact.key, { phone: e.target.value })}
                      className={`input ${contact.phone && !phoneValid ? 'border-red-300 bg-red-50' : ''}`}
                      placeholder="0721 234 567 sau +40721234567"
                    />
                    {contact.phone && !phoneValid && (
                      <p className="text-red-500 text-xs mt-1">Mobil invalid (ex: 0721234567 sau +40721234567)</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Funcție</label>
                    <select
                      value={selectValue}
                      onChange={e => {
                        const value = e.target.value
                        if (value === '__custom') update(contact.key, { contact_role: preset ? '' : contact.contact_role })
                        else update(contact.key, { contact_role: value })
                      }}
                      className="input bg-white"
                    >
                      <option value="">Selectează funcția...</option>
                      {PRESET_ROLES.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                      <option value="__custom">Altele</option>
                    </select>
                    {selectValue === '__custom' && (
                      <input
                        type="text"
                        value={contact.contact_role}
                        onChange={e => update(contact.key, { contact_role: e.target.value })}
                        className="input mt-2"
                        placeholder="Funcție personalizată"
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
