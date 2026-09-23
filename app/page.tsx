'use client'
import Link from 'next/link'
import BrandLockup from '@/components/BrandLockup'
import LocaleSwitch from '@/components/LocaleSwitch'
import { useLocale } from '@/components/LocaleProvider'

export default function Home() {
  const { t } = useLocale()
  const features = [
    { n: '01', title: t('landing.f1t'), text: t('landing.f1d') },
    { n: '02', title: t('landing.f2t'), text: t('landing.f2d') },
    { n: '03', title: t('landing.f3t'), text: t('landing.f3d') },
    { n: '04', title: t('landing.f4t'), text: t('landing.f4d') },
    { n: '05', title: t('landing.f5t'), text: t('landing.f5d') },
    { n: '06', title: t('landing.f6t'), text: t('landing.f6d') }
  ]

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <BrandLockup href="/" />
        <div className="flex items-center gap-5">
          <LocaleSwitch />
          <Link href="/login" className="nav-link">{t('auth.login')}</Link>
          <Link href="/register" className="btn btn-primary">
            {t('auth.tryFree')}
          </Link>
        </div>
      </nav>

      <section className="pt-24 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="kicker mb-7">{t('landing.kicker')}</p>
          <h1 className="text-5xl md:text-[4.35rem] leading-[1.04] text-[color:var(--color-foreground)] mb-5">
            {t('landing.hero1')}
            <span className="block italic text-[color:var(--color-accent)]">{t('landing.hero2')}</span>
          </h1>
          <p className="text-lg md:text-xl text-[color:var(--color-muted-foreground)] max-w-xl mx-auto mb-10 leading-relaxed text-pretty">
            {t('landing.lead')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register" className="btn btn-primary px-8 py-3.5 text-base">
              {t('auth.startFree')}
            </Link>
            <Link href="/login" className="btn btn-outline px-8 py-3.5 text-base">
              {t('auth.hasAccount')}
            </Link>
          </div>
          <p className="text-sm text-[color:var(--color-muted-foreground)] mt-5">
            {t('landing.noCard')}
          </p>
        </div>
      </section>

      <section className="px-6 pb-8">
        <div className="max-w-4xl mx-auto card px-8 py-8 grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="brand text-4xl text-[color:var(--color-foreground)]">2 min</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-2">{t('landing.statInvoice')}</p>
          </div>
          <div className="border-x border-[color:var(--color-border)]">
            <p className="brand text-4xl text-[color:var(--color-foreground)]">ANAF</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-2">{t('landing.statAnaf')}</p>
          </div>
          <div>
            <p className="brand text-4xl text-[color:var(--color-foreground)]">0.00 RON</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-2">{t('landing.statStart')}</p>
          </div>
        </div>
      </section>

      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="kicker mb-4">{t('landing.platform')}</p>
            <h2 className="text-4xl text-[color:var(--color-foreground)]">{t('landing.platformTitle')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {features.map(f => (
              <div key={f.n} className="card p-7">
                <p className="kicker mb-5">{f.n}</p>
                <h3 className="text-xl brand mb-3">{f.title}</h3>
                <p className="text-sm text-[color:var(--color-muted-foreground)] leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="kicker mb-4">{t('landing.method')}</p>
            <h2 className="text-4xl text-[color:var(--color-foreground)]">{t('landing.methodTitle')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              ['01', t('landing.s1t'), t('landing.s1d')],
              ['02', t('landing.s2t'), t('landing.s2d')],
              ['03', t('landing.s3t'), t('landing.s3d')],
              ['04', t('landing.s4t'), t('landing.s4d')]
            ].map(([n, title, d]) => (
              <div key={n}>
                <p className="kicker mb-3">{n}</p>
                <h3 className="brand text-2xl mb-2">{title}</h3>
                <p className="text-sm text-[color:var(--color-muted-foreground)]">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto card p-12 text-center bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] border-0">
          <h2 className="text-4xl mb-4 text-[color:var(--color-primary-foreground)]">{t('landing.footerLead')}</h2>
          <p className="text-[color:var(--color-primary-foreground)]/70 mb-8">
            {t('landing.footerSub')}
          </p>
          <Link href="/register" className="btn bg-[color:var(--color-accent)] text-white hover:opacity-90 px-8 py-3.5 text-base">
            {t('landing.createAccount')}
          </Link>
        </div>
      </section>

      <footer className="px-6 py-10 border-t border-[color:var(--color-border)]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BrandLockup href="/" size="sm" />
            <span className="text-sm text-[color:var(--color-muted-foreground)]">{t('landing.forRomania')}</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[color:var(--color-muted-foreground)]">
            <Link href="/gdpr" className="hover:text-[color:var(--color-foreground)] transition">{t('landing.privacy')}</Link>
            <span>© 2026</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
