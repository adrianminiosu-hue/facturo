'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useLocale } from '@/components/LocaleProvider'
import { useCompany } from '@/components/CompanyProvider'

export default function CompaniesPage() {
  const router = useRouter()
  const { t } = useLocale()
  const { companies, company, setActiveCompanyId, createCompany, userId } = useCompany()
  const [name, setName] = useState('')
  const [cui, setCui] = useState('')
  const [saving, setSaving] = useState(false)

  const addCompany = async () => {
    if (!name.trim()) { alert(t('co.nameRequired')); return }
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
          <h2 className="page-title text-[color:var(--color-foreground)]">{t('co.title')}</h2>
          <p className="mt-1 text-[color:var(--color-muted-foreground)]">
            {t('co.lead')}
          </p>
        </div>

        <div className="card p-8 mb-6">
          <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">{t('co.add')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              className="input"
              placeholder={t('co.namePh')}
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <input
              className="input"
              placeholder={t('co.cuiPh')}
              value={cui}
              onChange={e => setCui(e.target.value)}
            />
          </div>
          <button onClick={addCompany} disabled={saving} className="btn btn-primary mt-4 disabled:opacity-50">
            {saving ? t('common.creating') : t('co.create')}
          </button>
        </div>

        <div className="card overflow-hidden">
          {companies.length === 0 ? (
            <p className="p-8 text-[color:var(--color-muted-foreground)]">{t('co.empty')}</p>
          ) : companies.map((c, i) => (
            <div key={c.id} className={`px-6 py-4 flex items-center justify-between ${i < companies.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <div>
                <p className="font-medium text-[color:var(--color-foreground)]">{c.company_name || t('nav.unnamedCompany')}</p>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">
                  {t('cli.cui')}: {c.cui || '—'} · {t('co.series', { series: c.invoice_series || 'FCT' })}
                  {c.user_id !== userId ? ` · ${t('co.invited')}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                {company?.id === c.id ? (
                  <span className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium">{t('co.active')}</span>
                ) : (
                  <button
                    className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                    onClick={() => setActiveCompanyId(c.id)}
                  >
                    {t('co.workOn')}
                  </button>
                )}
                <button
                  className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                  onClick={() => { setActiveCompanyId(c.id); router.push('/profile') }}
                >
                  {t('co.fiscal')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
