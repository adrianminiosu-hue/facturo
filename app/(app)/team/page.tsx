'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useLocale } from '@/components/LocaleProvider'
import { useCompany } from '@/components/CompanyProvider'
import { getCurrentUser, supabase } from '@/lib/supabase'
import { MAX_OPERATORS, isMissingPortfolioTableError, type PortfolioMember } from '@/lib/portfolio'
import { authHeaders } from '@/lib/authHeaders'

export default function TeamPage() {
  const router = useRouter()
  const { t } = useLocale()
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
      const { data: { user } } = await getCurrentUser()
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
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ userId, email })
    })
    const data = await res.json()
    setBusy('')
    if (!res.ok) {
      setError(data.error || t('team.inviteFail'))
      return
    }
    setEmail('')
    setMessage(data.warning || t('team.inviteOk'))
    if (data.inviteUrl && data.warning) setMessage(t('team.inviteLink', { warning: data.warning, url: data.inviteUrl }))
    await loadMembers()
  }

  const revoke = async (member: PortfolioMember) => {
    if (!confirm(t('team.confirmRevoke', { email: member.email }))) return
    setBusy(member.id)
    const res = await fetch('/api/team/revoke', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ userId, memberId: member.id })
    })
    const data = await res.json()
    setBusy('')
    if (!res.ok) {
      setError(data.error || t('team.revokeFail'))
      return
    }
    await loadMembers()
  }

  if (companyLoading) {
    return <div className="app-shell flex items-center justify-center"><p className="text-gray-500">{t('common.loading')}</p></div>
  }

  const canInvite = members.length < MAX_OPERATORS && !missingTable

  return (
    <div className="app-shell">
      <AppNav active="team" />
      <div className="max-w-3xl mx-auto px-8 py-8">
        <h2 className="page-title text-[color:var(--color-foreground)]">{t('team.title')}</h2>
        <p className="mt-1 text-[color:var(--color-muted-foreground)] mb-8">
          {t('team.lead')}
        </p>

        {missingTable && (
          <div className="card p-6 mb-6">
            <p className="font-medium">{t('team.missing')}</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
              {t('team.missingLead')}
            </p>
          </div>
        )}

        <div className="card p-6 mb-6">
          <p className="kicker mb-2">{t('team.owner')}</p>
          <p className="text-[color:var(--color-foreground)]">{userEmail || t('common.you')}</p>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">{t('team.ownerLead')}</p>
        </div>

        <div className="card p-6 mb-6">
          <h3 className="font-bold mb-4">{t('team.invite')}</h3>
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
              {busy === 'invite' ? t('common.sending') : t('team.sendInvite')}
            </button>
          </div>
          {!canInvite && !missingTable && (
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">
              {t('team.limit')}
            </p>
          )}
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          {message && <p className="text-sm text-emerald-700 mt-3">{message}</p>}
        </div>

        <div className="card overflow-hidden">
          {members.length === 0 ? (
            <p className="p-8 text-[color:var(--color-muted-foreground)]">{t('team.empty')}</p>
          ) : members.map((member, i) => (
            <div
              key={member.id}
              className={`px-6 py-4 flex items-center justify-between gap-4 ${i < members.length - 1 ? 'border-b border-gray-50' : ''}`}
            >
              <div>
                <p className="font-medium text-[color:var(--color-foreground)]">{member.email}</p>
                <p className="text-xs text-[color:var(--color-muted-foreground)] mt-0.5">
                  {member.status === 'active' ? t('team.active') : t('team.pending')}
                </p>
              </div>
              <button
                onClick={() => revoke(member)}
                disabled={busy === member.id}
                className="text-xs border border-red-100 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                {t('team.revoke')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
