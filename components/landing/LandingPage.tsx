'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BrandLockup from '@/components/BrandLockup'
import LocaleSwitch from '@/components/LocaleSwitch'
import { useLocale } from '@/components/LocaleProvider'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/landingTrack'
import { legalCompany } from '@/config/company'
import PhoneMock from '@/components/landing/PhoneMock'
import DesktopMock from '@/components/landing/DesktopMock'
import { type LandingDevice } from '@/components/landing/DeviceSwitch'
import LandingAura, { LandingMark } from '@/components/landing/LandingAura'

function SignupLink({
  position,
  className,
  children
}: {
  position: string
  className: string
  children: React.ReactNode
}) {
  return (
    <Link href="/register" className={className} onClick={() => track('cta_signup_click', { position })}>
      {children}
    </Link>
  )
}

export default function LandingPage() {
  const { t } = useLocale()
  const router = useRouter()
  const [device, setDevice] = useState<LandingDevice>('desktop')

  // The product preview follows the visitor's screen: phone mockup on phones, desktop otherwise.
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const apply = () => setDevice(query.matches ? 'mobile' : 'desktop')
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('preview')) return
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/dashboard')
    })
  }, [router])

  return (
    <div className="landing">
      <LandingAura />

      <header className="landing-header">
        <div className="landing-shell">
          <BrandLockup href="/" />
          <div className="landing-header-actions">
            <Link href="/login" className="landing-text-link">
              {t('landing.signIn')}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero landing-shell" data-preview={device}>
          <div className="landing-hero-copy">
            <h1 className="landing-h1">
              {t('landing.hero1')}
              <span className="landing-h1-accent">{t('landing.hero2')}</span>
            </h1>
            <p className="landing-lead">{t('landing.lead')}</p>
            <div className="landing-hero-cta">
              <SignupLink position="hero" className="landing-btn landing-btn-accent">
                {t('landing.tryNow')}
              </SignupLink>
              <p className="landing-fine">{t('landing.noCard')}</p>
            </div>
          </div>

          <div className="landing-hero-visual">
            {device === 'desktop' ? (
              <div className="landing-desk-wrap">
                <DesktopMock />
              </div>
            ) : (
              <div className="landing-phone-wrap">
                <PhoneMock />
                <aside className="landing-float">
                  <span className="landing-float-check" aria-hidden="true">✓</span>
                  <p>
                    {t('landing.float.line1')}{' '}
                    <span>{t('landing.float.line2')}</span>
                  </p>
                </aside>
              </div>
            )}
          </div>
        </section>

        <section className="landing-promises landing-shell">
          <article>
            <LandingMark className="landing-mark" />
            <h2>{t('landing.p1t')}</h2>
            <p>{t('landing.p1d')}</p>
          </article>
          <article>
            <LandingMark className="landing-mark" />
            <h2>{t('landing.p2t')}</h2>
            <p>{t('landing.p2d')}</p>
          </article>
          <article>
            <LandingMark className="landing-mark" />
            <h2>{t('landing.p3t')}</h2>
            <p>{t('landing.p3d')}</p>
          </article>
        </section>

        <p className="landing-note landing-shell">{t('landing.bankNote')}</p>

        <section className="landing-band landing-shell">
          <div className="landing-band-glow" aria-hidden="true" />
          <h2>{t('landing.ctaTitle')}</h2>
          <SignupLink position="footer" className="landing-btn landing-btn-light">
            {t('landing.tryNow')}
          </SignupLink>
          <p>{t('landing.ctaFine')}</p>
        </section>
      </main>

      <footer className="landing-footer landing-shell">
        <p>
          © 2026 {legalCompany.name} · CUI {legalCompany.cui}
        </p>
        <nav aria-label={t('landing.legal')}>
          <Link href="/gdpr">{t('landing.privacy')}</Link>
          <Link href="/termeni">{t('landing.terms')}</Link>
          <Link href="/contact">{t('landing.contact')}</Link>
        </nav>
        <LocaleSwitch />
      </footer>
    </div>
  )
}
