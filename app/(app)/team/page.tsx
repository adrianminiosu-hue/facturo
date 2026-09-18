'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { supabase } from '@/lib/supabase'
import { MAX_OPERATORS, isMissingPortfolioTableError, type PortfolioMember } from '@/lib/portfolio'

export default function TeamPage() {
  const router = useRouter()
  const { userId, userEmail, loading: companyLoading } = useCompany()
  const [members, setMembers] = useState<PortfolioMember[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadMembers = async () => {
    const { data, error: loadError } = await supabase
      .from('portfolio_members')
      .select('*')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: true })
    if (loadError) {
      setMissingTable(isMissingPortfolioTableError(loadError))
      setMembers([])
      return
    }
    setMissingTable(false)
    setMembers((data || []) as PortfolioMember[])
  }

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await loadMembers()
    }
    init()
  }, [userId, companyLoading])

  const invite = async () => {
    setError('')
    setMessage('')
    setBusy('invite')
    const res = await fetch('/api/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, email })
    })
    const data = await res.json()
    setBusy('')
    if (!res.ok) {
      setError(data.error || 'Nu s-a putut trimite invitația.')
      return
    }
    setEmail('')
    setMessage(data.warning || 'Invitația a fost trimisă.')
    if (data.inviteUrl && data.warning) setMessage(`${data.warning} Link: ${data.inviteUrl}`)
    await loadMembers()
  }

  const revoke = async (member: PortfolioMember) => {
    if (!confirm(`Revoci accesul pentru ${member.email}?`)) return
    setBusy(member.id)
    const res = await fetch('/api/team/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, memberId: member.id })
    })
    const data = await res.json()
    setBusy('')
    if (!res.ok) {
      setError(data.error || 'Nu s-a putut revoca.')
      return
    }
    await loadMembers()
  }

  if (companyLoading) {
    return <div className="app-shell flex items-center justify-center"><p className="text-gray-500">Se încarcă...</p></div>
  }

  const canInvite = members.length < MAX_OPERATORS && !missingTable

  return (
    <div className="app-shell">
      <AppNav active="team" />
      <div className="max-w-3xl mx-auto px-8 py-8">
        <h2 className="text-3xl text-[color:var(--color-foreground)]">Echipă</h2>
        <p className="mt-1 text-[color:var(--color-muted-foreground)] mb-8">
          Un operator vede toate firmele din cabinetul tău. Nu poate șterge firmele sau contul.
        </p>

        {missingTable && (
          <div className="card p-6 mb-6">
            <p className="font-medium">Echipa nu este instalată pe baza de date.</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
              Rulează migrația <span className="font-mono">20260917_portfolio_members.sql</span> în Supabase.
            </p>
          </div>
        )}

        <div className="card p-6 mb-6">
          <p className="kicker mb-2">Titular</p>
          <p className="text-[color:var(--color-foreground)]">{userEmail || 'Tu'}</p>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">Contul care deține firmele</p>
        </div>

        <div className="card p-6 mb-6">
          <h3 className="font-bold mb-4">Invită un operator</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input flex-1"
              placeholder="email@cabinet.ro"
              disabled={!canInvite}
            />
            <button
              onClick={invite}
              disabled={!canInvite || busy === 'invite' || !email.trim()}
              className="btn btn-primary disabled:opacity-50"
            >
              {busy === 'invite' ? 'Se trimite...' : 'Trimite invitația'}
            </button>
          </div>
          {!canInvite && !missingTable && (
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">
              Limita actuală este un operator. Revocă locul existent ca să inviți pe altcineva.
            </p>
          )}
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          {message && <p className="text-sm text-emerald-700 mt-3">{message}</p>}
        </div>

        <div className="card overflow-hidden">
          {members.length === 0 ? (
            <p className="p-8 text-[color:var(--color-muted-foreground)]">Niciun operator încă.</p>
          ) : members.map((member, i) => (
            <div
              key={member.id}
              className={`px-6 py-4 flex items-center justify-between gap-4 ${i < members.length - 1 ? 'border-b border-gray-50' : ''}`}
            >
              <div>
                <p className="font-medium text-[color:var(--color-foreground)]">{member.email}</p>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">
                  Operator · {member.status === 'active' ? 'activ' : 'invitație în așteptare'}
                </p>
              </div>
              <button
                onClick={() => revoke(member)}
                disabled={busy === member.id}
                className="text-xs border border-red-100 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                Revocă
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
