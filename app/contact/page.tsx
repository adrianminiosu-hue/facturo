'use client'
import Link from 'next/link'
import BrandLockup from '@/components/BrandLockup'
import { useLocale } from '@/components/LocaleProvider'
import { legalCompany } from '@/config/company'

export default function ContactPage() {
  const { t } = useLocale()
  return (
    <div className="landing">
      <header className="landing-header">
        <BrandLockup href="/" />
        <Link href="/login" className="landing-text-link">{t('landing.signIn')}</Link>
      </header>
      <main className="landing-hero" style={{ display: 'block', paddingBottom: '4rem' }}>
        <h1 className="landing-h1" style={{ fontSize: '2.4rem' }}>{t('landing.contactTitle')}</h1>
        <p className="landing-lead">{t('landing.contactBody', { email: legalCompany.contactEmail })}</p>
        <a className="landing-btn landing-btn-accent" href={`mailto:${legalCompany.contactEmail}`}>
          {legalCompany.contactEmail}
        </a>
      </main>
    </div>
  )
}
