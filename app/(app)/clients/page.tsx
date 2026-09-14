'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { isValidRomanianMobile } from '@/lib/romanianMobile'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import ClientContactsFields from '@/components/ClientContactsFields'
import ClientAddressesFields from '@/components/ClientAddressesFields'
import { countyCodeFromName } from '@/lib/romania'
import {
  addressInsertRows,
  addressTypeLabel,
  addressesFromClient,
  applyCuiToDefaultAddress,
  contactInsertRows,
  contactsFromRows,
  defaultAddressFields,
  defaultAddressFromList,
  emptyClientAddress,
  type ClientAddressDraft,
  type ClientAddressRow,
  type ClientContactDraft,
  type ClientContactRow
} from '@/lib/clientDirectory'

const ROMANIAN_BANKS = [
  'Banca Transilvania',
  'UniCredit Bank',
  'Raiffeisen Bank',
  'BCR',
  'BRD',
  'ING Bank',
  'Alpha Bank',
  'CEC Bank',
  'OTP Bank',
  'Garanti BBVA'
]

interface Client {
  id: string
  user_id?: string
  company_id?: string | null
  company_name: string
  cui: string
  reg_com: string
  address: string
  city: string
  county: string
  county_code?: string
  postal_code?: string
  country?: string
  vat_registered?: boolean
  email: string
  phone: string
  bank_name: string
  iban: string
  client_contacts?: ClientContactRow[]
  client_addresses?: ClientAddressRow[]
}

const emptyForm = {
  company_name: '',
  cui: '',
  reg_com: '',
  vat_registered: true,
  email: '',
  phone: '',
  bank_name: '',
  iban: ''
}

export default function Clients() {
  const router = useRouter()
  const { userId, company, loading: companyLoading } = useCompany()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [cuiLoading, setCuiLoading] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [contacts, setContacts] = useState<ClientContactDraft[]>([])
  const [addresses, setAddresses] = useState<ClientAddressDraft[]>([emptyClientAddress(true)])
  const [search, setSearch] = useState('')
  const [manualEdit, setManualEdit] = useState(false)

  const phoneValid = !form.phone || isValidRomanianMobile(form.phone)
  const ibanValid = !form.iban || (form.iban.startsWith('RO') && form.iban.length === 24)

  const filteredClients = search.trim()
    ? clients.filter(c =>
        c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
        (c.cui || '').includes(search.trim())
      )
    : clients

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      loadClients()
    }
    init()
  }, [company?.id, userId, companyLoading])

  const loadClients = async () => {
    let query = supabase
      .from('clients')
      .select('*, client_contacts(*), client_addresses(*)')
      .order('created_at', { ascending: false })
    query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', userId)
    const { data, error } = await query
    if (error) {
      let fallback = supabase.from('clients').select('*').order('created_at', { ascending: false })
      fallback = company?.id ? fallback.eq('company_id', company.id) : fallback.eq('user_id', userId)
      const { data: rows } = await fallback
      setClients((rows || []) as Client[])
    } else {
      setClients((data || []) as Client[])
    }
    setLoading(false)
  }

  const lookupCUI = async () => {
    if (!form.cui || form.cui.length < 2) return
    setCuiLoading(true)
    try {
      const res = await fetch('/api/cui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cui: form.cui })
      })
      const data = await res.json()
      if (data.success) {
        setForm(f => ({
          ...f,
          company_name: data.company_name || f.company_name,
          reg_com: data.reg_com || f.reg_com,
          vat_registered: data.vat_registered ?? f.vat_registered
        }))
        setAddresses(current => applyCuiToDefaultAddress(current, {
          address: data.address,
          city: data.city,
          county: data.county,
          county_code: data.county_code,
          postal_code: data.postal_code
        }))
      } else {
        alert('CUI negăsit în registrul public. Verifică numărul și încearcă din nou.')
      }
    } catch (e) {
      alert('Eroare de conexiune. Încearcă din nou.')
    }
    setCuiLoading(false)
  }

  const openNew = () => {
    setEditClient(null)
    setForm(emptyForm)
    setContacts([])
    setAddresses([emptyClientAddress(true)])
    setManualEdit(false)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openEdit = (client: Client) => {
    setEditClient(client)
    setForm({
      company_name: client.company_name,
      cui: client.cui || '',
      reg_com: client.reg_com || '',
      vat_registered: client.vat_registered !== false,
      email: client.email || '',
      phone: client.phone || '',
      bank_name: client.bank_name || '',
      iban: client.iban || ''
    })
    setContacts(contactsFromRows(client.client_contacts))
    const loaded = addressesFromClient({
      ...client,
      county_code: client.county_code || countyCodeFromName(client.county) || ''
    })
    setAddresses(loaded.length ? loaded : [emptyClientAddress(true)])
    setManualEdit(false)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveRelations = async (clientId: string) => {
    const companyId = company?.id || editClient?.company_id
    await supabase.from('client_contacts').delete().eq('client_id', clientId)
    const contactRows = contactInsertRows(clientId, userId, companyId, contacts)
    if (contactRows.length) {
      const { error } = await supabase.from('client_contacts').insert(contactRows)
      if (error) return error.message
    }

    await supabase.from('client_addresses').delete().eq('client_id', clientId).eq('is_default', false)
    await supabase.from('client_addresses').delete().eq('client_id', clientId)
    const addressRows = addressInsertRows(clientId, userId, companyId, addresses)
    if (addressRows.length) {
      const { error } = await supabase.from('client_addresses').insert(addressRows)
      if (error) return error.message
    }
    return null
  }

  const saveClient = async () => {
    if (!form.company_name) return
    if (form.phone && !isValidRomanianMobile(form.phone)) {
      alert('Număr de mobil invalid. Format acceptat: 07xxxxxxxx sau +407xxxxxxxx.')
      return
    }
    if (form.iban && !ibanValid) {
      alert('IBAN invalid! Trebuie să înceapă cu RO și să aibă exact 24 de caractere.')
      return
    }
    for (const contact of contacts) {
      if (contact.phone && !isValidRomanianMobile(contact.phone)) {
        alert(`Telefon invalid pentru ${contact.name || 'persoana de contact'}. Folosește 07xxxxxxxx sau +407xxxxxxxx.`)
        return
      }
    }
    if (!addresses.length) {
      alert('Adaugă cel puțin o adresă (cea implicită este folosită în e-Factura).')
      return
    }
    setSaving(true)
    const addressFields = defaultAddressFields(addresses)
    const payload = {
      ...form,
      ...addressFields
    }
    if (editClient) {
      const { error } = await supabase
        .from('clients')
        .update({
          email: form.email,
          phone: form.phone,
          bank_name: form.bank_name,
          iban: form.iban,
          address: payload.address,
          county_code: payload.county_code,
          postal_code: payload.postal_code,
          country: payload.country,
          city: payload.city,
          county: payload.county,
          vat_registered: form.vat_registered
        })
        .eq('id', editClient.id)
      if (error) {
        alert(error.message)
        setSaving(false)
        return
      }
      const relError = await saveRelations(editClient.id)
      if (relError) {
        alert(`Clientul a fost salvat, dar adresele/contactele nu: ${relError}`)
        setSaving(false)
        return
      }
      setShowForm(false)
      setEditClient(null)
      loadClients()
    } else {
      const { data, error } = await supabase
        .from('clients')
        .insert({ ...payload, user_id: userId, ...(company?.id ? { company_id: company.id } : {}) })
        .select('*')
        .single()
      if (error || !data) {
        alert(error?.message || 'Clientul nu a putut fi salvat.')
        setSaving(false)
        return
      }
      const relError = await saveRelations(data.id)
      if (relError) {
        alert(`Clientul a fost salvat, dar adresele/contactele nu: ${relError}`)
        setEditClient(data)
        setSaving(false)
        return
      }
      setShowForm(false)
      setForm(emptyForm)
      loadClients()
    }
    setSaving(false)
  }

  const deleteClient = async (id: string) => {
    if (!confirm('Ești sigur că vrei să ștergi acest client?')) return
    await supabase.from('clients').delete().eq('id', id)
    loadClients()
  }

  return (
    <div className="app-shell">
      <AppNav active="clients" />

      <div className="max-w-5xl mx-auto px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">Clienți</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              {company?.company_name ? `${company.company_name} · ` : ''}
              {filteredClients.length} {search ? `din ${clients.length} clienți` : 'clienți înregistrați'}
            </p>
          </div>
          <button onClick={openNew} className="btn btn-primary">
            + Client nou
          </button>
        </div>

        {/* Search */}
        {!loading && clients.length > 0 && (
          <div className="card p-5 mb-6">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-[color:var(--color-muted-foreground)] mb-1">
                  Caută client
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="input"
                  placeholder="Caută după nume sau CUI..."
                />
              </div>
              {search && (
                <button onClick={() => setSearch('')} className="btn btn-outline px-5 py-3">
                  Resetează
                </button>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="card p-8 mb-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="font-bold text-[color:var(--color-foreground)] text-lg">
                  {editClient ? 'Editează client' : 'Client nou'}
                </h3>
                {editClient && (
                  <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
                    CUI, denumirea și nr. de înregistrare sunt preluate din registrul public și nu pot fi modificate.
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowForm(false); setEditClient(null) }}
                className="text-gray-300 hover:text-gray-500 transition text-xl"
              >×</button>
            </div>

            {/* Fiscal data */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">
                  Date fiscale {editClient && '· preluate din registru'}
                </p>
                {!editClient && (
                  <button
                    onClick={() => setManualEdit(!manualEdit)}
                    className="text-xs text-blue-500 hover:text-blue-700 transition underline"
                  >
                    {manualEdit ? '← Folosește ANAF' : 'Completează manual'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* CUI field */}
                {!editClient && !manualEdit && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">CUI / CIF</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.cui}
                        onChange={e => setForm(f => ({ ...f, cui: e.target.value }))}
                        className="input flex-1"
                        placeholder="ex: 12345678"
                      />
                      <button
                        onClick={lookupCUI}
                        disabled={cuiLoading}
                        className="btn btn-primary px-4 disabled:opacity-50 whitespace-nowrap"
                      >
                        {cuiLoading ? 'Se caută...' : 'Caută CUI'}
                      </button>
                    </div>
                    <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
                      Nu găsești compania? <button onClick={() => setManualEdit(true)} className="text-blue-500 underline">Completează manual</button>
                    </p>
                  </div>
                )}

                {!editClient && manualEdit && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">CUI / CIF</label>
                    <input
                      type="text"
                      value={form.cui}
                      onChange={e => setForm(f => ({ ...f, cui: e.target.value }))}
                      className="input"
                      placeholder="ex: 12345678"
                    />
                  </div>
                )}

                {/* Company name */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">
                    Denumire companie *
                  </label>
                  <input
                    type="text"
                    value={form.company_name}
                    disabled={!!editClient}
                    readOnly={!!editClient}
                    onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                    className={`input ${editClient ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                    placeholder="SC Exemplu SRL"
                  />
                </div>

                {/* Reg com */}
                <div>
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Nr. Reg. Comerț</label>
                  <input
                    type="text"
                    value={form.reg_com}
                    disabled={!!editClient}
                    readOnly={!!editClient}
                    onChange={e => setForm(f => ({ ...f, reg_com: e.target.value }))}
                    className={`input ${editClient ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                    placeholder="J40/1234/2020"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground)]">
                    <input
                      type="checkbox"
                      checked={form.vat_registered}
                      onChange={e => setForm(f => ({ ...f, vat_registered: e.target.checked }))}
                    />
                    Client plătitor de TVA
                  </label>
                </div>
              </div>
            </div>

            <ClientAddressesFields addresses={addresses} onChange={setAddresses} />
            <ClientContactsFields contacts={contacts} onChange={setContacts} />

            {/* Editable section */}
            <div className="border-t border-gray-100 pt-6">
              <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider mb-4">
                Date de contact & bancare <span className="text-blue-500 normal-case">· editabile</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="input"
                    placeholder="contact@companie.ro"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Telefon</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className={`input ${form.phone && !phoneValid ? 'border-red-300 bg-red-50' : ''}`}
                    placeholder="0721 234 567"
                  />
                  {form.phone && !phoneValid && (
                    <p className="text-red-500 text-xs mt-1">Mobil invalid (ex: 0721234567 sau +40721234567)</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Bancă emitentă</label>
                  <select
                    value={form.bank_name}
                    onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                    className="input bg-white"
                  >
                    <option value="">Selectează banca...</option>
                    {ROMANIAN_BANKS.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Cont bancar (IBAN)</label>
                  <input
                    type="text"
                    value={form.iban}
                    onChange={e => setForm(f => ({ ...f, iban: e.target.value.toUpperCase() }))}
                    className={`input ${
                      form.iban && !ibanValid ? 'border-red-300 bg-red-50' :
                      form.iban && ibanValid ? 'border-green-300 bg-green-50' : ''
                    }`}
                    placeholder="RO49AAAA1B31007593840000"
                    maxLength={24}
                  />
                  {form.iban && !form.iban.startsWith('RO') && (
                    <p className="text-red-500 text-xs mt-1">IBAN-ul trebuie să înceapă cu RO</p>
                  )}
                  {form.iban && form.iban.startsWith('RO') && form.iban.length !== 24 && (
                    <p className="text-amber-500 text-xs mt-1">{24 - form.iban.length} caractere rămase</p>
                  )}
                  {form.iban && ibanValid && (
                    <p className="text-green-500 text-xs mt-1">✓ IBAN valid</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={saveClient}
                disabled={saving || !form.company_name}
                className="btn btn-primary px-8 py-3 disabled:opacity-50"
              >
                {saving ? 'Se salvează...' : editClient ? 'Salvează modificările' : 'Salvează client'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditClient(null) }}
                className="btn btn-outline px-6 py-3"
              >
                Anulează
              </button>
            </div>
          </div>
        )}

        {/* Client list */}
        {loading ? (
          <p className="text-[color:var(--color-muted-foreground)] text-center py-12">Se încarcă...</p>
        ) : clients.length === 0 && !showForm ? (
          <div className="card p-12 text-center">
            <p className="text-3xl mb-3">👥</p>
            <p className="font-medium text-[color:var(--color-foreground)]">Nu ai niciun client încă</p>
            <p className="text-[color:var(--color-muted-foreground)] text-sm mt-1 mb-4">
              Adaugă primul tău client cu completare automată din registrul public
            </p>
            <button onClick={openNew} className="btn btn-primary px-6 py-2">
              + Adaugă primul client
            </button>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-3xl mb-3">🔍</p>
            <p className="font-medium text-[color:var(--color-foreground)]">Niciun client găsit</p>
            <p className="text-[color:var(--color-muted-foreground)] text-sm mt-1 mb-4">Încearcă alt termen de căutare</p>
            <button onClick={() => setSearch('')} className="btn btn-outline px-6 py-2">
              Resetează căutarea
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="grid grid-cols-12 px-6 py-3 border-b border-gray-100 bg-gray-50">
              <span className="col-span-4 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">Companie</span>
              <span className="col-span-3 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">Contact</span>
              <span className="col-span-3 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">Bancă</span>
              <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider text-right">Acțiuni</span>
            </div>
            {filteredClients.map((client, i) => {
              const defaultAddress = defaultAddressFromList(client.client_addresses || [])
              const city = defaultAddress?.city || client.city
              const street = defaultAddress?.address || client.address
              const contactCount = client.client_contacts?.length || 0
              const primaryContact = client.client_contacts?.[0]
              return (
                <div
                  key={client.id}
                  className={`grid grid-cols-12 px-6 py-4 items-center ${i !== filteredClients.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <div className="col-span-4">
                    <p className="font-medium text-[color:var(--color-foreground)]">{client.company_name}</p>
                    <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">
                      CUI: {client.cui || '—'}{city ? ` · ${city}` : ''}
                    </p>
                    {street && (
                      <p className="text-xs text-[color:var(--color-muted-foreground)] opacity-70 mt-0.5 truncate" title={street}>
                        {defaultAddress?.address_type ? `${addressTypeLabel(defaultAddress.address_type)} · ` : ''}{street}
                      </p>
                    )}
                  </div>
                  <div className="col-span-3">
                    <p className="text-sm text-[color:var(--color-muted-foreground)]">{client.email || '—'}</p>
                    <p className="text-xs text-[color:var(--color-muted-foreground)] opacity-70 mt-0.5">{client.phone || '—'}</p>
                    {contactCount > 0 && (
                      <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">
                        {primaryContact?.name || 'Contact'}{primaryContact?.contact_role ? ` · ${primaryContact.contact_role}` : ''}
                        {contactCount > 1 ? ` · ${contactCount} persoane` : ''}
                      </p>
                    )}
                  </div>
                  <div className="col-span-3">
                    <p className="text-sm text-[color:var(--color-muted-foreground)]">{client.bank_name || '—'}</p>
                    <p className="text-xs text-[color:var(--color-muted-foreground)] opacity-70 mt-0.5 font-mono">
                      {client.iban ? `${client.iban.substring(0, 8)}...` : '—'}
                    </p>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEdit(client)}
                      className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
                    >
                      Editează
                    </button>
                    <button
                      onClick={() => deleteClient(client.id)}
                      className="text-xs border border-red-100 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
                    >
                      Șterge
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
