'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import BrandLockup from '@/components/BrandLockup'
import LocaleSwitch from '@/components/LocaleSwitch'
import { useLocale } from '@/components/LocaleProvider'

export default function ForgotPassword() {
  const { t } = useLocale()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
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
          <h1 className="page-title text-[color:var(--color-foreground)] mb-2">{t('auth.forgotTitle')}</h1>
          <p className="text-sm text-[color:var(--color-muted-foreground)] mb-8">
            {t('auth.forgotLead')}
          </p>
          {sent ? (
            <p className="text-sm text-[color:var(--color-foreground)]">
              {t('auth.forgotSent')}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('common.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input"
                  required
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn btn-primary w-full disabled:opacity-50">
                {loading ? t('common.sending') : t('auth.sendLink')}
              </button>
            </form>
          )}
          <p className="text-center text-sm mt-6">
            <Link href="/login" className="text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]">
              {t('auth.backLogin')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
