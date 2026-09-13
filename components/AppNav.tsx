'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/components/CompanyProvider'
import BrandLockup from '@/components/BrandLockup'

export default function AppNav({ active }: { active: 'dashboard' | 'clients' | 'invoices' | 'profile' | 'companies' }) {
  const router = useRouter()
  const { userEmail, companies, company, setActiveCompanyId, createCompany } = useCompany()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const linkClass = (key: typeof active) => key === active ? 'nav-link-active' : 'nav-link'

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
        <Link href="/clients" className={linkClass('clients')}>Clienți</Link>
        <Link href="/invoices" className={linkClass('invoices')}>Facturi</Link>
        <Link href="/profile" className={linkClass('profile')}>Profil firmă</Link>
        <Link href="/companies" className={linkClass('companies')}>Firme</Link>
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
