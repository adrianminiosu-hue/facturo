'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BrandLockup from '@/components/BrandLockup'

export default function Register() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Parolele nu coincid')
      return
    }
    if (password.length < 6) {
      setError('Parola trebuie să aibă minim 6 caractere')
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/onboarding')
    }
  }

  return (
    <div className="app-shell flex flex-col">
      <nav className="top-nav">
        <BrandLockup href="/" />
      </nav>
      <div className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="card p-10 w-full max-w-md">
        <p className="kicker mb-4">Cont nou</p>
        <div className="mb-8">
          <h1 className="text-4xl text-[color:var(--color-foreground)]">Cont nou.</h1>
          <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">Un spațiu pentru toate firmele pe care le administrezi.</p>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Email</label>
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
            <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Parolă</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              placeholder="minim 6 caractere"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Confirmă parola</label>
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
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Se creează contul...' : 'Creează cont gratuit'}
          </button>
        </form>
        <p className="text-center text-sm mt-6 text-[color:var(--color-muted-foreground)]">
          Ai deja cont?{' '}
          <Link href="/login" className="font-medium hover:underline text-[color:var(--color-foreground)]">
            Autentifică-te
          </Link>
        </p>
      </div>
      </div>
    </div>
  )
}