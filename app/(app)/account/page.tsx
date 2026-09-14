'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import Link from 'next/link'

export default function AccountPage() {
  const router = useRouter()
  const { userId, userEmail, loading } = useCompany()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
    })
  }, [router])

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) { setError('Parolele nu coincid'); return }
    if (password.length < 6) { setError('Parola trebuie să aibă minim 6 caractere'); return }
    setBusy('password')
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy('')
    if (error) setError(error.message)
    else { setMsg('Parola a fost actualizată.'); setPassword(''); setConfirmPassword('') }
  }

  const exportData = async () => {
    setBusy('export')
    const [companies, clients, invoices, items, payments] = await Promise.all([
      supabase.from('companies').select('*').eq('user_id', userId),
      supabase.from('clients').select('*').eq('user_id', userId),
      supabase.from('invoices').select('*').eq('user_id', userId),
      supabase.from('invoice_items').select('*'),
      supabase.from('invoice_payments').select('*').eq('user_id', userId)
    ])
    const invoiceIds = new Set((invoices.data || []).map((row: { id: string }) => row.id))
    const payload = {
      exported_at: new Date().toISOString(),
      email: userEmail,
      companies: companies.data || [],
      clients: clients.data || [],
      invoices: invoices.data || [],
      invoice_items: (items.data || []).filter((row: { invoice_id: string }) => invoiceIds.has(row.invoice_id)),
      invoice_payments: payments.data || []
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `facturo-export-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(href)
    setBusy('')
  }

  const deleteAccount = async () => {
    if (!confirm('Ștergi contul și datele din aplicație? Exportă mai întâi facturile emise — păstrarea lor 10 ani este obligația ta legală. Acțiunea este ireversibilă.')) return
    if (!confirm('Confirmi ștergerea definitivă?')) return
    setBusy('delete')
    const invoiceIds = (await supabase.from('invoices').select('id').eq('user_id', userId)).data || []
    for (const row of invoiceIds) {
      await supabase.from('invoice_items').delete().eq('invoice_id', row.id)
      await supabase.from('invoice_payments').delete().eq('invoice_id', row.id)
    }
    await supabase.from('invoices').delete().eq('user_id', userId)
    await supabase.from('clients').delete().eq('user_id', userId)
    await supabase.from('companies').delete().eq('user_id', userId)
    await supabase.from('profiles').delete().eq('id', userId)
    await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    })
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return <div className="app-shell flex items-center justify-center"><p className="text-[color:var(--color-muted-foreground)]">Se încarcă...</p></div>
  }

  return (
    <div className="app-shell">
      <AppNav active="account" />
      <div className="max-w-2xl mx-auto px-8 py-8">
        <h2 className="text-3xl mb-2">Cont</h2>
        <p className="text-[color:var(--color-muted-foreground)] mb-8">{userEmail}</p>

        <div className="card p-8 mb-6">
          <h3 className="font-bold mb-4">Parolă</h3>
          <form onSubmit={changePassword} className="space-y-4">
            <input type="password" className="input" placeholder="Parolă nouă" value={password} onChange={e => setPassword(e.target.value)} />
            <input type="password" className="input" placeholder="Confirmă parola" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            {error && <p className="text-sm text-red-500">{error}</p>}
            {msg && <p className="text-sm text-green-700">{msg}</p>}
            <button type="submit" disabled={busy === 'password'} className="btn btn-primary disabled:opacity-50">
              {busy === 'password' ? 'Se salvează...' : 'Actualizează parola'}
            </button>
          </form>
        </div>

        <div className="card p-8 mb-6">
          <h3 className="font-bold mb-2">Export date</h3>
          <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">
            Descarci firmele, clienții, facturile și încasările în JSON.
          </p>
          <button onClick={exportData} disabled={busy === 'export'} className="btn btn-outline disabled:opacity-50">
            {busy === 'export' ? 'Se exportă...' : 'Descarcă exportul'}
          </button>
        </div>

        <div className="card p-8">
          <h3 className="font-bold mb-2">Ștergere cont</h3>
          <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">
            Șterge datele din aplicație și accesul la cont. Facturile emise trebuie arhivate de tine, conform legislației contabile (10 ani).
            Citește <Link href="/gdpr" className="underline">politica de confidențialitate</Link>.
          </p>
          <button onClick={deleteAccount} disabled={busy === 'delete'} className="text-sm text-red-600 border border-red-100 px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-50">
            {busy === 'delete' ? 'Se șterge...' : 'Șterge contul'}
          </button>
        </div>
      </div>
    </div>
  )
}
