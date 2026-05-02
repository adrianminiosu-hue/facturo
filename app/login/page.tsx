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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Bună ziua!</h1>
          <p className="text-gray-500 mt-1">Autentifică-te în contul tău Facturo</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="email@companie.ro"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parolă</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-3 rounded-xl font-medium hover:bg-gray-800 transition disabled:opacity-50"
          >
            {loading ? 'Se încarcă...' : 'Autentificare'}
          </button>
        </form>
        <p className="text-center text-gray-500 text-sm mt-6">
          Nu ai cont?{' '}
          <Link href="/register" className="text-black font-medium hover:underline">
            Înregistrează-te
          </Link>
        </p>
      </div>
    </div>
  )
}