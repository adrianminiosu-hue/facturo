'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/components/CompanyProvider'
import BrandLockup from '@/components/BrandLockup'
import UserAvatar from '@/components/UserAvatar'
import LocaleSwitch from '@/components/LocaleSwitch'
import { useLocale } from '@/components/LocaleProvider'

const SETTINGS = ['profile', 'companies', 'account', 'team', 'nomenclator', 'efactura'] as const

export default function AppNav({ active }: { active: 'dashboard' | 'clients' | 'invoices' | 'purchase-invoices' | 'receivables' | 'nomenclator' | 'profile' | 'companies' | 'account' | 'team' | 'efactura' }) {
  const router = useRouter()
  const { t } = useLocale()
  const { userEmail, userName, userAvatarUrl, companies, company, setActiveCompanyId, createCompany, isOwner } = useCompany()
  const invoicesActive = active === 'invoices' || active === 'purchase-invoices'
  const settingsActive = SETTINGS.includes(active as typeof SETTINGS[number])
  const [invoicesOpen, setInvoicesOpen] = useState(invoicesActive)
  const [settingsOpen, setSettingsOpen] = useState(settingsActive)

  useEffect(() => {
    if (invoicesActive) setInvoicesOpen(true)
    if (settingsActive) setSettingsOpen(true)
  }, [invoicesActive, settingsActive])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const sideClass = (on: boolean) => on ? 'side-link side-link-active' : 'side-link'
  const subClass = (on: boolean) => on ? 'side-sub side-link-active' : 'side-sub'

  return (
    <>
      <aside className="app-sidebar">
        <div className="side-brand">
          <BrandLockup href="/dashboard" />
        </div>
        <nav className="flex-1 min-h-0 overflow-auto flex flex-col gap-0.5">
          <Link href="/dashboard" className={sideClass(active === 'dashboard')}>{t('nav.dashboard')}</Link>

          <button
            type="button"
            onClick={() => setInvoicesOpen(v => !v)}
            className={sideClass(invoicesActive)}
            aria-expanded={invoicesOpen}
          >
            <span>{t('nav.invoices')}</span>
            <span className="side-caret" data-open={invoicesOpen}>▾</span>
          </button>
          {invoicesOpen && (
            <div className="side-group">
              <Link href="/invoices" className={subClass(active === 'invoices')}>{t('nav.issuedInvoices')}</Link>
              <Link href="/facturi-achizitie" className={subClass(active === 'purchase-invoices')}>{t('nav.purchaseInvoices')}</Link>
            </div>
          )}

          <Link href="/incasari" className={sideClass(active === 'receivables')}>{t('nav.receivables')}</Link>
          <Link href="/clients" className={sideClass(active === 'clients')}>{t('nav.clients')}</Link>

          <button
            type="button"
            onClick={() => setSettingsOpen(v => !v)}
            className={sideClass(settingsActive)}
            aria-expanded={settingsOpen}
          >
            <span>{t('nav.settings')}</span>
            <span className="side-caret" data-open={settingsOpen}>▾</span>
          </button>
          {settingsOpen && (
            <div className="side-group">
              <Link href="/profile" className={subClass(active === 'profile')}>{t('nav.companyProfile')}</Link>
              <Link href="/nomenclator" className={subClass(active === 'nomenclator')}>{t('nav.catalog')}</Link>
              <Link href="/efactura" className={subClass(active === 'efactura')}>{t('nav.efactura')}</Link>
              <Link href="/companies" className={subClass(active === 'companies')}>{t('nav.companies')}</Link>
              <Link href="/team" className={subClass(active === 'team')}>{t('nav.team')}</Link>
              <Link href="/account" className={subClass(active === 'account')}>{t('nav.account')}</Link>
            </div>
          )}
        </nav>
      </aside>

      <header className="top-nav gap-4">
        <div className="flex items-center gap-3 min-w-0">
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
            title={t('nav.activeCompany')}
          >
            {companies.length === 0 && <option value="">{t('nav.noCompany')}</option>}
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.company_name || t('nav.unnamedCompany')}</option>
            ))}
            <option value="__new">{t('nav.newCompany')}</option>
          </select>
          {!isOwner && (
            <span className="nav-meta text-xs uppercase tracking-wider">{t('nav.operator')}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <LocaleSwitch />
          <Link href="/account" className="flex items-center gap-2 min-w-0" title={userEmail || t('nav.account')}>
            <UserAvatar url={userAvatarUrl} name={userName} email={userEmail} />
            <span className="nav-meta text-sm hidden md:inline truncate max-w-[14rem]">{userEmail}</span>
          </Link>
          <button
            onClick={handleLogout}
            className="nav-meta text-sm transition"
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>
    </>
  )
}
