'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isValidRomanianMobile } from '@/lib/romanianMobile'

interface Client {
  id: string
  company_name: string
  cui: string
  reg_com: string
  address: string
  city: string
  county: string
  email: string
  phone: string
  bank_name: string
  iban: string
}

const emptyForm = {
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
}

export default function Clients() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [cuiLoading, setCuiLoading] = useState(false)
  const [userId, setUserId] = useState<string>('')
  const [form, setForm] = useState(emptyForm)
  const phoneValid = !form.phone || isValidRomanianMobile(form.phone)
  const [filterCui, setFilterCui] = useState('')

  const normalizedFilterCui = filterCui.trim().replace(/\s+/g, '').toUpperCase()
  const filteredClients = normalizedFilterCui
    ? clients.filter(c => (c.cui || '').replace(/\s+/g, '').toUpperCase().includes(normalizedFilterCui))
    : clients

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      loadClients(user.id)
    }
    init()
  }, [])

  const loadClients = async (uid: string) => {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    setClients(data || [])
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
          address: data.address || f.address,
          city: data.city || f.city,
          county: data.county || f.county
        }))
      } else {
        alert('CUI negăsit în ANAF. Verifică numărul și încearcă din nou.')
      }
    } catch (e) {
      alert('Eroare de conexiune. Încearcă din nou.')
    }
    setCuiLoading(false)
  }

  const openNew = () => {
    setEditClient(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (client: Client) => {
    setEditClient(client)
    setForm({
      company_name: client.company_name,
      cui: client.cui || '',
      reg_com: client.reg_com || '',
      address: client.address || '',
      city: client.city || '',
      county: client.county || '',
      email: client.email || '',
      phone: client.phone || '',
      bank_name: client.bank_name || '',
      iban: client.iban || ''
    })
    setShowForm(true)
  }

  const saveClient = async () => {
    if (!form.company_name) return
    if (form.phone && !isValidRomanianMobile(form.phone)) {
      alert('Număr de mobil invalid. Format acceptat: 07xxxxxxxx sau +407xxxxxxxx.')
      return
    }
    if (form.iban && (!form.iban.startsWith('RO') || form.iban.length !== 24)) {
      alert('IBAN invalid! Trebuie să înceapă cu RO și să aibă exact 24 de caractere.')
      return
    }
    setSaving(true)

    if (editClient) {
      const { error } = await supabase
        .from('clients')
        .update({
          email: form.email,
          phone: form.phone,
          bank_name: form.bank_name,
          iban: form.iban
        })
        .eq('id', editClient.id)
      if (!error) {
        setShowForm(false)
        setEditClient(null)
        loadClients(userId)
      }
    } else {
      const { error } = await supabase.from('clients').insert({
        ...form,
        user_id: userId
      })
      if (!error) {
        setShowForm(false)
        setForm(emptyForm)
        loadClients(userId)
      }
    }
    setSaving(false)
  }

  const deleteClient = async (id: string) => {
    if (!confirm('Ești sigur că vrei să ștergi acest client?')) return
    await supabase.from('clients').delete().eq('id', id)
    loadClients(userId)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="text-xl font-bold text-gray-900">Facturo</Link>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition">Dashboard</Link>
          <Link href="/clients" className="text-sm font-medium text-gray-900">Clienți</Link>
          <Link href="/invoices" className="text-sm text-gray-500 hover:text-gray-900 transition">Facturi</Link>
          <Link href="/profile" className="text-sm text-gray-500 hover:text-gray-900 transition">Profil</Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Clienți</h2>
            <p className="text-gray-500 mt-1">
              {filteredClients.length} clienți{normalizedFilterCui ? ` din ${clients.length}` : ''}
            </p>
          </div>
          <button
            onClick={openNew}
            className="bg-black text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition"
          >
            + Client nou
          </button>
        </div>

        {!loading && clients.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Caută după CUI / CIF</label>
                <input
                  type="text"
                  value={filterCui}
                  onChange={e => setFilterCui(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="ex: RO12345678 sau 12345678"
                />
              </div>
              <div className="flex gap-2 md:justify-end">
                <button
                  onClick={() => setFilterCui('')}
                  disabled={!normalizedFilterCui}
                  className="border border-gray-200 text-gray-700 px-5 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Resetează
                </button>
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
            <h3 className="font-bold text-gray-900 mb-1">
              {editClient ? 'Editează client' : 'Client nou'}
            </h3>
            {editClient && (
              <p className="text-xs text-gray-400 mb-6">Datele fiscale sunt preluate din ANAF și nu pot fi modificate.</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!editClient && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">CUI / CIF</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.cui}
                      onChange={e => setForm(f => ({ ...f, cui: e.target.value }))}
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                      placeholder="ex: 12345678"
                    />
                    <button
                      onClick={lookupCUI}
                      disabled={cuiLoading}
                      className="bg-black text-white px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 whitespace-nowrap"
                    >
                      {cuiLoading ? 'Se caută...' : 'Caută ANAF'}
                    </button>
                  </div>
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Denumire companie</label>
                <input
                  type="text"
                  value={form.company_name}
                  disabled={!!editClient}
                  className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black ${editClient ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                  placeholder="SC Exemplu SRL"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nr. Reg. Comerț</label>
                <input
                  type="text"
                  value={form.reg_com}
                  disabled={!!editClient}
                  className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black ${editClient ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                  placeholder="J40/1234/2020"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Oraș</label>
                <input
                  type="text"
                  value={form.city}
                  disabled={!!editClient}
                  className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black ${editClient ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                  placeholder="București"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresă</label>
                <input
                  type="text"
                  value={form.address}
                  disabled={!!editClient}
                  className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black ${editClient ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                  placeholder="Str. Exemplu, nr. 1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-blue-500 text-xs">editabil</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="contact@companie.ro"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefon <span className="text-blue-500 text-xs">editabil</span>
                </label>
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bancă emitentă <span className="text-blue-500 text-xs">editabil</span>
                </label>
                <select
                  value={form.bank_name}
                  onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black bg-white"
                >
                  <option value="">Selectează banca...</option>
                  <option value="Banca Transilvania">Banca Transilvania</option>
                  <option value="UniCredit Bank">UniCredit Bank</option>
                  <option value="Raiffeisen Bank">Raiffeisen Bank</option>
                  <option value="BCR">BCR</option>
                  <option value="BRD">BRD</option>
                  <option value="ING Bank">ING Bank</option>
                  <option value="Alpha Bank">Alpha Bank</option>
                  <option value="CEC Bank">CEC Bank</option>
                  <option value="OTP Bank">OTP Bank</option>
                  <option value="Garanti BBVA">Garanti BBVA</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cont bancar (IBAN) <span className="text-blue-500 text-xs">editabil</span>
                </label>
                <input
                  type="text"
                  value={form.iban}
                  onChange={e => {
                    const val = e.target.value.toUpperCase()
                    setForm(f => ({ ...f, iban: val }))
                  }}
                  className={`w-full border rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black ${
                    form.iban && (form.iban.length !== 24 || !form.iban.startsWith('RO'))
                      ? 'border-red-300 bg-red-50'
                      : form.iban && form.iban.length === 24 && form.iban.startsWith('RO')
                      ? 'border-green-300 bg-green-50'
                      : 'border-gray-200'
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
                {form.iban && form.iban.startsWith('RO') && form.iban.length === 24 && (
                  <p className="text-green-500 text-xs mt-1">✓ IBAN valid</p>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveClient}
                disabled={saving || !form.company_name}
                className="bg-black text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
              >
                {saving ? 'Se salvează...' : editClient ? 'Salvează modificările' : 'Salvează client'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditClient(null) }}
                className="border border-gray-200 text-gray-700 px-6 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
              >
                Anulează
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-gray-400 text-center py-12">Se încarcă...</p>
        ) : clients.length === 0 && !showForm ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <p className="text-gray-400">Nu ai niciun client încă</p>
            <p className="text-gray-400 text-sm mt-1">Adaugă primul tău client!</p>
          </div>
        ) : filteredClients.length === 0 && !showForm ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <p className="text-gray-400">Nu există clienți pentru filtrul selectat</p>
            <button
              onClick={() => setFilterCui('')}
              className="text-black font-medium text-sm mt-2 inline-block hover:underline"
            >
              Resetează filtrul →
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {filteredClients.map((client, i) => (
              <div key={client.id} className={`flex items-center justify-between px-6 py-4 ${i !== filteredClients.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div>
                  <p className="font-medium text-gray-900">{client.company_name}</p>
                  <p className="text-sm text-gray-500">CUI: {client.cui || '—'} {client.city ? `· ${client.city}` : ''}</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm text-gray-500">{client.email || '—'}</p>
                    <p className="text-sm text-gray-400">{client.bank_name ? `${client.bank_name} · ${client.iban || '—'}` : client.phone || '—'}</p>
                  </div>
                  <div className="flex gap-2">
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}