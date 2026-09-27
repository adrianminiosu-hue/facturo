'use client'
import Chevron from '@/components/Chevron'
import { dashboardHref, visibleDashboardSlots } from '@/lib/dashboardSlots'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/components/CompanyProvider'
import BrandLockup from '@/components/BrandLockup'
import CompanySwitcher from '@/components/CompanySwitcher'
import UserAvatar from '@/components/UserAvatar'
import LocaleSwitch from '@/components/LocaleSwitch'
import { displayUserName } from '@/lib/userDisplay'
import { useLocale } from '@/components/LocaleProvider'
import { unreadCount } from '@/lib/notifications'
import { loadNotifications, notificationsSeenAt, onNotificationsSeen } from '@/lib/notificationsClient'

const SETTINGS = ['profile', 'companies', 'account', 'team', 'nomenclator'] as const
const DASHBOARD_SLOTS = visibleDashboardSlots()

export default function AppNav({ active }: { active: 'dashboard' | 'dashboard-1' | 'dashboard-2' | 'dashboard-3' | 'dashboard-4' | 'dashboard-5' | 'clients' | 'invoices' | 'purchase-invoices' | 'receivables' | 'banca' | 'nomenclator' | 'profile' | 'companies' | 'account' | 'team' | 'efactura' | 'notifications' }) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useLocale()
  const { userId, ownerUserId, userEmail, userName, userAvatarUrl, companies, company, setActiveCompanyId, createCompany, isOwner } = useCompany()
  const [inboxCount, setInboxCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const dashboardActive = active === 'dashboard' || active.startsWith('dashboard-')
  const invoicesActive = active === 'invoices' || active === 'purchase-invoices'
  const settingsActive = SETTINGS.includes(active as typeof SETTINGS[number])
  const [dashboardOpen, setDashboardOpen] = useState(dashboardActive)
  const [invoicesOpen, setInvoicesOpen] = useState(invoicesActive)
  const [settingsOpen, setSettingsOpen] = useState(settingsActive)

  useEffect(() => {
    if (dashboardActive) setDashboardOpen(true)
    if (invoicesActive) setInvoicesOpen(true)
    if (settingsActive) setSettingsOpen(true)
  }, [dashboardActive, invoicesActive, settingsActive])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .in('match_status', ['suggested', 'unmatched'])
      .then(({ count, error }) => {
        if (cancelled) return
        setInboxCount(error ? 0 : count || 0)
      })
    return () => { cancelled = true }
  }, [company?.id, active])

  // New notifications since this user last opened the page (shared, cached load; cleared when the page marks them seen).
  useEffect(() => {
    if (!company?.id || !userId) return
    let cancelled = false
    const refresh = async () => {
      try {
        const [built, seen] = await Promise.all([loadNotifications(company.id, ownerUserId || userId, userId), notificationsSeenAt()])
        // On the notifications page everything is being marked seen: never show a stale count there.
        if (!cancelled) setUnread(active === 'notifications' ? 0 : unreadCount(built.feed, seen))
      } catch {
        if (!cancelled) setUnread(0)
      }
    }
    refresh()
    const stop = onNotificationsSeen(() => { if (!cancelled) setUnread(0) })
    return () => {
      cancelled = true
      stop()
    }
  }, [company?.id, userId, ownerUserId, active])

  // Invoices ANAF rejected: they do not count as issued until fixed, so the menu flags them.
  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('efactura_status', 'rejected')
      .then(({ count, error }) => {
        if (cancelled) return
        setRejectedCount(error ? 0 : count || 0)
      })
    return () => { cancelled = true }
  }, [company?.id, active])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const sideClass = (on: boolean) => on ? 'side-link side-link-active' : 'side-link'
  const subClass = (on: boolean) => on ? 'side-sub side-link-active' : 'side-sub'

  return (
    <>
      {menuOpen && <div className="nav-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={`app-sidebar${menuOpen ? ' is-open' : ''}`}>
        <div className="side-brand">
          <BrandLockup href="/dashboard" />
        </div>
        <CompanySwitcher />
        <nav className="flex-1 min-h-0 overflow-auto flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => setDashboardOpen(v => !v)}
            className={sideClass(dashboardActive)}
            aria-expanded={dashboardOpen}
          >
            <span>{t('nav.dashboard')}</span>
            <span className="side-caret" data-open={dashboardOpen}><Chevron /></span>
          </button>
          {dashboardOpen && (
            <div className="side-group">
              <Link href="/dashboard" className={subClass(active === 'dashboard')}>{t('nav.dashboardMain')}</Link>
              {DASHBOARD_SLOTS.map(n => (
                <Link key={n} href={dashboardHref(n)} className={subClass(active === `dashboard-${n}`)}>
                  {t(`nav.dashboard${n}`)}
                </Link>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setInvoicesOpen(v => !v)}
            className={sideClass(invoicesActive)}
            aria-expanded={invoicesOpen}
          >
            <span>{t('nav.invoices')}</span>
            <span className="side-caret" data-open={invoicesOpen}><Chevron /></span>
          </button>
          {invoicesOpen && (
            <div className="side-group">
              <Link href="/invoices" className={subClass(active === 'invoices')}>{t('nav.issuedInvoices')}</Link>
              <Link href="/facturi-achizitie" className={subClass(active === 'purchase-invoices')}>{t('nav.purchaseInvoices')}</Link>
            </div>
          )}

          <Link href="/efactura" className={sideClass(active === 'efactura')}>
            <span className="flex items-center justify-between gap-2 w-full">
              <span>{t('nav.efactura')}</span>
              {rejectedCount > 0 && (
                <span className="text-xs min-w-[1.25rem] text-center rounded-full bg-red-600 text-white px-1" title={t('efd.stage.rejected')}>
                  {rejectedCount}
                </span>
              )}
            </span>
          </Link>
          <Link href="/incasari" className={sideClass(active === 'receivables')}>{t('nav.receivables')}</Link>
          <Link href="/banca" className={sideClass(active === 'banca')}>
            <span className="flex items-center justify-between gap-2 w-full">
              <span>{t('nav.bank')}</span>
              {inboxCount > 0 && (
                <span className="text-xs min-w-[1.25rem] text-center rounded-full bg-[color:var(--color-foreground)] text-[color:var(--color-background)] px-1">
                  {inboxCount}
                </span>
              )}
            </span>
          </Link>
          <Link href="/clients" className={sideClass(active === 'clients')}>{t('nav.clients')}</Link>

          <button
            type="button"
            onClick={() => setSettingsOpen(v => !v)}
            className={sideClass(settingsActive)}
            aria-expanded={settingsOpen}
          >
            <span>{t('nav.settings')}</span>
            <span className="side-caret" data-open={settingsOpen}><Chevron /></span>
          </button>
          {settingsOpen && (
            <div className="side-group">
              <Link href="/profile" className={subClass(active === 'profile')}>{t('nav.companyProfile')}</Link>
              <Link href="/nomenclator" className={subClass(active === 'nomenclator')}>{t('nav.catalog')}</Link>
              <Link href="/companies" className={subClass(active === 'companies')}>{t('nav.companies')}</Link>
              <Link href="/team" className={subClass(active === 'team')}>{t('nav.team')}</Link>
              <Link href="/account" className={subClass(active === 'account')}>{t('nav.account')}</Link>
            </div>
          )}
        </nav>
        <div className="side-footer">
          <button type="button" onClick={handleLogout} className="side-link">
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      <header className="top-nav gap-4">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            className="nav-menu-btn"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.menu')}
            onClick={() => setMenuOpen(v => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              ) : (
                <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              )}
            </svg>
          </button>
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
            className="select top-company-select"
            title={t('nav.activeCompany')}
          >
            {companies.length === 0 && <option value="">{t('nav.noCompany')}</option>}
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.company_name || t('nav.unnamedCompany')}</option>
            ))}
            <option value="__new">{t('nav.newCompany')}</option>
          </select>
          {!isOwner && (
            <span className="nav-meta text-xs uppercase tracking-wider top-company-select">{t('nav.operator')}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/notificari"
            className={`nav-bell${active === 'notifications' ? ' is-active' : ''}`}
            aria-label={unread ? `${t('nav.notifications')}: ${unread}` : t('nav.notifications')}
            title={t('nav.notifications')}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M9 2.5a4.5 4.5 0 0 0-4.5 4.5v2.6L3.2 12.2h11.6l-1.3-2.6V7A4.5 4.5 0 0 0 9 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M7.2 14.5a1.9 1.9 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {unread > 0 && <span className="nav-bell-count">{unread > 99 ? '99+' : unread}</span>}
          </Link>
          <Link href="/account" className="flex items-center gap-2 min-w-0" title={userEmail || t('nav.account')}>
            <UserAvatar url={userAvatarUrl} name={userName} email={userEmail} />
            <span className="nav-meta text-sm hidden md:inline truncate max-w-[14rem]" title={userEmail || undefined}>{displayUserName(userName) || userEmail}</span>
          </Link>
          <LocaleSwitch />
          <button
            onClick={handleLogout}
            className="nav-meta text-sm transition top-nav-logout"
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>
    </>
  )
}
