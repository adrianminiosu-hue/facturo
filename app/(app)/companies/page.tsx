'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'

export default function CompaniesPage() {
  const router = useRouter()
  const { companies, company, setActiveCompanyId, createCompany } = useCompany()
  const [name, setName] = useState('')
  const [cui, setCui] = useState('')
  const [saving, setSaving] = useState(false)

  const addCompany = async () => {
    if (!name.trim()) { alert('Introdu denumirea firmei.'); return }
    setSaving(true)
    const created = await createCompany({ company_name: name.trim(), cui: cui.trim() })
    setSaving(false)
    if (created) {
      setName('')
      setCui('')
      router.push('/profile')
    }
  }

  return (
    <div className="app-shell">
      <AppNav active="companies" />
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl text-[color:var(--color-foreground)]">Firmele tale</h2>
          <p className="mt-1 text-[color:var(--color-muted-foreground)]">
            Lucrezi ca contabil pe mai multe firme. Clienții și facturile sunt izolate pe firma activă.
          </p>
        </div>

        <div className="card p-8 mb-6">
          <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">Adaugă o firmă</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              className="input"
              placeholder="Denumire firmă *"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <input
              className="input"
              placeholder="CUI (opțional, completezi apoi din registrul public)"
              value={cui}
              onChange={e => setCui(e.target.value)}
            />
          </div>
          <button onClick={addCompany} disabled={saving} className="btn btn-primary mt-4 disabled:opacity-50">
            {saving ? 'Se creează...' : '+ Creează firma'}
          </button>
        </div>

        <div className="card overflow-hidden">
          {companies.length === 0 ? (
            <p className="p-8 text-[color:var(--color-muted-foreground)]">Nu ai nicio firmă încă. Creează prima mai sus.</p>
          ) : companies.map((c, i) => (
            <div key={c.id} className={`px-6 py-4 flex items-center justify-between ${i < companies.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <div>
                <p className="font-medium text-[color:var(--color-foreground)]">{c.company_name || 'Firmă fără nume'}</p>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">CUI: {c.cui || '—'} · serie {c.invoice_series || 'FCT'}</p>
              </div>
              <div className="flex gap-2">
                {company?.id === c.id ? (
                  <span className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium">Activă</span>
                ) : (
                  <button
                    className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                    onClick={() => setActiveCompanyId(c.id)}
                  >
                    Lucrează pe această firmă
                  </button>
                )}
                <button
                  className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                  onClick={() => { setActiveCompanyId(c.id); router.push('/profile') }}
                >
                  Date fiscale
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
