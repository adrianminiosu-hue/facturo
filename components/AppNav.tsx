'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/components/CompanyProvider'
import BrandLockup from '@/components/BrandLockup'
import UserAvatar from '@/components/UserAvatar'

export default function AppNav({ active }: { active: 'dashboard' | 'clients' | 'invoices' | 'purchase-invoices' | 'receivables' | 'nomenclator' | 'profile' | 'companies' | 'account' | 'team' | 'efactura' }) {
  const router = useRouter()
  const { userEmail, userName, userAvatarUrl, companies, company, setActiveCompanyId, createCompany, isOwner } = useCompany()
  const [invoicesOpen, setInvoicesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const linkClass = (key: typeof active) => key === active ? 'nav-link-active' : 'nav-link'
  const invoicesActive = active === 'invoices' || active === 'purchase-invoices'
  const settingsActive = active === 'profile' || active === 'companies' || active === 'account' || active === 'team' || active === 'nomenclator' || active === 'efactura'

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
      {!isOwner && (
        <span className="nav-meta text-xs uppercase tracking-wider">Operator</span>
      )}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <Link href="/dashboard" className={linkClass('dashboard')}>Dashboard</Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setInvoicesOpen(v => !v)
              setSettingsOpen(false)
            }}
            className={invoicesActive ? 'nav-link-active' : 'nav-link'}
          >
            Facturi
          </button>
          {invoicesOpen && (
            <div className="absolute left-0 mt-2 z-30 min-w-[13rem] bg-white border border-[color:var(--color-border)] rounded-xl overflow-hidden py-1">
              <Link href="/invoices" className="block px-3 py-2 text-sm text-[color:var(--color-foreground)] hover:bg-gray-50" onClick={() => setInvoicesOpen(false)}>
                Facturi emise
              </Link>
              <Link href="/facturi-achizitie" className="block px-3 py-2 text-sm text-[color:var(--color-foreground)] hover:bg-gray-50" onClick={() => setInvoicesOpen(false)}>
                Facturi de achiziție
              </Link>
            </div>
          )}
        </div>
        <Link href="/incasari" className={linkClass('receivables')}>Încasări</Link>
        <Link href="/clients" className={linkClass('clients')}>Clienți</Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(v => !v)
              setInvoicesOpen(false)
            }}
            className={settingsActive ? 'nav-link-active' : 'nav-link'}
          >
            Setări
          </button>
          {settingsOpen && (
            <div className="absolute left-0 mt-2 z-30 min-w-[11rem] bg-white border border-[color:var(--color-border)] rounded-xl overflow-hidden py-1">
              <Link href="/profile" className="block px-3 py-2 text-sm text-[color:var(--color-foreground)] hover:bg-gray-50" onClick={() => setSettingsOpen(false)}>
                Profil firmă
              </Link>
              <Link href="/nomenclator" className="block px-3 py-2 text-sm text-[color:var(--color-foreground)] hover:bg-gray-50" onClick={() => setSettingsOpen(false)}>
                Nomenclator articole
              </Link>
              <Link href="/efactura" className="block px-3 py-2 text-sm text-[color:var(--color-foreground)] hover:bg-gray-50" onClick={() => setSettingsOpen(false)}>
                e-Factura TEST
              </Link>
              <Link href="/companies" className="block px-3 py-2 text-sm text-[color:var(--color-foreground)] hover:bg-gray-50" onClick={() => setSettingsOpen(false)}>
                Firme
              </Link>
              <Link href="/team" className="block px-3 py-2 text-sm text-[color:var(--color-foreground)] hover:bg-gray-50" onClick={() => setSettingsOpen(false)}>
                Echipă
              </Link>
              <Link href="/account" className="block px-3 py-2 text-sm text-[color:var(--color-foreground)] hover:bg-gray-50" onClick={() => setSettingsOpen(false)}>
                Cont
              </Link>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Link href="/account" className="flex items-center gap-2 min-w-0" title={userEmail || 'Cont'}>
          <UserAvatar url={userAvatarUrl} name={userName} email={userEmail} />
          <span className="nav-meta text-sm hidden md:inline truncate max-w-[14rem]">{userEmail}</span>
        </Link>
        <button
          onClick={handleLogout}
          className="nav-meta text-sm transition"
        >
          Deconectare
        </button>
      </div>
    </nav>
  )
}
