'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BrandLockup from '@/components/BrandLockup'
import LocaleSwitch from '@/components/LocaleSwitch'
import { useLocale } from '@/components/LocaleProvider'

export default function ResetPassword() {
  const router = useRouter()
  const { t } = useLocale()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })
    supabase.auth.getSession().then(({ data: session }) => {
      if (session.session) setReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError(t('set.passwordMismatch')); return }
    if (password.length < 6) { setError(t('set.passwordShort')); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) setError(error.message)
    else router.push('/dashboard')
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
          <h1 className="page-title text-[color:var(--color-foreground)] mb-2">{t('auth.resetTitle')}</h1>
          {!ready ? (
            <p className="text-sm text-[color:var(--color-muted-foreground)]">
              {t('auth.resetLead')}{' '}
              <Link href="/forgot-password" className="underline">{t('auth.requestNewLink')}</Link>
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 mt-6">
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('common.newPassword')}</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('common.confirmPassword')}</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="input" required />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn btn-primary w-full disabled:opacity-50">
                {loading ? t('common.saving') : t('auth.savePassword')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
