'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { isValidRomanianMobile } from '@/lib/romanianMobile'
import RoAddressFields from '@/components/RoAddressFields'
import { countyCodeFromName, countyNameFromCode } from '@/lib/romania'
import AppNav from '@/components/AppNav'
import { useLocale } from '@/components/LocaleProvider'
import { useCompany } from '@/components/CompanyProvider'
import BankDetailsFields from '@/components/BankDetailsFields'
import { normalizeIban } from '@/lib/iban'
import { normalizeBic, normalizeIbanCurrency, validateClientBankDetails, type IbanCurrency } from '@/lib/roBanks'

export default function Profile() {
  const router = useRouter()
  const { t } = useLocale()
  const { company, userId, refreshCompanies, createCompany } = useCompany()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [cuiLoading, setCuiLoading] = useState(false)
  const [form, setForm] = useState({
    company_name: '',
    cui: '',
    reg_com: '',
    address: '',
    city: '',
    county: '',
    county_code: '',
    postal_code: '',
    country: 'RO',
    vat_registered: true,
    vat_on_collection: false,
    bank_name: '',
    iban: '',
    bic: '',
    iban_currency: 'LEI' as IbanCurrency,
    contact_person: '',
    contact_role: '',
    email: '',
    phone: '',
    invoice_series: 'FCT',
    invoice_start_number: 1
  })

  const phoneValid = !form.phone || isValidRomanianMobile(form.phone)
  const bankDetails = validateClientBankDetails(form)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
    }
    init()
  }, [])

  useEffect(() => {
    if (company) {
      setForm({
        company_name: company.company_name || '',
        cui: company.cui || '',
        reg_com: company.reg_com || '',
        address: company.address || '',
        city: company.city || '',
        county: company.county || '',
        county_code: company.county_code || countyCodeFromName(company.county) || '',
        postal_code: company.postal_code || '',
        country: company.country || 'RO',
        vat_registered: company.vat_registered !== false,
        vat_on_collection: company.vat_on_collection === true,
        bank_name: company.bank_name || '',
        iban: company.iban || '',
        bic: company.bic || '',
        iban_currency: normalizeIbanCurrency(company.iban_currency),
        contact_person: company.contact_person || '',
        contact_role: company.contact_role || '',
        email: company.email || '',
        phone: company.phone || '',
        invoice_series: company.invoice_series || 'FCT',
        invoice_start_number: company.invoice_start_number || 1
      })
      return
    }
    const loadLegacy = async () => {
      if (!userId) return
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()
      if (!profile) return
      setForm({
        company_name: profile.company_name || '',
        cui: profile.cui || '',
        reg_com: profile.reg_com || '',
        address: profile.address || '',
        city: profile.city || '',
        county: profile.county || '',
        county_code: profile.county_code || countyCodeFromName(profile.county) || '',
        postal_code: profile.postal_code || '',
        country: profile.country || 'RO',
        vat_registered: profile.vat_registered !== false,
        vat_on_collection: profile.vat_on_collection === true,
        bank_name: profile.bank_name || '',
        iban: profile.iban || '',
        bic: profile.bic || '',
        iban_currency: normalizeIbanCurrency(profile.iban_currency),
        contact_person: profile.contact_person || '',
        contact_role: profile.contact_role || '',
        email: profile.email || '',
        phone: profile.phone || '',
        invoice_series: profile.invoice_series || 'FCT',
        invoice_start_number: profile.invoice_start_number || 1
      })
    }
    loadLegacy()
  }, [company?.id, userId])

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
          address: data.address || f.address,
          city: data.city || f.city,
          county: data.county || f.county,
          county_code: data.county_code || f.county_code,
          postal_code: data.postal_code || f.postal_code,
          vat_registered: data.vat_registered ?? f.vat_registered
        }))
      } else {
        alert(t('pro.cuiNotFound'))
      }
    } catch (e) {
      alert(t('pro.connError'))
    }
    setCuiLoading(false)
  }

  const saveProfile = async () => {
    if (form.phone && !isValidRomanianMobile(form.phone)) {
      alert(t('common.mobileFormat'))
      return
    }
    if (!bankDetails.ok) {
      alert(bankDetails.error || t('bnk.invalid'))
      return
    }
    setSaving(true)
    const payload = {
      ...form,
      iban: normalizeIban(form.iban),
      bic: normalizeBic(form.bic),
      iban_currency: normalizeIbanCurrency(form.iban_currency),
      county: countyNameFromCode(form.county_code) || form.county
    }
    if (company?.id) {
      const { error } = await supabase.from('companies').update(payload).eq('id', company.id)
      if (error) alert(error.message || t('pro.saveFail'))
    } else {
      const created = await createCompany(payload)
      if (!created) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('profiles').upsert({ id: user?.id, ...payload })
      }
    }
    await refreshCompanies()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="app-shell">
      <AppNav active="profile" />

      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl text-[color:var(--color-foreground)]">{t('pro.title')}</h2>
          <p className="mt-1 text-[color:var(--color-muted-foreground)]">
            {t('pro.lead')}
          </p>
        </div>

        <div className="space-y-6">

          {/* Company details */}
          <div className="card p-8">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-6">{t('pro.fiscal')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('cli.cuiCif')}</label>
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
                    className="btn btn-primary disabled:opacity-50 whitespace-nowrap"
                  >
                    {cuiLoading ? t('common.searching') : t('cli.lookupCui')}
                  </button>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('pro.companyName')}</label>
                <input
                  type="text"
                  value={form.company_name}
                  onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                  className="input"
                  placeholder="SC Compania Mea SRL"
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
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('pro.address')}</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="input"
                  placeholder="Str. Exemplu, nr. 1"
                />
              </div>
              <RoAddressFields
                value={{
                  county_code: form.county_code,
                  postal_code: form.postal_code,
                  city: form.city,
                  country: form.country
                }}
                onChange={address => setForm(f => ({ ...f, ...address }))}
              />
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground)]">
                  <input
                    type="checkbox"
                    checked={form.vat_registered}
                    onChange={e => setForm(f => ({ ...f, vat_registered: e.target.checked }))}
                  />
                  {t('pro.vatPayerLong')}
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground)]">
                  <input
                    type="checkbox"
                    checked={form.vat_on_collection}
                    onChange={e => setForm(f => ({ ...f, vat_on_collection: e.target.checked }))}
                  />
                  {t('pro.vatOnCollection')}
                </label>
              </div>
            </div>
          </div>

          {/* Bank details */}
          <div className="card p-8">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-6">{t('bnk.title')}</h3>
            <BankDetailsFields
              value={{
                bank_name: form.bank_name,
                iban: form.iban,
                bic: form.bic,
                iban_currency: normalizeIbanCurrency(form.iban_currency)
              }}
              onChange={next => setForm(f => ({ ...f, ...next }))}
            />
          </div>

          {/* Contact */}
          <div className="card p-8">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-6">{t('pro.contact')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('pro.contactPerson')}</label>
                <input
                  type="text"
                  value={form.contact_person}
                  onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
                  className="input"
                  placeholder="Ion Popescu"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('common.role')}</label>
                <input
                  type="text"
                  value={form.contact_role}
                  onChange={e => setForm(f => ({ ...f, contact_role: e.target.value }))}
                  className="input"
                  placeholder="Director General"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('common.email')}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="input"
                  placeholder="contact@companie.ro"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('common.phone')}</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className={`input ${form.phone && !phoneValid ? 'border-red-300 bg-red-50' : ''}`}
                  placeholder="0721 234 567"
                />
                {form.phone && !phoneValid && (
                  <p className="text-red-500 text-xs mt-1">{t('common.invalidMobile')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Invoice settings */}
          <div className="card p-8">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-1">{t('pro.invoiceSettings')}</h3>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mb-5">{t('pro.invoiceSettingsLead')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

          {/* Save */}
          <div className="flex items-center gap-4 pb-8">
            <button
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
    </div>
  )
}