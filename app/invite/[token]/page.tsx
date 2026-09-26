'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import BrandLockup from '@/components/BrandLockup'
import LocaleSwitch from '@/components/LocaleSwitch'
import { useLocale } from '@/components/LocaleProvider'
import { getCurrentUser, supabase } from '@/lib/supabase'
import { authHeaders } from '@/lib/authHeaders'

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const { t } = useLocale()
  const [status, setStatus] = useState('')
  const [email, setEmail] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/team/invite/${token}`)
      const data = await res.json()
      if (!res.ok) {
        setStatus(data.error || t('auth.inviteInvalid'))
        return
      }
      setEmail(data.email)
      setOwnerName(data.ownerName)
      setReady(true)
      setStatus('')
      const { data: { user } } = await getCurrentUser()
      if (user && data.status === 'pending') {
        setBusy(true)
        const accept = await fetch('/api/team/accept', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ userId: user.id, token })
        })
        const body = await accept.json()
        setBusy(false)
        if (!accept.ok) {
          setError(body.error || t('auth.acceptFail'))
          return
        }
        router.push('/dashboard')
      }
    }
    if (token) load()
  }, [token, router, t])

  return (
    <div className="app-shell flex flex-col">
      <nav className="top-nav">
        <BrandLockup href="/" />
        <LocaleSwitch />
      </nav>
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="card p-10 w-full max-w-md">
          <p className="kicker mb-4">{t('auth.inviteKicker')}</p>
          <h1 className="page-title text-[color:var(--color-foreground)] mb-3">{t('auth.inviteTitle')}</h1>
          {!ready ? (
            <p className="text-[color:var(--color-muted-foreground)]">{status || t('common.loading')}</p>
          ) : (
            <>
              <p className="text-[color:var(--color-muted-foreground)] mb-6">
                {t('auth.inviteLead', { name: ownerName, email })}
              </p>
              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
              <div className="flex flex-col gap-3">
                <Link href={`/register?invite=${token}&email=${encodeURIComponent(email)}`} className="btn btn-primary text-center">
                  {t('auth.createAccount')}
                </Link>
                <Link href={`/login?next=/invite/${token}`} className="btn btn-outline text-center">
                  {t('auth.hasAccount')}
                </Link>
              </div>
              {busy && <p className="text-sm text-[color:var(--color-muted-foreground)] mt-4">{t('auth.accepting')}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
