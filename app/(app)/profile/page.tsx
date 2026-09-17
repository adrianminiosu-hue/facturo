'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { isValidRomanianMobile } from '@/lib/romanianMobile'
import RoAddressFields from '@/components/RoAddressFields'
import { countyCodeFromName, countyNameFromCode } from '@/lib/romania'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import BankDetailsFields from '@/components/BankDetailsFields'
import { normalizeIban } from '@/lib/iban'
import { normalizeBic, validateClientBankDetails } from '@/lib/roBanks'

export default function Profile() {
  const router = useRouter()
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
        alert('CUI negăsit în registrul public.')
      }
    } catch (e) {
      alert('Eroare conexiune la registrul public.')
    }
    setCuiLoading(false)
  }

  const saveProfile = async () => {
    if (form.phone && !isValidRomanianMobile(form.phone)) {
      alert('Număr de mobil invalid. Format acceptat: 07xxxxxxxx sau +407xxxxxxxx.')
      return
    }
    if (!bankDetails.ok) {
      alert(bankDetails.error || 'Datele bancare sunt invalide.')
      return
    }
    setSaving(true)
    const payload = {
      ...form,
      iban: normalizeIban(form.iban),
      bic: normalizeBic(form.bic),
      county: countyNameFromCode(form.county_code) || form.county
    }
    if (company?.id) {
      const { error } = await supabase.from('companies').update(payload).eq('id', company.id)
      if (error) alert(error.message || 'Nu s-a putut salva. Rulează migrarea multi-company în Supabase.')
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
          <h2 className="text-3xl text-[color:var(--color-foreground)]">Profilul firmei active</h2>
          <p className="mt-1 text-[color:var(--color-muted-foreground)]">
            Datele apar pe facturile firmei selectate în meniu. Poți adăuga alte firme din Firme.
          </p>
        </div>

        <div className="space-y-6">

          {/* Company details */}
          <div className="card p-8">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-6">Date fiscale</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                    className="btn btn-primary px-4 py-3 disabled:opacity-50 whitespace-nowrap"
                  >
                    {cuiLoading ? 'Se caută...' : 'Caută CUI'}
                  </button>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Denumire companie *</label>
                <input
                  type="text"
                  value={form.company_name}
                  onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                  className="input"
                  placeholder="SC Compania Mea SRL"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Nr. Reg. Comerț</label>
                <input
                  type="text"
                  value={form.reg_com}
                  onChange={e => setForm(f => ({ ...f, reg_com: e.target.value }))}
                  className="input"
                  placeholder="J40/1234/2020"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Adresă *</label>
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
                  Platitor de TVA (identificatorul TVA RO+CUI este obligatoriu în e-Factura)
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground)]">
                  <input
                    type="checkbox"
                    checked={form.vat_on_collection}
                    onChange={e => setForm(f => ({ ...f, vat_on_collection: e.target.checked }))}
                  />
                  TVA la încasare (mențiunea legală se pune automat pe factură)
                </label>
              </div>
            </div>
          </div>

          {/* Bank details */}
          <div className="card p-8">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-6">Date bancare</h3>
            <BankDetailsFields
              value={{ bank_name: form.bank_name, iban: form.iban, bic: form.bic }}
              onChange={next => setForm(f => ({ ...f, ...next }))}
            />
          </div>

          {/* Contact */}
          <div className="card p-8">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-6">Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Persoană de contact</label>
                <input
                  type="text"
                  value={form.contact_person}
                  onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
                  className="input"
                  placeholder="Ion Popescu"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Funcție</label>
                <input
                  type="text"
                  value={form.contact_role}
                  onChange={e => setForm(f => ({ ...f, contact_role: e.target.value }))}
                  className="input"
                  placeholder="Director General"
                />
              </div>
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
            </div>
          </div>

          {/* Invoice settings */}
          <div className="card p-8">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-1">Setări facturare</h3>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mb-5">Seria și numărul de start pentru facturile tale</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Serie factură</label>
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
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Număr de start</label>
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
              className="btn btn-primary px-8 py-3 disabled:opacity-50"
            >
              {saving ? 'Se salvează...' : 'Salvează profilul'}
            </button>
            {saved && (
              <span className="text-sm text-green-600 font-medium">✓ Salvat cu succes!</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}