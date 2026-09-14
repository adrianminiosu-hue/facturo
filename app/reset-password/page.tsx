'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BrandLockup from '@/components/BrandLockup'

export default function ResetPassword() {
  const router = useRouter()
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
    if (password !== confirm) { setError('Parolele nu coincid'); return }
    if (password.length < 6) { setError('Parola trebuie să aibă minim 6 caractere'); return }
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
      </nav>
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="card p-10 w-full max-w-md">
          <p className="kicker mb-4">Cont</p>
          <h1 className="text-4xl text-[color:var(--color-foreground)] mb-2">Parolă nouă.</h1>
          {!ready ? (
            <p className="text-sm text-[color:var(--color-muted-foreground)]">
              Deschide linkul din email pentru a seta o parolă nouă.{' '}
              <Link href="/forgot-password" className="underline">Cere un link nou</Link>
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 mt-6">
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Parolă nouă</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Confirmă parola</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="input" required />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn btn-primary w-full disabled:opacity-50">
                {loading ? 'Se salvează...' : 'Salvează parola'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
