'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isValidRomanianMobile } from '@/lib/romanianMobile'

export default function Profile() {
  const router = useRouter()
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
    bank_name: '',
    iban: '',
    email: '',
    phone: '',
    invoice_series: 'FCT',
    invoice_start_number: 1
  })
  const phoneValid = !form.phone || isValidRomanianMobile(form.phone)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (profile) {
        setForm({
          company_name: profile.company_name || '',
          cui: profile.cui || '',
          reg_com: profile.reg_com || '',
          address: profile.address || '',
          city: profile.city || '',
          county: profile.county || '',
          bank_name: profile.bank_name || '',
          iban: profile.iban || '',
          email: profile.email || '',
          phone: profile.phone || '',
          invoice_series: profile.invoice_series || 'FCT',
          invoice_start_number: profile.invoice_start_number || 1
        })
      }
    }
    init()
  }, [])

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
          county: data.county || f.county
        }))
      } else {
        alert('CUI negăsit în ANAF.')
      }
    } catch (e) {
      alert('Eroare conexiune ANAF.')
    }
    setCuiLoading(false)
  }

  const saveProfile = async () => {
    if (form.phone && !isValidRomanianMobile(form.phone)) {
      alert('Număr de mobil invalid. Format acceptat: 07xxxxxxxx sau +407xxxxxxxx.')
      return
    }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').upsert({
      id: user?.id,
      ...form
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <Link href="/dashboard" className="text-xl font-bold text-[color:var(--color-foreground)]">Facturo</Link>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="nav-link">Dashboard</Link>
          <Link href="/clients" className="nav-link">Clienți</Link>
          <Link href="/invoices" className="nav-link">Facturi</Link>
          <Link href="/profile" className="nav-link-active">Profil</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-[color:var(--color-foreground)]">Profilul companiei</h2>
          <p className="mt-1 text-[color:var(--color-muted-foreground)]">Aceste date apar pe toate facturile tale</p>
        </div>

        <div className="space-y-6">

          {/* Company details */}
          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">Date fiscale</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    {cuiLoading ? 'Se caută...' : 'Caută ANAF'}
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
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Județ</label>
                <input
                  type="text"
                  value={form.county}
                  onChange={e => setForm(f => ({ ...f, county: e.target.value }))}
                  className="input"
                  placeholder="București"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Adresă</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="input"
                  placeholder="Str. Exemplu, nr. 1, sector 1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Oraș</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  className="input"
                  placeholder="București"
                />
              </div>
            </div>
          </div>

          {/* Bank details */}
          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">Date bancare</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Bancă</label>
                <input
                  type="text"
                  value={form.bank_name}
                  onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                  className="input"
                  placeholder="Banca Transilvania"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">IBAN</label>
                <input
                  type="text"
                  value={form.iban}
                  onChange={e => setForm(f => ({ ...f, iban: e.target.value }))}
                  className="input"
                  placeholder="RO49AAAA1B31007593840000"
                />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  className={`w-full border rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black ${
                    form.phone && !phoneValid ? 'border-red-300 bg-red-50' : 'border-gray-200'
                  }`}
                  placeholder="0721 234 567"
                />
                {form.phone && !phoneValid && (
                  <p className="text-red-500 text-xs mt-1">Mobil invalid (ex: 0721234567 sau +40721234567)</p>
                )}
              </div>
            </div>
          </div>

          {/* Invoice settings */}
          <div className="card p-6">
            <h3 className="font-bold text-[color:var(--color-foreground)] mb-1">Setări facturare</h3>
            <p className="text-xs text-[color:var(--color-muted-foreground)] mb-4">Seria și numărul de start pentru facturile tale</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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