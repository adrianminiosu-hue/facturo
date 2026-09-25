'use client'
import Link from 'next/link'
import BrandLockup from '@/components/BrandLockup'
import { useLocale } from '@/components/LocaleProvider'

export default function TermeniPage() {
  const { t } = useLocale()
  return (
    <div className="landing">
      <header className="landing-header">
        <BrandLockup href="/" />
        <Link href="/login" className="landing-text-link">{t('landing.signIn')}</Link>
      </header>
      <main className="landing-hero" style={{ display: 'block', paddingBottom: '4rem' }}>
        <h1 className="landing-h1" style={{ fontSize: '2.4rem' }}>{t('landing.termsTitle')}</h1>
        <p className="landing-lead">{t('landing.termsBody')}</p>
      </main>
    </div>
  )
}
