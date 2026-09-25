'use client'
import { authHeaders } from '@/lib/authHeaders'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { isValidRomanianMobile } from '@/lib/romanianMobile'
import { emailIssueKey, validateEmail } from '@/lib/email'
import EmailField from '@/components/EmailField'
import AppNav from '@/components/AppNav'
import { useLocale } from '@/components/LocaleProvider'
import { useCompany } from '@/components/CompanyProvider'
import ClientContactsFields from '@/components/ClientContactsFields'
import AnafStatusBadges from '@/components/AnafStatusBadges'
import {
  anafRisk,
  anafStatusFromLookup,
  anafStatusFromRow,
  anafStatusToColumns,
  isMissingAnafColumnError,
  withoutAnafColumns,
  type AnafStatus,
  type AnafStatusRow
} from '@/lib/anafStatus'
import ClientAddressesFields from '@/components/ClientAddressesFields'
import ClientBankAccountsFields from '@/components/ClientBankAccountsFields'
import { countyCodeFromName } from '@/lib/romania'
import { normalizeIban } from '@/lib/iban'
import {
  isMissingBicColumnError,
  isMissingIbanCurrencyColumnError,
  normalizeBic,
  normalizeIbanCurrency,
  withoutBicColumn,
  withoutIbanCurrencyColumn,
  type IbanCurrency
} from '@/lib/roBanks'
import { tenantWrite } from '@/lib/portfolio'
import { formatRegCom } from '@/lib/regCom'
import {
  DEFAULT_LEGAL_FORM,
  inferLegalForm,
  isLegalFormCode,
  isMissingLegalFormColumnError,
  LEGAL_FORMS,
  type LegalFormCode,
  withoutLegalFormColumn
} from '@/lib/legalForms'
import {
  addressInsertRows,
  addressesFromClient,
  applyCuiToFirstAddress,
  contactInsertRows,
  contactsFromRows,
  defaultAddressFields,
  defaultAddressFromList,
  firstClientAddress,
  isAddressComplete,
  type ClientAddressDraft,
  type ClientAddressRow,
  type ClientContactDraft,
  type ClientContactRow
} from '@/lib/clientDirectory'
import { addressTypeKey, displayRole, legalFormKey } from '@/lib/uiLabels'
import {
  bankAccountInsertRows,
  banksFromClient,
  defaultBankFields,
  firstClientBankAccount,
  isBankAccountComplete,
  isBankAccountValid,
  isMissingBankAccountsError,
  type ClientBankAccountDraft,
  type ClientBankAccountRow
} from '@/lib/clientBanks'

interface Client extends AnafStatusRow {
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
  is_public_institution?: boolean
  legal_form?: string
  email: string
  phone: string
  bank_name: string
  iban: string
  bic?: string
  iban_currency?: string
  client_contacts?: ClientContactRow[]
  client_addresses?: ClientAddressRow[]
  client_bank_accounts?: ClientBankAccountRow[]
}

const emptyForm = {
  company_name: '',
  cui: '',
  reg_com: '',
  vat_registered: true,
  is_public_institution: false,
  legal_form: DEFAULT_LEGAL_FORM as LegalFormCode,
  email: '',
  phone: '',
  bank_name: '',
  iban: '',
  bic: '',
  iban_currency: 'LEI' as IbanCurrency
}

export default function Clients() {
  const router = useRouter()
  const { t } = useLocale()
  const { userId, company, ownerUserId, loading: companyLoading } = useCompany()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [cuiLoading, setCuiLoading] = useState(false)
  // ANAF status from the last CUI lookup (or the stored one when editing); persisted on save.
  const [anafStatus, setAnafStatus] = useState<AnafStatus | null>(null)
  const [anafNote, setAnafNote] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [contacts, setContacts] = useState<ClientContactDraft[]>([])
  const [addresses, setAddresses] = useState<ClientAddressDraft[]>([firstClientAddress()])
  const [banks, setBanks] = useState<ClientBankAccountDraft[]>([firstClientBankAccount()])
  const [search, setSearch] = useState('')
  const [manualEdit, setManualEdit] = useState(false)

  const phoneValid = !form.phone || isValidRomanianMobile(form.phone)

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
      .select('*, client_contacts(*), client_addresses(*), client_bank_accounts(*)')
      .order('created_at', { ascending: false })
    query = company?.id ? query.eq('company_id', company.id) : query.eq('user_id', ownerUserId || userId)
    const { data, error } = await query
    if (error) {
      let fallback = supabase.from('clients').select('*').order('created_at', { ascending: false })
      fallback = company?.id ? fallback.eq('company_id', company.id) : fallback.eq('user_id', ownerUserId || userId)
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
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ cui: form.cui })
      })
      const data = await res.json()
      if (data.success) {
        setAnafStatus(anafStatusFromLookup(data.anaf))
        setAnafNote(data.source === 'openapi' ? t('cli.anafUnavailable') : '')
        setForm(f => ({
          ...f,
          company_name: data.company_name || f.company_name,
          reg_com: formatRegCom(data.reg_com, { county: data.county, countyCode: data.county_code }) || f.reg_com,
          vat_registered: data.vat_registered ?? f.vat_registered,
          legal_form: inferLegalForm(data.company_name)
        }))
        setAddresses(current => applyCuiToFirstAddress(current, {
          address: data.address,
          city: data.city,
          county: data.county,
          county_code: data.county_code,
          postal_code: data.postal_code,
          country: data.country || 'RO'
        }))
      } else {
        setAnafStatus(null)
        setAnafNote('')
        alert(t('cli.cuiNotFound'))
      }
    } catch (e) {
      alert(t('cli.connError'))
    }
    setCuiLoading(false)
  }

  // Edit mode: refresh only the ANAF status (and the VAT flag), never overwrite the edited fields.
  const recheckAnaf = async () => {
    if (!form.cui) return
    setCuiLoading(true)
    try {
      const res = await fetch('/api/cui', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ cui: form.cui })
      })
      const data = await res.json()
      if (!data.success) { alert(data.message || t('cli.cuiNotFound')); return }
      setAnafStatus(anafStatusFromLookup(data.anaf))
      setAnafNote(data.source === 'openapi' ? t('cli.anafUnavailable') : '')
      if (typeof data.vat_registered === 'boolean') setForm(f => ({ ...f, vat_registered: data.vat_registered }))
    } catch {
      alert(t('cli.connError'))
    } finally {
      setCuiLoading(false)
    }
  }

  const anafPanel = (anafStatus || anafNote) ? (
    <div className="mt-2 flex flex-col gap-1.5">
      {anafStatus && (
        <div className="flex flex-wrap gap-2">
          <AnafStatusBadges status={anafStatus} vatRegistered={form.vat_registered} publicInstitution={form.is_public_institution} />
        </div>
      )}
      {anafRisk(anafStatus) && <p className="text-xs font-medium text-red-800">{t('cli.anafRiskWarn')}</p>}
      {anafNote && <p className="text-xs text-amber-800">{anafNote}</p>}
    </div>
  ) : null

  const openNew = () => {
    setEditClient(null)
    setForm(emptyForm)
    setAnafStatus(null)
    setAnafNote('')
    setContacts([])
    setAddresses([firstClientAddress()])
    setBanks([firstClientBankAccount()])
    setManualEdit(false)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openEdit = (client: Client) => {
    setEditClient(client)
    setForm({
      company_name: client.company_name,
      cui: client.cui || '',
      reg_com: formatRegCom(client.reg_com, { county: client.county, countyCode: client.county_code }),
      vat_registered: client.vat_registered !== false,
      is_public_institution: client.is_public_institution === true,
      legal_form: isLegalFormCode(client.legal_form) ? client.legal_form : inferLegalForm(client.company_name),
      email: client.email || '',
      phone: client.phone || '',
      bank_name: client.bank_name || '',
      iban: normalizeIban(client.iban),
      bic: normalizeBic(client.bic),
      iban_currency: normalizeIbanCurrency(client.iban_currency)
    })
    setAnafStatus(anafStatusFromRow(client))
    setAnafNote('')
    setContacts(contactsFromRows(client.client_contacts))
    const loaded = addressesFromClient({
      ...client,
      county_code: client.county_code || countyCodeFromName(client.county) || ''
    })
    setAddresses(loaded.length ? loaded : [firstClientAddress()])
    setBanks(banksFromClient(client))
    setManualEdit(false)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveRelations = async (clientId: string) => {
    const companyId = company?.id || editClient?.company_id
    await supabase.from('client_contacts').delete().eq('client_id', clientId)
    const contactRows = contactInsertRows(clientId, ownerUserId || userId, companyId, contacts)
    if (contactRows.length) {
      const { error } = await supabase.from('client_contacts').insert(contactRows)
      if (error) return error.message
    }

    await supabase.from('client_addresses').delete().eq('client_id', clientId).eq('is_default', false)
    await supabase.from('client_addresses').delete().eq('client_id', clientId)
    const addressRows = addressInsertRows(clientId, ownerUserId || userId, companyId, addresses.filter(isAddressComplete))
    if (addressRows.length) {
      const { error } = await supabase.from('client_addresses').insert(addressRows)
      if (error) return error.message
    }

    const { error: bankDeleteError } = await supabase.from('client_bank_accounts').delete().eq('client_id', clientId)
    if (bankDeleteError && !isMissingBankAccountsError(bankDeleteError)) return bankDeleteError.message
    if (!bankDeleteError) {
      const bankRows = bankAccountInsertRows(clientId, ownerUserId || userId, companyId, banks)
      if (bankRows.length) {
        const { error } = await supabase.from('client_bank_accounts').insert(bankRows)
        if (error) return error.message
      }
    }
    return null
  }

  const saveClient = async () => {
    if (!form.company_name.trim()) {
      alert(t('cli.nameRequired'))
      return
    }
    const emailCheck = validateEmail(form.email, { required: true })
    if (!emailCheck.ok) {
      alert(t(emailIssueKey(emailCheck.issue), { suggestion: emailCheck.suggestion || '' }))
      return
    }
    const email = emailCheck.normalized
    if (!form.phone.trim()) {
      alert(t('cli.phoneRequired'))
      return
    }
    if (!isValidRomanianMobile(form.phone)) {
      alert(t('common.mobileFormat'))
      return
    }
    const completeBanks = banks.filter(isBankAccountComplete)
    if (!completeBanks.length) {
      alert(t('cli.bankRequired'))
      return
    }
    for (const account of completeBanks) {
      const check = isBankAccountValid(account)
      if (!check.ok) {
        alert(check.error || t('bnk.invalid'))
        return
      }
    }
    for (const contact of contacts) {
      if (contact.phone && !isValidRomanianMobile(contact.phone)) {
        alert(t('cli.contactPhoneInvalid', { name: contact.name || t('cli.contactPerson') }))
        return
      }
    }
    const savedAddresses = addresses.filter(isAddressComplete)
    if (!savedAddresses.length) {
      alert(t('cli.addressRequired'))
      return
    }
    setSaving(true)
    try {
    const addressFields = defaultAddressFields(savedAddresses)
    const bankFields = defaultBankFields(completeBanks)
    const payload = {
      ...form,
      reg_com: formatRegCom(form.reg_com),
      email,
      ...addressFields,
      ...bankFields
    }
    if (editClient) {
      const updateRow = {
        email,
        phone: form.phone,
        bank_name: bankFields.bank_name,
        iban: bankFields.iban,
        bic: bankFields.bic,
        iban_currency: bankFields.iban_currency,
        address: payload.address,
        county_code: payload.county_code,
        postal_code: payload.postal_code,
        country: payload.country,
        city: payload.city,
        county: payload.county,
        vat_registered: form.vat_registered,
        is_public_institution: form.is_public_institution,
        legal_form: form.legal_form,
        ...anafStatusToColumns(anafStatus)
      }
      let pendingUpdate = updateRow
      let { error } = await supabase
        .from('clients')
        .update(pendingUpdate)
        .eq('id', editClient.id)
      if (error && isMissingBicColumnError(error)) {
        pendingUpdate = withoutBicColumn(pendingUpdate)
        const retry = await supabase.from('clients').update(pendingUpdate).eq('id', editClient.id)
        error = retry.error
      }
      if (error && isMissingIbanCurrencyColumnError(error)) {
        pendingUpdate = withoutIbanCurrencyColumn(pendingUpdate)
        const retry = await supabase.from('clients').update(pendingUpdate).eq('id', editClient.id)
        error = retry.error
      }
      if (error && isMissingLegalFormColumnError(error)) {
        pendingUpdate = withoutLegalFormColumn(pendingUpdate)
        const retry = await supabase.from('clients').update(pendingUpdate).eq('id', editClient.id)
        error = retry.error
      }
      if (error && isMissingAnafColumnError(error)) {
        pendingUpdate = withoutAnafColumns(pendingUpdate)
        const retry = await supabase.from('clients').update(pendingUpdate).eq('id', editClient.id)
        error = retry.error
      }
      if (error) {
        alert(error.message)
        return
      }
      const relError = await saveRelations(editClient.id)
      if (relError) {
        alert(t('cli.savedButRelations', { error: relError }))
        return
      }
      setShowForm(false)
      setEditClient(null)
      loadClients()
    } else {
      let pendingInsert = { ...payload, ...anafStatusToColumns(anafStatus), ...tenantWrite({ ownerUserId: ownerUserId || userId, actorUserId: userId, companyId: company?.id }) }
      let { data, error } = await supabase
        .from('clients')
        .insert(pendingInsert)
        .select('*')
        .single()
      if (error && isMissingBicColumnError(error)) {
        pendingInsert = withoutBicColumn(pendingInsert)
        const retry = await supabase.from('clients').insert(pendingInsert).select('*').single()
        data = retry.data
        error = retry.error
      }
      if (error && isMissingIbanCurrencyColumnError(error)) {
        pendingInsert = withoutIbanCurrencyColumn(pendingInsert)
        const retry = await supabase.from('clients').insert(pendingInsert).select('*').single()
        data = retry.data
        error = retry.error
      }
      if (error && isMissingLegalFormColumnError(error)) {
        pendingInsert = withoutLegalFormColumn(pendingInsert)
        const retry = await supabase.from('clients').insert(pendingInsert).select('*').single()
        data = retry.data
        error = retry.error
      }
      if (error && isMissingAnafColumnError(error)) {
        pendingInsert = withoutAnafColumns(pendingInsert)
        const retry = await supabase.from('clients').insert(pendingInsert).select('*').single()
        data = retry.data
        error = retry.error
      }
      if (error || !data) {
        alert(error?.message || t('cli.saveFail'))
        return
      }
      const relError = await saveRelations(data.id)
      if (relError) {
        alert(t('cli.savedButRelations', { error: relError }))
        setEditClient(data)
        return
      }
      setShowForm(false)
      setForm(emptyForm)
      loadClients()
    }
    } catch (err) {
      alert(err instanceof Error ? err.message : t('cli.saveFail'))
    } finally {
      setSaving(false)
    }
  }

  const deleteClient = async (id: string) => {
    if (!confirm(t('cli.confirmDelete'))) return
    await supabase.from('clients').delete().eq('id', id)
    loadClients()
  }

  return (
    <div className="app-shell">
      <AppNav active="clients" />

      <div className="max-w-5xl mx-auto px-8 py-8">

        {/* Header */}
        <div className="page-toolbar">
          <div>
            <h2 className="text-3xl text-[color:var(--color-foreground)]">{t('cli.title')}</h2>
            <p className="mt-1 text-[color:var(--color-muted-foreground)]">
              {search
                ? t('cli.countFiltered', { count: filteredClients.length, total: clients.length })
                : t('cli.count', { count: filteredClients.length })}
            </p>
          </div>
          <button onClick={openNew} className="btn btn-primary">
            {t('cli.new')}
          </button>
        </div>

        {/* Search */}
        {!loading && clients.length > 0 && !showForm && (
          <div className="card p-4 mb-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-[color:var(--color-muted-foreground)] mb-1">
                  {t('cli.search')}
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="input"
                  placeholder={t('cli.searchPlaceholder')}
                />
              </div>
              {search && (
                <button onClick={() => setSearch('')} className="btn btn-outline">
                  {t('inv.resetFilters')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="card p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-[color:var(--color-foreground)] text-lg">
                  {editClient ? t('cli.editTitle') : t('cli.newTitle')}
                </h3>
                {editClient && (
                  <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
                    {t('cli.lockedHint')}
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowForm(false); setEditClient(null) }}
                className="text-gray-300 hover:text-gray-500 transition text-xl"
              >×</button>
            </div>

            {/* Fiscal data */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">
                  {editClient ? t('cli.fiscalFromRegistry') : t('cli.fiscal')}
                </p>
                {!editClient && (
                  <button
                    onClick={() => setManualEdit(!manualEdit)}
                    className="text-xs text-blue-500 hover:text-blue-700 transition underline"
                  >
                    {manualEdit ? t('cli.useAnaf') : t('cli.manual')}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {editClient ? (
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cli.cuiCif')}</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input type="text" className="input flex-1 bg-gray-50 text-gray-400 cursor-not-allowed" value={form.cui} readOnly />
                      {form.cui && (
                        <button onClick={recheckAnaf} disabled={cuiLoading} className="btn btn-outline disabled:opacity-50 whitespace-nowrap">
                          {cuiLoading ? t('common.searching') : t('cli.anafRecheck')}
                        </button>
                      )}
                    </div>
                    {anafPanel}
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cli.cuiCif')}</label>
                    {manualEdit ? (
                      <input
                        type="text"
                        value={form.cui}
                        onChange={e => { setForm(f => ({ ...f, cui: e.target.value })); setAnafStatus(null); setAnafNote('') }}
                        className="input"
                        placeholder="ex: 12345678"
                      />
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={form.cui}
                          onChange={e => { setForm(f => ({ ...f, cui: e.target.value })); setAnafStatus(null); setAnafNote('') }}
                          className="input flex-1"
                          placeholder="ex: 12345678"
                        />
                        <button
                          onClick={lookupCUI}
                          disabled={cuiLoading}
                          className="btn btn-primary disabled:opacity-50 whitespace-nowrap"
                        >
                          {cuiLoading ? t('common.searching') : t('cli.lookupCui')}
                        </button>
                      </div>
                    )}
                    {!manualEdit && (
                      <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
                        {t('cli.notFoundManual')} <button onClick={() => setManualEdit(true)} className="text-blue-500 underline">{t('cli.manual')}</button>
                      </p>
                    )}
                    {anafPanel}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">
                    {t('cli.companyName')} *
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

                <div>
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cli.regCom')}</label>
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
                <div>
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cli.legalForm')}</label>
                  <select
                    value={form.legal_form}
                    onChange={e => setForm(f => ({
                      ...f,
                      legal_form: isLegalFormCode(e.target.value) ? e.target.value : DEFAULT_LEGAL_FORM
                    }))}
                    className="input bg-white"
                  >
                    <option value="">{t('cli.selectLegal')}</option>
                    {LEGAL_FORMS.map(formType => (
                      <option key={formType.code} value={formType.code}>
                        {formType.code} — {t(legalFormKey(formType.code)!) || formType.name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground)] min-h-[2.5rem]">
                  <input
                    type="checkbox"
                    checked={form.vat_registered}
                    onChange={e => setForm(f => ({ ...f, vat_registered: e.target.checked }))}
                  />
                  {t('cli.vatPayer')}
                </label>
                <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground)] min-h-[2.5rem]">
                  <input
                    type="checkbox"
                    checked={form.is_public_institution}
                    onChange={e => setForm(f => ({ ...f, is_public_institution: e.target.checked }))}
                  />
                  {t('cli.publicInst')}
                </label>
              </div>
            </div>

            <ClientAddressesFields
              key={editClient?.id || 'new'}
              addresses={addresses}
              onChange={setAddresses}
            />

            <div className="border-t border-gray-100 pt-4 mb-4">
              <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider mb-3">
                {t('cli.contactData')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <EmailField
                  value={form.email}
                  onChange={email => setForm(f => ({ ...f, email }))}
                />
                <div>
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('common.phone')} *</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className={`input ${form.phone && !phoneValid ? 'border-red-300 bg-red-50' : ''}`}
                    placeholder="ex: 0721 234 567"
                    required
                  />
                  {form.phone && !phoneValid && (
                    <p className="text-red-500 text-xs mt-1">{t('common.invalidMobile')}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <ClientBankAccountsFields
                key={`${editClient?.id || 'new'}-banks`}
                accounts={banks}
                onChange={setBanks}
              />
            </div>

            <ClientContactsFields
              key={`${editClient?.id || 'new'}-contacts`}
              contacts={contacts}
              onChange={setContacts}
            />

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={saveClient}
                disabled={saving}
                className="btn btn-primary disabled:opacity-50"
              >
                {saving ? t('common.saving') : editClient ? t('cli.saveChanges') : t('cli.saveClient')}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditClient(null) }}
                className="btn btn-outline"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Client list */}
        {!showForm && (loading ? (
          <p className="text-[color:var(--color-muted-foreground)] text-center py-12">{t('common.loading')}</p>
        ) : clients.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-3xl mb-3">👥</p>
            <p className="font-medium text-[color:var(--color-foreground)]">{t('cli.empty')}</p>
            <p className="text-[color:var(--color-muted-foreground)] text-sm mt-1 mb-4">
              {t('cli.emptyLead')}
            </p>
            <button onClick={openNew} className="btn btn-primary">
              {t('cli.addFirst')}
            </button>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-3xl mb-3">🔍</p>
            <p className="font-medium text-[color:var(--color-foreground)]">{t('cli.noneFound')}</p>
            <p className="text-[color:var(--color-muted-foreground)] text-sm mt-1 mb-4">{t('cli.tryOther')}</p>
            <button onClick={() => setSearch('')} className="btn btn-outline">{t('cli.resetSearch')}</button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="list-head grid grid-cols-12 px-6 py-3 border-b border-gray-100 bg-gray-50">
              <span className="col-span-4 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('common.company')}</span>
              <span className="col-span-3 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('cli.contact')}</span>
              <span className="col-span-3 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('cli.bank')}</span>
              <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider text-right">{t('common.actions')}</span>
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
                  className={`list-row list-row-clients grid grid-cols-12 px-6 py-4 items-center ${i !== filteredClients.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <div className="list-cell-title col-span-4">
                    <p className="font-medium text-[color:var(--color-foreground)]">{client.company_name}</p>
                    {anafRisk(anafStatusFromRow(client)) && (
                      <div className="mt-1"><AnafStatusBadges status={anafStatusFromRow(client)} compact /></div>
                    )}
                    <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">
                      {t('cli.cui')}: {client.cui || '—'}{city ? ` · ${city}` : ''}
                    </p>
                    {street && (
                      <p className="text-xs text-[color:var(--color-muted-foreground)] opacity-70 mt-0.5 truncate" title={street}>
                        {defaultAddress?.address_type ? `${t(addressTypeKey(defaultAddress.address_type))} · ` : ''}{street}
                      </p>
                    )}
                  </div>
                  <div className="list-cell-sub col-span-3">
                    <p className="text-sm text-[color:var(--color-muted-foreground)]">{client.email || '—'}</p>
                    <p className="text-xs text-[color:var(--color-muted-foreground)] opacity-70 mt-0.5">{client.phone || '—'}</p>
                    {contactCount > 0 && (
                      <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">
                        {primaryContact?.name || t('cli.contact')}{primaryContact?.contact_role ? ` · ${displayRole(t, primaryContact.contact_role)}` : ''}
                        {contactCount > 1 ? ` · ${t('cli.peopleCount', { count: contactCount })}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="list-cell-meta col-span-3">
                    {(() => {
                      const accounts = banksFromClient(client).filter(isBankAccountComplete)
                      const defaults = accounts.filter(a => a.is_default)
                      const shown = defaults.length ? defaults : accounts.slice(0, 1)
                      if (!shown.length) {
                        return <p className="text-sm text-[color:var(--color-muted-foreground)]">—</p>
                      }
                      return shown.map(account => (
                        <div key={account.key} className="mb-1 last:mb-0">
                          <p className="text-sm text-[color:var(--color-muted-foreground)]">
                            {account.bank_name || '—'} · {account.iban_currency}
                          </p>
                          <p className="text-xs text-[color:var(--color-muted-foreground)] opacity-70 font-mono">
                            {account.iban ? `${account.iban.substring(0, 8)}...` : '—'}
                            {account.bic ? ` · ${account.bic}` : ''}
                          </p>
                        </div>
                      ))
                    })()}
                  </div>
                  <div className="list-cell-actions col-span-2 flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEdit(client)}
                      className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => deleteClient(client.id)}
                      className="text-xs border border-red-100 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
