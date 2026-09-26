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
import ClientAddressesFields from '@/components/ClientAddressesFields'
import ClientBankAccountsFields from '@/components/ClientBankAccountsFields'
import { countyCodeFromName } from '@/lib/romania'
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
  addressesFromClient,
  applyCuiToFirstAddress,
  defaultAddressFields,
  firstClientAddress,
  isAddressComplete,
  type ClientAddressDraft,
  type ClientAddressRow,
  type ClientContactDraft,
  type ClientContactRow
} from '@/lib/clientDirectory'
import { legalFormKey } from '@/lib/uiLabels'
import {
  banksFromClient,
  defaultBankFields,
  firstClientBankAccount,
  isBankAccountComplete,
  isBankAccountValid,
  type ClientBankAccountDraft,
  type ClientBankAccountRow
} from '@/lib/clientBanks'
import {
  companyAddressInsertRows,
  companyBankInsertRows,
  companyContactInsertRows,
  contactsFromCompany,
  firstContactFields,
  isMissingCompanyDirectoryError
} from '@/lib/companyDirectory'
import { formatRegCom } from '@/lib/regCom'

type CompanyRelations = {
  company_contacts?: ClientContactRow[] | null
  company_addresses?: ClientAddressRow[] | null
  company_bank_accounts?: ClientBankAccountRow[] | null
}

export default function Profile() {
  const router = useRouter()
  const { t } = useLocale()
  const { company, userId, ownerUserId, refreshCompanies, createCompany } = useCompany()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [cuiLoading, setCuiLoading] = useState(false)
  const [manualEdit, setManualEdit] = useState(false)
  const [form, setForm] = useState({
    company_name: '',
    cui: '',
    reg_com: '',
    vat_registered: true,
    vat_on_collection: false,
    legal_form: DEFAULT_LEGAL_FORM as LegalFormCode,
    email: '',
    phone: '',
    invoice_series: 'FCT',
    invoice_start_number: 1
  })
  const [contacts, setContacts] = useState<ClientContactDraft[]>([])
  const [addresses, setAddresses] = useState<ClientAddressDraft[]>([firstClientAddress()])
  const [banks, setBanks] = useState<ClientBankAccountDraft[]>([firstClientBankAccount()])

  const phoneValid = !form.phone || isValidRomanianMobile(form.phone)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
    }
    init()
  }, [router])

  useEffect(() => {
    const applySource = async (source: {
      company_name?: string | null
      cui?: string | null
      reg_com?: string | null
      address?: string | null
      city?: string | null
      county?: string | null
      county_code?: string | null
      postal_code?: string | null
      country?: string | null
      vat_registered?: boolean | null
      vat_on_collection?: boolean | null
      legal_form?: string | null
      bank_name?: string | null
      iban?: string | null
      bic?: string | null
      iban_currency?: string | null
      contact_person?: string | null
      contact_role?: string | null
      email?: string | null
      phone?: string | null
      invoice_series?: string | null
      invoice_start_number?: number | null
    } & CompanyRelations) => {
      setForm({
        company_name: source.company_name || '',
        cui: source.cui || '',
        reg_com: formatRegCom(source.reg_com, { county: source.county, countyCode: source.county_code }),
        vat_registered: source.vat_registered !== false,
        vat_on_collection: source.vat_on_collection === true,
        legal_form: isLegalFormCode(source.legal_form) ? source.legal_form : inferLegalForm(source.company_name),
        email: source.email || '',
        phone: source.phone || '',
        invoice_series: source.invoice_series || 'FCT',
        invoice_start_number: source.invoice_start_number || 1
      })
      const loadedAddresses = addressesFromClient({
        ...source,
        county_code: source.county_code || countyCodeFromName(source.county) || '',
        client_addresses: source.company_addresses
      })
      setAddresses(loadedAddresses.length ? loadedAddresses : [firstClientAddress()])
      setBanks(banksFromClient({
        ...source,
        client_bank_accounts: source.company_bank_accounts
      }))
      setContacts(contactsFromCompany(source))
    }

    const load = async () => {
      if (company) {
        let relations: CompanyRelations = {}
        const [contactsRes, addressesRes, banksRes] = await Promise.all([
          supabase.from('company_contacts').select('*').eq('company_id', company.id).order('sort_order'),
          supabase.from('company_addresses').select('*').eq('company_id', company.id).order('sort_order'),
          supabase.from('company_bank_accounts').select('*').eq('company_id', company.id).order('sort_order')
        ])
        if (!isMissingCompanyDirectoryError(contactsRes.error)) relations.company_contacts = (contactsRes.data || []) as ClientContactRow[]
        if (!isMissingCompanyDirectoryError(addressesRes.error)) relations.company_addresses = (addressesRes.data || []) as ClientAddressRow[]
        if (!isMissingCompanyDirectoryError(banksRes.error)) relations.company_bank_accounts = (banksRes.data || []) as ClientBankAccountRow[]
        await applySource({ ...company, ...relations })
        return
      }
      if (!userId) return
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()
      if (profile) await applySource(profile)
    }
    load()
  }, [company?.id, userId])

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
        alert(t('pro.cuiNotFound'))
      }
    } catch {
      alert(t('pro.connError'))
    }
    setCuiLoading(false)
  }

  const saveRelations = async (companyId: string) => {
    const owner = ownerUserId || userId
    const contactsDel = await supabase.from('company_contacts').delete().eq('company_id', companyId)
    if (contactsDel.error && !isMissingCompanyDirectoryError(contactsDel.error)) return contactsDel.error.message
    if (!contactsDel.error) {
      const contactRows = companyContactInsertRows(companyId, owner, contacts)
      if (contactRows.length) {
        const { error } = await supabase.from('company_contacts').insert(contactRows)
        if (error) return error.message
      }
    }

    const addressesDel = await supabase.from('company_addresses').delete().eq('company_id', companyId)
    if (addressesDel.error && !isMissingCompanyDirectoryError(addressesDel.error)) return addressesDel.error.message
    if (!addressesDel.error) {
      const addressRows = companyAddressInsertRows(companyId, owner, addresses.filter(isAddressComplete))
      if (addressRows.length) {
        const { error } = await supabase.from('company_addresses').insert(addressRows)
        if (error) return error.message
      }
    }

    const banksDel = await supabase.from('company_bank_accounts').delete().eq('company_id', companyId)
    if (banksDel.error && !isMissingCompanyDirectoryError(banksDel.error)) return banksDel.error.message
    if (!banksDel.error) {
      const bankRows = companyBankInsertRows(companyId, owner, banks)
      if (bankRows.length) {
        const { error } = await supabase.from('company_bank_accounts').insert(bankRows)
        if (error) return error.message
      }
    }
    return null
  }

  const saveProfile = async () => {
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
    const addressFields = defaultAddressFields(savedAddresses)
    const bankFields = defaultBankFields(completeBanks)
    const contactFields = firstContactFields(contacts)
    let payload: Record<string, unknown> = {
      company_name: form.company_name.trim(),
      cui: form.cui.trim(),
      reg_com: formatRegCom(form.reg_com),
      vat_registered: form.vat_registered,
      vat_on_collection: form.vat_on_collection,
      legal_form: form.legal_form,
      email,
      phone: form.phone.trim(),
      invoice_series: form.invoice_series || 'FCT',
      invoice_start_number: form.invoice_start_number || 1,
      ...addressFields,
      ...bankFields,
      ...contactFields
    }

    try {
      let companyId = company?.id || ''
      if (companyId) {
        let { error } = await supabase.from('companies').update(payload).eq('id', companyId)
        if (error && isMissingLegalFormColumnError(error)) {
          payload = withoutLegalFormColumn(payload as { legal_form?: string })
          const retry = await supabase.from('companies').update(payload).eq('id', companyId)
          error = retry.error
        }
        if (error) {
          alert(error.message || t('pro.saveFail'))
          return
        }
      } else {
        const created = await createCompany(payload)
        if (created) {
          companyId = created.id
        } else {
          const { data: { user } } = await supabase.auth.getUser()
          let profilePayload = { id: user?.id, ...payload }
          let { error } = await supabase.from('profiles').upsert(profilePayload)
          if (error && isMissingLegalFormColumnError(error)) {
            profilePayload = withoutLegalFormColumn(profilePayload as typeof profilePayload & { legal_form?: string })
            const retry = await supabase.from('profiles').upsert(profilePayload)
            error = retry.error
          }
          if (error) {
            alert(error.message || t('pro.saveFail'))
            return
          }
        }
      }
      if (companyId) {
        const relError = await saveRelations(companyId)
        if (relError) {
          alert(t('pro.savedButRelations', { error: relError }))
          return
        }
      }
      await refreshCompanies()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(err instanceof Error ? err.message : t('pro.saveFail'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-shell">
      <AppNav active="profile" />

      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h2 className="page-title text-[color:var(--color-foreground)]">{t('pro.title')}</h2>
          <p className="mt-1 text-[color:var(--color-muted-foreground)]">{t('pro.lead')}</p>
        </div>

        <div className="card p-6 mb-6">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">
                {t('cli.fiscal')}
              </p>
              <button
                type="button"
                onClick={() => setManualEdit(!manualEdit)}
                className="text-xs text-blue-500 hover:text-blue-700 transition underline"
              >
                {manualEdit ? t('cli.useAnaf') : t('cli.manual')}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cli.cuiCif')}</label>
                {manualEdit ? (
                  <input
                    type="text"
                    value={form.cui}
                    onChange={e => setForm(f => ({ ...f, cui: e.target.value }))}
                    className="input"
                    placeholder="ex: 12345678"
                  />
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={form.cui}
                      onChange={e => setForm(f => ({ ...f, cui: e.target.value }))}
                      className="input flex-1"
                      placeholder="ex: 12345678"
                    />
                    <button
                      type="button"
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
                    {t('cli.notFoundManual')} <button type="button" onClick={() => setManualEdit(true)} className="text-blue-500 underline">{t('cli.manual')}</button>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">
                  {t('cli.companyName')} *
                </label>
                <input
                  type="text"
                  value={form.company_name}
                  onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                  className="input"
                  placeholder="SC Exemplu SRL"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cli.regCom')}</label>
                <input
                  type="text"
                  value={form.reg_com}
                  onChange={e => setForm(f => ({ ...f, reg_com: e.target.value }))}
                  className="input"
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
                {t('pro.vatPayerLong')}
              </label>
              <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground)] min-h-[2.5rem]">
                <input
                  type="checkbox"
                  checked={form.vat_on_collection}
                  onChange={e => setForm(f => ({ ...f, vat_on_collection: e.target.checked }))}
                />
                {t('pro.vatOnCollection')}
              </label>
            </div>
          </div>

          <ClientAddressesFields
            key={company?.id || 'profile'}
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
              key={`${company?.id || 'profile'}-banks`}
              accounts={banks}
              onChange={setBanks}
            />
          </div>

          <ClientContactsFields
            key={`${company?.id || 'profile'}-contacts`}
            contacts={contacts}
            onChange={setContacts}
          />
        </div>

        <div className="card p-6 mb-6">
          <h3 className="font-bold text-[color:var(--color-foreground)] mb-1">{t('pro.invoiceSettings')}</h3>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mb-5">{t('pro.invoiceSettingsLead')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('pro.series')}</label>
              <input
                type="text"
                value={form.invoice_series}
                onChange={e => setForm(f => ({ ...f, invoice_series: e.target.value.toUpperCase() }))}
                className="input"
                placeholder="FCT"
                maxLength={5}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('pro.startNumber')}</label>
              <input
                type="number"
                value={form.invoice_start_number}
                onChange={e => setForm(f => ({ ...f, invoice_start_number: parseInt(e.target.value) || 1 }))}
                className="input"
                min={1}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 pb-8">
          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="btn btn-primary disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('pro.save')}
          </button>
          {saved && (
            <span className="text-sm text-green-600 font-medium">{t('pro.saved')}</span>
          )}
        </div>
      </div>
    </div>
  )
}
