'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Onboarding() {
  const router = useRouter()
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
    email: '',
    phone: '',
    bank_name: '',
    iban: ''
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      // Check if already onboarded
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('company_name')
        .eq('id', user.id)
        .single()

      const { data: existingClients } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)

      const { data: existingInvoices } = await supabase
        .from('invoices')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)

      // Skip steps already completed
      if (existingProfile?.company_name && existingClients?.length && existingInvoices?.length) {
        router.push('/dashboard')
        return
      }
      if (existingProfile?.company_name && existingClients?.length) {
        setStep(3)
        return
      }
      if (existingProfile?.company_name) {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cui })
      })
      const data = await res.json()
      if (data.success) {
        if (type === 'profile') {
          setProfile(f => ({
            ...f,
            company_name: data.company_name || f.company_name,
            reg_com: data.reg_com || f.reg_com,
            address: data.address || f.address,
            city: data.city || f.city,
            county: data.county || f.county
          }))
        } else {
          setClient(f => ({
            ...f,
            company_name: data.company_name || f.company_name,
            reg_com: data.reg_com || f.reg_com,
            address: data.address || f.address,
            city: data.city || f.city,
            county: data.county || f.county
          }))
        }
      } else {
        alert('CUI negăsit în ANAF.')
      }
    } catch (e) {
      alert('Eroare conexiune ANAF.')
    }
    type === 'profile' ? setCuiLoading(false) : setClientCuiLoading(false)
  }

  const saveProfile = async () => {
    if (!profile.company_name) { alert('Introdu denumirea companiei!'); return }
    setSaving(true)
    await supabase.from('profiles').upsert({ id: userId, ...profile })
    setSaving(false)
    setStep(2)
  }

  const saveClient = async () => {
    if (!client.company_name) { alert('Introdu denumirea clientului!'); return }
    setSaving(true)
    await supabase.from('clients').insert({ ...client, user_id: userId })
    setSaving(false)
    setStep(3)
  }

  const goToInvoice = () => {
    router.push('/invoices/new')
  }

  const skipToApp = () => {
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="text-xl font-bold text-gray-900">Facturo</span>
          <button onClick={skipToApp} className="text-sm text-gray-400 hover:text-gray-600 transition">
            Sari peste →
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
                s === step ? 'bg-black text-white' :
                'bg-gray-100 text-gray-400'
              }`}>
                {s < step ? '✓' : s}
              </div>
              <div className="flex-1">
                <p className={`text-xs font-medium ${s === step ? 'text-gray-900' : 'text-gray-400'}`}>
                  {s === 1 ? 'Compania ta' : s === 2 ? 'Primul client' : 'Prima factură'}
                </p>
              </div>
              {s < 3 && <div className={`h-0.5 w-8 flex-shrink-0 ${s < step ? 'bg-green-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 — Company profile */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Configurează compania ta</h2>
            <p className="text-gray-500 mb-8">Aceste date vor apărea pe toate facturile tale.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CUI / CIF</label>
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
                    className="bg-black text-white px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 whitespace-nowrap"
                  >
                    {cuiLoading ? 'Se caută...' : 'Caută ANAF'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Denumire companie *</label>
                <input
                  type="text"
                  value={profile.company_name}
                  onChange={e => setProfile(f => ({ ...f, company_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="SC Compania Mea SRL"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nr. Reg. Comerț</label>
                  <input
                    type="text"
                    value={profile.reg_com}
                    onChange={e => setProfile(f => ({ ...f, reg_com: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="J40/1234/2020"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Oraș</label>
                  <input
                    type="text"
                    value={profile.city}
                    onChange={e => setProfile(f => ({ ...f, city: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="București"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresă</label>
                <input
                  type="text"
                  value={profile.address}
                  onChange={e => setProfile(f => ({ ...f, address: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Str. Exemplu, nr. 1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bancă</label>
                  <input
                    type="text"
                    value={profile.bank_name}
                    onChange={e => setProfile(f => ({ ...f, bank_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Banca Transilvania"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email companie</label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={e => setProfile(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="contact@companie.ro"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serie factură</label>
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
                Completează mai târziu
              </button>
              <button
                onClick={saveProfile}
                disabled={saving || !profile.company_name}
                className="bg-black text-white px-8 py-3 rounded-xl font-medium hover:bg-gray-800 transition disabled:opacity-50"
              >
                {saving ? 'Se salvează...' : 'Continuă →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — First client */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Adaugă primul client</h2>
            <p className="text-gray-500 mb-8">Introdu CUI-ul și datele se completează automat din ANAF.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CUI / CIF client</label>
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
                    className="bg-black text-white px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 whitespace-nowrap"
                  >
                    {clientCuiLoading ? 'Se caută...' : 'Caută ANAF'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Denumire companie *</label>
                <input
                  type="text"
                  value={client.company_name}
                  onChange={e => setClient(f => ({ ...f, company_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="SC Client SRL"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nr. Reg. Comerț</label>
                  <input
                    type="text"
                    value={client.reg_com}
                    onChange={e => setClient(f => ({ ...f, reg_com: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="J40/1234/2020"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Oraș</label>
                  <input
                    type="text"
                    value={client.city}
                    onChange={e => setClient(f => ({ ...f, city: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="București"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresă</label>
                <input
                  type="text"
                  value={client.address}
                  onChange={e => setClient(f => ({ ...f, address: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Str. Exemplu, nr. 1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email client</label>
                  <input
                    type="email"
                    value={client.email}
                    onChange={e => setClient(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="contact@client.ro"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
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
                ← Înapoi
              </button>
              <div className="flex gap-3">
                <button onClick={skipToApp} className="text-sm text-gray-400 hover:text-gray-600 transition px-4 py-3">
                  Sari peste
                </button>
                <button
                  onClick={saveClient}
                  disabled={saving || !client.company_name}
                  className="bg-black text-white px-8 py-3 rounded-xl font-medium hover:bg-gray-800 transition disabled:opacity-50"
                >
                  {saving ? 'Se salvează...' : 'Continuă →'}
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
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Ești gata!</h2>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">
              Compania și primul client sunt configurate. Acum poți emite prima ta factură profesională.
            </p>

            <div className="bg-gray-50 rounded-2xl p-6 mb-8 text-left">
              <p className="text-sm font-medium text-gray-700 mb-3">Ce se întâmplă când creezi o factură:</p>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs">1</span>
                  <p className="text-sm text-gray-600">Selectezi clientul din lista ta</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs">2</span>
                  <p className="text-sm text-gray-600">Adaugi produsele/serviciile cu prețuri</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs">3</span>
                  <p className="text-sm text-gray-600">TVA se calculează automat</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs">4</span>
                  <p className="text-sm text-gray-600">Descarci PDF-ul sau trimiți pe email</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={goToInvoice}
                className="w-full bg-black text-white py-4 rounded-2xl font-medium text-lg hover:bg-gray-800 transition"
              >
                Creează prima factură →
              </button>
              <button
                onClick={skipToApp}
                className="w-full border border-gray-200 text-gray-500 py-3 rounded-2xl text-sm hover:bg-gray-50 transition"
              >
                Du-mă la dashboard
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}