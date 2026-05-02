'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Login() {
  const router = useRouter()
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
      setError('Email sau parolă incorectă')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="app-shell flex items-center justify-center">
      <div className="card p-8 w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[color:var(--color-foreground)]">Bună ziua!</h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">Autentifică-te în contul tău Facturo</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
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
            {loading ? 'Se încarcă...' : 'Autentificare'}
          </button>
        </form>
        <p className="text-center text-sm mt-6 text-[color:var(--color-muted-foreground)]">
          Nu ai cont?{' '}
          <Link href="/register" className="font-medium hover:underline text-[color:var(--color-foreground)]">
            Înregistrează-te
          </Link>
        </p>
      </div>
    </div>
  )
}