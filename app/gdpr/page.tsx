'use client'
import Link from 'next/link'
import BrandLockup from '@/components/BrandLockup'
import LocaleSwitch from '@/components/LocaleSwitch'
import { useLocale } from '@/components/LocaleProvider'
import { BRAND } from '@/lib/brand'

export default function GDPR() {
  const { t } = useLocale()

  return (
    <div className="min-h-screen app-shell">
      <nav className="top-nav">
        <BrandLockup href="/" />
        <div className="flex items-center gap-3">
          <LocaleSwitch />
          <Link href="/login" className="nav-link">
            {t('gdpr.login')}
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-4xl text-[color:var(--color-foreground)]">{t('gdpr.title')}</h1>
          <p className="text-gray-500 mt-2">{t('gdpr.updated')}</p>
        </div>

        <div className="space-y-8 text-gray-700">

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('gdpr.s1')}</h2>
            <p className="text-sm leading-relaxed">
              {t('gdpr.s1p')}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('gdpr.s2')}</h2>
            <div className="space-y-3 text-sm leading-relaxed">
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-black mt-1.5 flex-shrink-0"></span>
                <div>
                  <p className="font-medium text-gray-900">{t('gdpr.d1t')}</p>
                  <p className="text-gray-500">{t('gdpr.d1d')}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-black mt-1.5 flex-shrink-0"></span>
                <div>
                  <p className="font-medium text-gray-900">{t('gdpr.d2t')}</p>
                  <p className="text-gray-500">{t('gdpr.d2d')}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-black mt-1.5 flex-shrink-0"></span>
                <div>
                  <p className="font-medium text-gray-900">{t('gdpr.d3t')}</p>
                  <p className="text-gray-500">{t('gdpr.d3d')}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-black mt-1.5 flex-shrink-0"></span>
                <div>
                  <p className="font-medium text-gray-900">{t('gdpr.d4t')}</p>
                  <p className="text-gray-500">{t('gdpr.d4d')}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-black mt-1.5 flex-shrink-0"></span>
                <div>
                  <p className="font-medium text-gray-900">{t('gdpr.d5t')}</p>
                  <p className="text-gray-500">{t('gdpr.d5d')}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('gdpr.s3')}</h2>
            <div className="space-y-2 text-sm leading-relaxed">
              <p>✓ {t('gdpr.u1')}</p>
              <p>✓ {t('gdpr.u2')}</p>
              <p>✓ {t('gdpr.u3')}</p>
              <p>✓ {t('gdpr.u4')}</p>
              <p className="text-red-500">✗ {t('gdpr.n1')}</p>
              <p className="text-red-500">✗ {t('gdpr.n2')}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('gdpr.s4')}</h2>
            <div className="space-y-3 text-sm leading-relaxed">
              <p><span className="font-medium">{t('gdpr.l1t')}</span> — {t('gdpr.l1d')}</p>
              <p><span className="font-medium">{t('gdpr.l2t')}</span> — {t('gdpr.l2d')}</p>
              <p><span className="font-medium">{t('gdpr.l3t')}</span> — {t('gdpr.l3d')}</p>
              <p><span className="font-medium">{t('gdpr.l4t')}</span> — {t('gdpr.l4d')}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('gdpr.s5')}</h2>
            <div className="space-y-3 text-sm leading-relaxed">
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="font-medium text-gray-900">{t('gdpr.p1t')}</p>
                  <p className="text-gray-500 text-xs mt-1">{t('gdpr.p1d')}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="font-medium text-gray-900">{t('gdpr.p2t')}</p>
                  <p className="text-gray-500 text-xs mt-1">{t('gdpr.p2d')}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="font-medium text-gray-900">{t('gdpr.p3t')}</p>
                  <p className="text-gray-500 text-xs mt-1">{t('gdpr.p3d')}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="font-medium text-gray-900">{t('gdpr.p4t')}</p>
                  <p className="text-gray-500 text-xs mt-1">{t('gdpr.p4d')}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('gdpr.s6')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium text-gray-900">{t('gdpr.r1t')}</p>
                <p className="text-gray-500 text-xs mt-1">{t('gdpr.r1d')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium text-gray-900">{t('gdpr.r2t')}</p>
                <p className="text-gray-500 text-xs mt-1">{t('gdpr.r2d')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium text-gray-900">{t('gdpr.r3t')}</p>
                <p className="text-gray-500 text-xs mt-1">{t('gdpr.r3d')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium text-gray-900">{t('gdpr.r4t')}</p>
                <p className="text-gray-500 text-xs mt-1">{t('gdpr.r4d')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium text-gray-900">{t('gdpr.r5t')}</p>
                <p className="text-gray-500 text-xs mt-1">{t('gdpr.r5d')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium text-gray-900">{t('gdpr.r6t')}</p>
                <p className="text-gray-500 text-xs mt-1">{t('gdpr.r6d')}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('gdpr.s7')}</h2>
            <div className="space-y-2 text-sm leading-relaxed">
              <p>✓ {t('gdpr.sec1')}</p>
              <p>✓ {t('gdpr.sec2')}</p>
              <p>✓ {t('gdpr.sec3')}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('gdpr.s8')}</h2>
            <div className="space-y-2 text-sm leading-relaxed">
              <p><span className="font-medium">{t('gdpr.ret1t')}</span> {t('gdpr.ret1d')}</p>
              <p><span className="font-medium">{t('gdpr.ret2t')}</span> {t('gdpr.ret2d')}</p>
              <p><span className="font-medium">{t('gdpr.ret3t')}</span> {t('gdpr.ret3d')}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('gdpr.s9')}</h2>
            <p className="text-sm leading-relaxed">
              {t('gdpr.contact')}
            </p>
            <div className="mt-3 bg-gray-50 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-900">{BRAND.name}</p>
              <p className="text-sm text-gray-500">{t('gdpr.contactNote')}</p>
            </div>
          </div>

        </div>

        <div className="mt-10 text-center">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition">
            {t('gdpr.back')}
          </Link>
        </div>
      </div>

      <footer className="bg-white border-t border-gray-100 px-6 py-6 mt-12">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <p className="text-sm text-gray-500">{t('gdpr.footer')}</p>
          <Link href="/gdpr" className="text-sm text-gray-500 hover:text-gray-900 transition">
            {t('gdpr.title')}
          </Link>
        </div>
      </footer>
    </div>
  )
}
