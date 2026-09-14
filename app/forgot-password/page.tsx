'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import BrandLockup from '@/components/BrandLockup'

export default function ForgotPassword() {
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
      </nav>
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="card p-10 w-full max-w-md">
          <p className="kicker mb-4">Cont</p>
          <h1 className="text-4xl text-[color:var(--color-foreground)] mb-2">Parolă uitată.</h1>
          <p className="text-sm text-[color:var(--color-muted-foreground)] mb-8">
            Îți trimitem un link de resetare pe email.
          </p>
          {sent ? (
            <p className="text-sm text-[color:var(--color-foreground)]">
              Dacă există un cont pentru această adresă, vei primi un email în câteva minute.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Email</label>
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
                {loading ? 'Se trimite...' : 'Trimite linkul'}
              </button>
            </form>
          )}
          <p className="text-center text-sm mt-6">
            <Link href="/login" className="text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]">
              ← Înapoi la autentificare
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
