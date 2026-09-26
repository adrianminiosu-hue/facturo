'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BrandLockup from '@/components/BrandLockup'
import LocaleSwitch from '@/components/LocaleSwitch'
import { useLocale } from '@/components/LocaleProvider'

export default function Login() {
  const router = useRouter()
  const { t } = useLocale()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(t('auth.invalidCredentials'))
      setLoading(false)
    } else {
      const next = new URLSearchParams(window.location.search).get('next')
      router.push(next && next.startsWith('/') ? next : '/dashboard')
    }
  }

  return (
    <div className="app-shell flex flex-col">
      <nav className="top-nav">
        <BrandLockup href="/" />
        <LocaleSwitch />
      </nav>
      <div className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="card p-10 w-full max-w-md">
        <p className="kicker mb-4">{t('auth.kicker')}</p>
        <div className="mb-8">
          <h1 className="page-title text-[color:var(--color-foreground)]">{t('auth.welcome')}</h1>
          <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">{t('auth.loginSubtitle')}</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('common.email')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input"
              placeholder="email@companie.ro"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('common.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('auth.login')}
          </button>
        </form>
        <p className="text-center text-sm mt-6 text-[color:var(--color-muted-foreground)]">
          {t('auth.noAccount')}{' '}
          <Link href="/register" className="font-medium hover:underline text-[color:var(--color-foreground)]">
            {t('auth.register')}
          </Link>
        </p>
        <p className="text-center text-sm mt-3">
          <Link href="/forgot-password" className="text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] transition">
            {t('auth.forgotPassword')}
          </Link>
        </p>
        <p className="text-center text-sm mt-3">
          <Link href="/" className="text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] transition">
            {t('auth.backHome')}
          </Link>
        </p>
      </div>
      </div>
    </div>
  )
}