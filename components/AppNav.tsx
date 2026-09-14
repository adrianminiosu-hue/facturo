'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/components/CompanyProvider'
import BrandLockup from '@/components/BrandLockup'

export default function AppNav({ active }: { active: 'dashboard' | 'clients' | 'invoices' | 'receivables' | 'profile' | 'companies' | 'account' }) {
  const router = useRouter()
  const { userEmail, companies, company, setActiveCompanyId, createCompany } = useCompany()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const linkClass = (key: typeof active) => key === active ? 'nav-link-active' : 'nav-link'
  const settingsActive = active === 'profile' || active === 'companies' || active === 'account'

  return (
    <nav className="top-nav gap-4 flex-wrap">
      <BrandLockup href="/dashboard" />
      <select
        value={company?.id || ''}
        onChange={async e => {
          if (e.target.value === '__new') {
            const created = await createCompany()
            if (created) router.push('/profile')
            return
          }
          setActiveCompanyId(e.target.value)
        }}
        className="select"
        title="Firma activă"
      >
        {companies.length === 0 && <option value="">Nicio firmă</option>}
        {companies.map(c => (
          <option key={c.id} value={c.id}>{c.company_name || 'Firmă fără nume'}</option>
        ))}
        <option value="__new">+ Firmă nouă</option>
      </select>
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <Link href="/dashboard" className={linkClass('dashboard')}>Dashboard</Link>
        <Link href="/invoices" className={linkClass('invoices')}>Facturi</Link>
        <Link href="/incasari" className={linkClass('receivables')}>Încasări</Link>
        <Link href="/clients" className={linkClass('clients')}>Clienți</Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setSettingsOpen(v => !v)}
            className={settingsActive ? 'nav-link-active' : 'nav-link'}
          >
            Setări
          </button>
          {settingsOpen && (
            <div className="absolute left-0 mt-2 z-30 min-w-[11rem] bg-white border border-[color:var(--color-border)] rounded-xl overflow-hidden py-1">
              <Link href="/profile" className="block px-3 py-2 text-sm text-[color:var(--color-foreground)] hover:bg-gray-50" onClick={() => setSettingsOpen(false)}>
                Profil firmă
              </Link>
              <Link href="/companies" className="block px-3 py-2 text-sm text-[color:var(--color-foreground)] hover:bg-gray-50" onClick={() => setSettingsOpen(false)}>
                Firme
              </Link>
              <Link href="/account" className="block px-3 py-2 text-sm text-[color:var(--color-foreground)] hover:bg-gray-50" onClick={() => setSettingsOpen(false)}>
                Cont
              </Link>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-sm text-[color:var(--color-muted-foreground)] hidden md:inline">{userEmail}</span>
        <button
          onClick={handleLogout}
          className="text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] transition"
        >
          Deconectare
        </button>
      </div>
    </nav>
  )
}
