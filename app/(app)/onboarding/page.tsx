'use client'
import { authHeaders } from '@/lib/authHeaders'
import { useState, useEffect } from 'react'
import { getCurrentUser, supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import RoAddressFields from '@/components/RoAddressFields'
import { countyNameFromCode } from '@/lib/romania'
import { useCompany } from '@/components/CompanyProvider'
import BrandLockup from '@/components/BrandLockup'
import { useLocale } from '@/components/LocaleProvider'
import { emailIssueKey, validateEmail } from '@/lib/email'
import EmailField from '@/components/EmailField'
import { formatRegCom } from '@/lib/regCom'

export default function Onboarding() {
  const router = useRouter()
  const { t } = useLocale()
  const { company, createCompany, refreshCompanies, setActiveCompanyId } = useCompany()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [cuiLoading, setCuiLoading] = useState(false)
  const [clientCuiLoading, setClientCuiLoading] = useState(false)
  const [userId, setUserId] = useState<string>('')

  const [profile, setProfile] = useState({
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
    bank_name: '',
    iban: '',
    email: '',
    phone: '',
    invoice_series: 'FCT',
    invoice_start_number: 1
  })

  const [client, setClient] = useState({
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
    email: '',
    phone: '',
    bank_name: '',
    iban: ''
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await getCurrentUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      // Check if already onboarded
      const { data: existingCompanies } = await supabase
        .from('companies')
        .select('id, company_name')
        .eq('user_id', user.id)
        .limit(1)

      const { data: existingClients } = await supabase
        .from('clients')
        .select('id')
        .eq(existingCompanies?.[0]?.id ? 'company_id' : 'user_id', existingCompanies?.[0]?.id || user.id)
        .limit(1)

      const { data: existingInvoices } = await supabase
        .from('invoices')
        .select('id')
        .eq(existingCompanies?.[0]?.id ? 'company_id' : 'user_id', existingCompanies?.[0]?.id || user.id)
        .limit(1)

      const hasCompany = !!(existingCompanies?.[0]?.company_name || company?.company_name)
      if (hasCompany && existingClients?.length && existingInvoices?.length) {
        router.push('/dashboard')
        return
      }
      if (hasCompany && existingClients?.length) {
        setStep(3)
        return
      }
      if (hasCompany) {
        setStep(2)
        return
      }
    }
    init()
  }, [])

  const lookupCUI = async (cui: string, type: 'profile' | 'client') => {
    if (!cui || cui.length < 2) return
    type === 'profile' ? setCuiLoading(true) : setClientCuiLoading(true)
    try {
      const res = await fetch('/api/cui', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ cui })
      })
      const data = await res.json()
      if (data.success) {
        if (type === 'profile') {
          setProfile(f => ({
            ...f,
            company_name: data.company_name || f.company_name,
            reg_com: formatRegCom(data.reg_com, { county: data.county, countyCode: data.county_code }) || f.reg_com,
            address: data.address || f.address,
            city: data.city || f.city,
            county: data.county || f.county,
            county_code: data.county_code || f.county_code,
            postal_code: data.postal_code || f.postal_code,
            vat_registered: data.vat_registered ?? f.vat_registered
          }))
        } else {
          setClient(f => ({
            ...f,
            company_name: data.company_name || f.company_name,
            reg_com: formatRegCom(data.reg_com, { county: data.county, countyCode: data.county_code }) || f.reg_com,
            address: data.address || f.address,
            city: data.city || f.city,
            county: data.county || f.county,
            county_code: data.county_code || f.county_code,
            postal_code: data.postal_code || f.postal_code,
            vat_registered: data.vat_registered ?? f.vat_registered
          }))
        }
      } else {
        alert(t('pro.cuiNotFound'))
      }
    } catch (e) {
      alert(t('pro.connError'))
    }
    type === 'profile' ? setCuiLoading(false) : setClientCuiLoading(false)
  }

  const persistProfileIfNeeded = async () => {
    if (!profile.company_name.trim()) return
    const emailCheck = validateEmail(profile.email)
    const payload = {
      ...profile,
      reg_com: formatRegCom(profile.reg_com, { county: profile.county, countyCode: profile.county_code }),
      email: emailCheck.normalized,
      county: countyNameFromCode(profile.county_code) || profile.county
    }
    if (company?.id) {
      await supabase.from('companies').update(payload).eq('id', company.id)
    } else {
      const created = await createCompany(payload)
      if (created) setActiveCompanyId(created.id)
    }
    await refreshCompanies()
  }

  const saveProfile = async () => {
    if (!profile.company_name) { alert(t('onb.companyNameRequired')); return }
    const emailCheck = validateEmail(profile.email)
    if (!emailCheck.ok) {
      alert(t(emailIssueKey(emailCheck.issue), { suggestion: emailCheck.suggestion || '' }))
      return
    }
    setSaving(true)
    await persistProfileIfNeeded()
    setSaving(false)
    setStep(2)
  }

  const saveClient = async () => {
    if (!client.company_name) { alert(t('onb.clientNameRequired')); return }
    const emailCheck = validateEmail(client.email)
    if (!emailCheck.ok) {
      alert(t(emailIssueKey(emailCheck.issue), { suggestion: emailCheck.suggestion || '' }))
      return
    }
    const { data: { user } } = await getCurrentUser()
    const companyId = company?.id
    if (!companyId) { alert(t('onb.saveCompanyFirst')); return }
    setSaving(true)
    const payload = {
      ...client,
      reg_com: formatRegCom(client.reg_com, { county: client.county, countyCode: client.county_code }),
      email: emailCheck.normalized,
      county: countyNameFromCode(client.county_code) || client.county,
      user_id: user?.id || userId,
      company_id: companyId
    }
    const { data: created } = await supabase.from('clients').insert(payload).select('id, user_id').single()
    if (created?.id) {
      await supabase.from('client_addresses').insert({
        client_id: created.id,
        user_id: created.user_id || user?.id || userId,
        company_id: companyId,
        address_type: 'sediu_social',
        address: client.address || '',
        city: client.city || '',
        county: payload.county,
        county_code: client.county_code || '',
        postal_code: client.postal_code || '',
        country: client.country || 'RO',
        is_default: true,
        sort_order: 0
      })
    }
    setSaving(false)
    setStep(3)
  }

  const goToInvoice = () => {
    router.push('/invoices/new')
  }

  const skipToApp = async () => {
    setSaving(true)
    await persistProfileIfNeeded()
    router.push('/dashboard')
  }

  return (
    <div className="app-shell">
      <div className="top-nav">
        <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
          <BrandLockup href="/dashboard" />
          <button onClick={skipToApp} className="nav-link">
            {t('common.skipArrow')}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition ${
                s < step ? 'bg-green-500 text-white' :
                s === step ? 'bg-[color:var(--color-accent)] text-[color:var(--color-accent-foreground)]' :
                'bg-gray-100 text-gray-400'
              }`}>
                {s < step ? '✓' : s}
              </div>
              <div className="flex-1">
                <p className={`text-xs font-medium ${s === step ? 'text-gray-900' : 'text-gray-400'}`}>
                  {s === 1 ? t('onb.stepCompany') : s === 2 ? t('onb.stepClient') : t('onb.stepInvoice')}
                </p>
              </div>
              {s < 3 && <div className={`h-0.5 w-8 flex-shrink-0 ${s < step ? 'bg-green-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 — Company profile */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <h2 className="page-title text-gray-900 mb-1">{t('onb.companyTitle')}</h2>
            <p className="text-gray-500 mb-8">{t('onb.companyLead')}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('cli.cuiCif')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={profile.cui}
                    onChange={e => setProfile(f => ({ ...f, cui: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="ex: 12345678"
                  />
                  <button
                    onClick={() => lookupCUI(profile.cui, 'profile')}
                    disabled={cuiLoading}
                    className="btn btn-primary disabled:opacity-50 whitespace-nowrap"
                  >
                    {cuiLoading ? t('common.searching') : t('cli.lookupCui')}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('pro.companyName')}</label>
                <input
                  type="text"
                  value={profile.company_name}
                  onChange={e => setProfile(f => ({ ...f, company_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="SC Compania Mea SRL"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('cli.regCom')}</label>
                <input
                  type="text"
                  value={profile.reg_com}
                  onChange={e => setProfile(f => ({ ...f, reg_com: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="J40/1234/2020"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('pro.address')}</label>
                <input
                  type="text"
                  value={profile.address}
                  onChange={e => setProfile(f => ({ ...f, address: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Str. Exemplu, nr. 1"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RoAddressFields
                  value={{
                    county_code: profile.county_code,
                    postal_code: profile.postal_code,
                    city: profile.city,
                    country: profile.country
                  }}
                  onChange={address => setProfile(f => ({ ...f, ...address }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={profile.vat_registered}
                  onChange={e => setProfile(f => ({ ...f, vat_registered: e.target.checked }))}
                />
                {t('pro.vatPayer')}
              </label>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.bank')}</label>
                  <input
                    type="text"
                    value={profile.bank_name}
                    onChange={e => setProfile(f => ({ ...f, bank_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Banca Transilvania"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.iban')}</label>
                  <input
                    type="text"
                    value={profile.iban}
                    onChange={e => setProfile(f => ({ ...f, iban: e.target.value.toUpperCase() }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="RO49AAAA1B31007593840000"
                    maxLength={24}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <EmailField
                  required={false}
                  label={t('onb.emailCompany')}
                  value={profile.email}
                  onChange={email => setProfile(f => ({ ...f, email }))}
                  placeholder="contact@companie.ro"
                  inputClassName="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('pro.series')}</label>
                  <input
                    type="text"
                    value={profile.invoice_series}
                    onChange={e => setProfile(f => ({ ...f, invoice_series: e.target.value.toUpperCase() }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="FCT"
                    maxLength={5}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-8">
              <button onClick={skipToApp} className="text-sm text-gray-400 hover:text-gray-600 transition">
                {t('common.later')}
              </button>
              <button
                onClick={saveProfile}
                disabled={saving || !profile.company_name}
                className="btn btn-primary disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('common.continue')}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — First client */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <h2 className="page-title text-gray-900 mb-1">{t('onb.clientTitle')}</h2>
            <p className="text-gray-500 mb-8">{t('onb.clientLead')}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('onb.cuiClient')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={client.cui}
                    onChange={e => setClient(f => ({ ...f, cui: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="ex: 12345678"
                  />
                  <button
                    onClick={() => lookupCUI(client.cui, 'client')}
                    disabled={clientCuiLoading}
                    className="btn btn-primary disabled:opacity-50 whitespace-nowrap"
                  >
                    {clientCuiLoading ? t('common.searching') : t('cli.lookupCui')}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('pro.companyName')}</label>
                <input
                  type="text"
                  value={client.company_name}
                  onChange={e => setClient(f => ({ ...f, company_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="SC Client SRL"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('cli.regCom')}</label>
                <input
                  type="text"
                  value={client.reg_com}
                  onChange={e => setClient(f => ({ ...f, reg_com: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="J40/1234/2020"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('pro.address')}</label>
                <input
                  type="text"
                  value={client.address}
                  onChange={e => setClient(f => ({ ...f, address: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Str. Exemplu, nr. 1"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RoAddressFields
                  value={{
                    county_code: client.county_code,
                    postal_code: client.postal_code,
                    city: client.city,
                    country: client.country
                  }}
                  onChange={address => setClient(f => ({ ...f, ...address }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={client.vat_registered}
                  onChange={e => setClient(f => ({ ...f, vat_registered: e.target.checked }))}
                />
                {t('cli.vatPayer')}
              </label>

              <div className="grid grid-cols-2 gap-4">
                <EmailField
                  required={false}
                  label={t('onb.emailClient')}
                  value={client.email}
                  onChange={email => setClient(f => ({ ...f, email }))}
                  placeholder="contact@client.ro"
                  inputClassName="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.phone')}</label>
                  <input
                    type="text"
                    value={client.phone}
                    onChange={e => setClient(f => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="0721 234 567"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-8">
              <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-gray-600 transition">
                {t('common.backArrow')}
              </button>
              <div className="flex gap-3">
                <button onClick={skipToApp} className="text-sm text-gray-400 hover:text-gray-600 transition px-4 py-3">
                  {t('common.skip')}
                </button>
                <button
                  onClick={saveClient}
                  disabled={saving || !client.company_name}
                  className="btn btn-primary disabled:opacity-50"
                >
                  {saving ? t('common.saving') : t('common.continue')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — First invoice */}
        {step === 3 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span className="text-3xl">🎉</span>
            </div>
            <h2 className="page-title text-gray-900 mb-3">{t('onb.readyTitle')}</h2>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">
              {t('onb.readyLead')}
            </p>

            <div className="bg-gray-50 rounded-2xl p-6 mb-8 text-left">
              <p className="text-sm font-medium text-gray-700 mb-3">{t('onb.whatHappens')}</p>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-[color:var(--color-accent)] text-[color:var(--color-accent-foreground)] rounded-full flex items-center justify-center text-xs">1</span>
                  <p className="text-sm text-gray-600">{t('onb.tip0')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-[color:var(--color-accent)] text-[color:var(--color-accent-foreground)] rounded-full flex items-center justify-center text-xs">2</span>
                  <p className="text-sm text-gray-600">{t('onb.tip1')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-[color:var(--color-accent)] text-[color:var(--color-accent-foreground)] rounded-full flex items-center justify-center text-xs">3</span>
                  <p className="text-sm text-gray-600">{t('onb.tip2')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-[color:var(--color-accent)] text-[color:var(--color-accent-foreground)] rounded-full flex items-center justify-center text-xs">4</span>
                  <p className="text-sm text-gray-600">{t('onb.tip3')}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={goToInvoice}
                className="btn btn-primary w-full"
              >
                {t('onb.createFirst')}
              </button>
              <button
                onClick={skipToApp}
                className="w-full border border-gray-200 text-gray-500 py-3 rounded-2xl text-sm hover:bg-gray-50 transition"
              >
                {t('onb.goDash')}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}