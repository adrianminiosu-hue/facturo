'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BrandLockup from '@/components/BrandLockup'
import LocaleSwitch from '@/components/LocaleSwitch'
import { useLocale } from '@/components/LocaleProvider'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/landingTrack'
import { legalCompany } from '@/config/company'
import { BRAND } from '@/lib/brand'
import './landing.css'

/**
 * Landing page. The story: an invoice is not finished when it is issued. Between the invoice and the
 * money there are four moments (ANAF, the client, the bank, what comes next); Veyro watches each one.
 */

function SignupLink({ position, className, children }: { position: string; className: string; children: React.ReactNode }) {
  return (
    <Link href="/register" className={className} onClick={() => track('cta_signup_click', { position })}>
      {children}
    </Link>
  )
}

type Tone = 'done' | 'warn' | 'good'

/** One invoice, followed from issue to money in the bank: the headline, shown. */
function InvoiceJourney() {
  const { t } = useLocale()
  const steps: Array<{ key: string; tone: Tone }> = [
    { key: 'client', tone: 'done' },
    { key: 'issued', tone: 'done' },
    { key: 'anaf', tone: 'done' },
    { key: 'due', tone: 'warn' },
    { key: 'paid', tone: 'good' }
  ]
  return (
    <div className="lp-journey" role="img" aria-label={t('lp.journey.aria')}>
      <div className="lp-journey-head">
        <div>
          <p className="lp-journey-ref">FCT0032</p>
          <p className="lp-journey-client">Siemens S.R.L.</p>
        </div>
        <p className="lp-journey-amount">61.710,00 <span>lei</span></p>
      </div>
      <ol className="lp-journey-steps">
        {steps.map((step, index) => (
          <li key={step.key} className="lp-step" data-tone={step.tone} style={{ '--i': index } as React.CSSProperties}>
            <span className="lp-step-dot" aria-hidden="true" />
            <div className="lp-step-body">
              <p className="lp-step-title">
                {t(`lp.journey.${step.key}.title`)}
                <span className="lp-step-date">{t(`lp.journey.${step.key}.date`)}</span>
              </p>
              <p className="lp-step-detail">{t(`lp.journey.${step.key}.detail`)}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="lp-journey-done" style={{ '--i': steps.length } as React.CSSProperties}>
        <span aria-hidden="true">✓</span> {t('lp.journey.closed')}
      </p>
    </div>
  )
}

/** A Monday morning in the app: what changed since Friday and what comes up. */
function WeekFeed() {
  const { t } = useLocale()
  const rows: Array<{ day?: string; tone: 'good' | 'bad' | 'warn' | 'neutral'; key: string; amount?: string; action?: string }> = [
    { day: 'lp.week.today', tone: 'good', key: 'lp.week.paid', amount: '45.210,00' },
    { tone: 'warn', key: 'lp.week.suppliers', amount: '2.100,00', action: 'lp.week.pay' },
    { tone: 'bad', key: 'lp.week.rejected', action: 'lp.week.fix' },
    { day: 'lp.week.friday', tone: 'neutral', key: 'lp.week.reminder' },
    { tone: 'neutral', key: 'lp.week.received', amount: '5.320,00' }
  ]
  return (
    <div className="lp-feed" aria-label={t('lp.week.aria')}>
      <div className="lp-feed-top">
        <span className="lp-feed-title">{t('lp.week.feedTitle')}</span>
        <span className="lp-feed-badge">{t('lp.week.new')}</span>
      </div>
      <ul>
        {rows.map(row => (
          <li key={row.key} className="lp-feed-row">
            {row.day && <p className="lp-feed-day">{t(row.day)}</p>}
            <div className="lp-feed-line">
              <span className="lp-feed-dot" data-tone={row.tone} aria-hidden="true" />
              <p className="lp-feed-text">{t(row.key)}</p>
              {row.amount && <p className="lp-feed-amount">{row.amount} <span>lei</span></p>}
              {row.action && <span className="lp-feed-action">{t(row.action)}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function LandingPage() {
  const { t } = useLocale()
  const router = useRouter()

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('preview')) return
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/dashboard')
    })
  }, [router])

  const loop = ['anaf', 'client', 'bank', 'next'] as const
  const questions = ['q1', 'q2', 'q3', 'q4'] as const
  const fit = ['fit1', 'fit2', 'fit3', 'fit4'] as const
  const included = ['inc0', 'inc1', 'inc2', 'inc3', 'inc4', 'inc5'] as const

  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-shell lp-header-row">
          <BrandLockup href="/" />
          <nav className="lp-nav" aria-label={t('lp.nav.aria')}>
            <a href="#cum-functioneaza">{t('lp.nav.how')}</a>
            <a href="#pentru-cine">{t('lp.nav.who')}</a>
          </nav>
          <div className="lp-header-actions">
            <Link href="/login" className="lp-link">{t('landing.signIn')}</Link>
            <SignupLink position="header" className="lp-btn lp-btn-small">{t('lp.cta')}</SignupLink>
          </div>
        </div>
      </header>

      <main>
        {/* 1. Headline, shown on one invoice */}
        <section className="lp-hero lp-shell">
          <div className="lp-hero-copy">
            <p className="lp-kicker">{t('lp.hero.kicker')}</p>
            <h1 className="lp-h1">{t('lp.hero.title')}</h1>
            <p className="lp-lead">{t('lp.hero.lead')}</p>
            <div className="lp-hero-cta">
              <SignupLink position="hero" className="lp-btn">{t('lp.cta')}</SignupLink>
              <p className="lp-fine">{t('lp.fine')}</p>
            </div>
          </div>
          <div className="lp-hero-visual">
            <InvoiceJourney />
          </div>
        </section>

        {/* 2. The owner's questions */}
        <section className="lp-section lp-shell">
          <h2 className="lp-h2 lp-center">{t('lp.q.title')}</h2>
          <div className="lp-questions">
            {questions.map(key => (
              <p key={key} className="lp-question">{t(`lp.q.${key}`)}</p>
            ))}
          </div>
          <p className="lp-answer">{t('lp.q.answer')}</p>
        </section>

        {/* 3. The loop: four moments between the invoice and the money */}
        <section id="cum-functioneaza" className="lp-section lp-shell">
          <p className="lp-kicker lp-center">{t('lp.loop.kicker')}</p>
          <h2 className="lp-h2 lp-center">{t('lp.loop.title')}</h2>
          <ol className="lp-loop">
            {loop.map((key, index) => (
              <li key={key} className="lp-loop-step">
                <span className="lp-loop-num" aria-hidden="true">{index + 1}</span>
                <p className="lp-loop-where">{t(`lp.loop.${key}.where`)}</p>
                <h3 className="lp-h3">{t(`lp.loop.${key}.title`)}</h3>
                <p className="lp-body">{t(`lp.loop.${key}.text`)}</p>
                <p className="lp-chip" data-tone={key === 'anaf' ? 'bad' : key === 'bank' ? 'good' : 'neutral'}>{t(`lp.loop.${key}.chip`)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 4. A week with the app */}
        <section className="lp-section lp-shell lp-week">
          <div className="lp-week-copy">
            <p className="lp-kicker">{t('lp.week.kicker')}</p>
            <h2 className="lp-h2">{t('lp.week.title')}</h2>
            <p className="lp-body lp-body-lg">{t('lp.week.text')}</p>
          </div>
          <WeekFeed />
        </section>

        {/* 5. Who it is for, and what stays with the accountant */}
        <section id="pentru-cine" className="lp-section lp-shell">
          <h2 className="lp-h2 lp-center">{t('lp.who.title')}</h2>
          <div className="lp-who">
            <div className="lp-card">
              <h3 className="lp-h3">{t('lp.who.fitTitle')}</h3>
              <ul className="lp-list">
                {fit.map(key => <li key={key}>{t(`lp.who.${key}`)}</li>)}
              </ul>
            </div>
            <div className="lp-card">
              <h3 className="lp-h3">{t('lp.who.accTitle')}</h3>
              <p className="lp-body">{t('lp.who.accText')}</p>
              <h3 className="lp-h3 lp-mt">{t('lp.who.notTitle')}</h3>
              <p className="lp-body">{t('lp.who.notText')}</p>
            </div>
          </div>
        </section>

        {/* 6. What is included */}
        <section className="lp-section lp-shell">
          <h2 className="lp-h2 lp-center">{t('lp.inc.title')}</h2>
          <ul className="lp-included">
            {included.map(key => (
              <li key={key}>
                <p className="lp-inc-title">{t(`lp.inc.${key}.title`)}</p>
                <p className="lp-inc-text">{t(`lp.inc.${key}.text`)}</p>
              </li>
            ))}
          </ul>
          <p className="lp-inc-more">{t('lp.inc.more')}</p>
        </section>

        {/* 7. Close */}
        <section className="lp-shell">
          <div className="lp-band">
            <h2 className="lp-band-title">{t('lp.band.title')}</h2>
            <SignupLink position="footer" className="lp-btn lp-btn-light">{t('lp.cta')}</SignupLink>
            <p className="lp-band-fine">{t('lp.fine')}</p>
          </div>
        </section>
      </main>

      <footer className="lp-footer lp-shell">
        <p>© 2026 {BRAND.name} · {legalCompany.name} · CUI {legalCompany.cui}</p>
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
