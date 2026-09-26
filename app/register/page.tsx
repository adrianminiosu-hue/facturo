'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BrandLockup from '@/components/BrandLockup'
import LocaleSwitch from '@/components/LocaleSwitch'
import { useLocale } from '@/components/LocaleProvider'

export default function Register() {
  const router = useRouter()
  const { t } = useLocale()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const preset = params.get('email')
    if (preset) setEmail(preset)
  }, [])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!consent) {
      setError(t('auth.acceptPrivacy'))
      return
    }
    if (password !== confirm) {
      setError(t('set.passwordMismatch'))
      return
    }
    if (password.length < 6) {
      setError(t('set.passwordShort'))
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      const params = new URLSearchParams(window.location.search)
      const invite = params.get('invite')
      router.push(invite ? `/invite/${invite}` : '/onboarding')
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
        <p className="kicker mb-4">{t('auth.newAccount')}</p>
        <div className="mb-8">
          <h1 className="page-title text-[color:var(--color-foreground)]">{t('auth.newAccountTitle')}</h1>
          <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">{t('auth.registerLead')}</p>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
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
              placeholder={t('common.minPassword')}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('common.confirmPassword')}</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="input"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <label className="flex items-start gap-2 text-sm text-[color:var(--color-muted-foreground)]">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              {t('auth.acceptPrefix')}{' '}
              <Link href="/gdpr" className="underline text-[color:var(--color-foreground)]">
                {t('auth.privacy')}
              </Link>
              .
            </span>
          </label>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            {loading ? t('auth.creating') : t('auth.createFree')}
          </button>
        </form>
        <p className="text-center text-sm mt-6 text-[color:var(--color-muted-foreground)]">
          {t('auth.hasAccountLogin')}{' '}
          <Link href="/login" className="font-medium hover:underline text-[color:var(--color-foreground)]">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
      </div>
    </div>
  )
}
