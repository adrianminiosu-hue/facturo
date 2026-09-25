'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import UserAvatar from '@/components/UserAvatar'
import ThemePicker from '@/components/ThemePicker'
import { useLocale } from '@/components/LocaleProvider'
import { useCompany } from '@/components/CompanyProvider'
import Link from 'next/link'
import { authHeaders } from '@/lib/authHeaders'

async function avatarRequest(
  method: 'POST' | 'DELETE',
  file?: File,
  errors?: { session: string; photo: string }
) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error(errors?.session)
  const body = new FormData()
  if (file) body.append('file', file)
  const res = await fetch('/api/account/avatar', {
    method,
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: method === 'POST' ? body : undefined
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || errors?.photo)
  return json as { avatarUrl?: string }
}

export default function AccountPage() {
  const router = useRouter()
  const { t } = useLocale()
  const { userId, userEmail, userName, userAvatarUrl, loading, refreshCompanies } = useCompany()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [profileError, setProfileError] = useState('')
  const [photoMsg, setPhotoMsg] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [busy, setBusy] = useState('')
  const photoInput = useRef<HTMLInputElement>(null)
  const avatarErrors = { session: t('set.sessionInvalid'), photo: t('set.photoFail') }

  useEffect(() => {
    setName(userName)
  }, [userName])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
    })
  }, [router])

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy('profile')
    setProfileError('')
    setProfileMsg('')
    const { error } = await supabase.auth.updateUser({
      data: { full_name: name.trim() }
    })
    setBusy('')
    if (error) {
      setProfileError(error.message)
      return
    }
    await refreshCompanies()
    setProfileMsg(t('set.nameSaved'))
  }

  const savePhoto = async (file?: File) => {
    if (!file) return
    setBusy('photo')
    setPhotoError('')
    setPhotoMsg('')
    try {
      const json = await avatarRequest('POST', file, avatarErrors)
      await supabase.auth.updateUser({ data: { avatar_url: json.avatarUrl || '' } })
      await refreshCompanies()
      setPhotoMsg(t('set.photoSaved'))
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : t('set.photoSaveFail'))
    }
    if (photoInput.current) photoInput.current.value = ''
    setBusy('')
  }

  const removePhoto = async () => {
    setBusy('photo')
    setPhotoError('')
    setPhotoMsg('')
    try {
      await avatarRequest('DELETE', undefined, avatarErrors)
      await supabase.auth.updateUser({ data: { avatar_url: '' } })
      await refreshCompanies()
      setPhotoMsg(t('set.photoRemoved'))
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : t('set.photoDeleteFail'))
    }
    setBusy('')
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) { setError(t('set.passwordMismatch')); return }
    if (password.length < 6) { setError(t('set.passwordShort')); return }
    setBusy('password')
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy('')
    if (error) setError(error.message)
    else { setMsg(t('set.passwordUpdated')); setPassword(''); setConfirmPassword('') }
  }

  const exportData = async () => {
    setBusy('export')
    const [companies, clients, invoices, items, payments, catalog] = await Promise.all([
      supabase.from('companies').select('*').eq('user_id', userId),
      supabase.from('clients').select('*').eq('user_id', userId),
      supabase.from('invoices').select('*').eq('user_id', userId),
      supabase.from('invoice_items').select('*'),
      supabase.from('invoice_payments').select('*').eq('user_id', userId),
      supabase.from('catalog_items').select('*').eq('user_id', userId)
    ])
    const invoiceIds = new Set((invoices.data || []).map((row: { id: string }) => row.id))
    const payload = {
      exported_at: new Date().toISOString(),
      email: userEmail,
      name: userName,
      companies: companies.data || [],
      clients: clients.data || [],
      invoices: invoices.data || [],
      invoice_items: (items.data || []).filter((row: { invoice_id: string }) => invoiceIds.has(row.invoice_id)),
      invoice_payments: payments.data || [],
      catalog_items: catalog.data || []
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
    if (!confirm(t('set.confirmDeleteFull'))) return
    if (!confirm(t('set.confirmDelete'))) return
    setBusy('delete')
    try { await avatarRequest('DELETE', undefined, avatarErrors) } catch { /* continue deleting the account */ }
    const invoiceIds = (await supabase.from('invoices').select('id').eq('user_id', userId)).data || []
    await supabase.from('invoice_payments').delete().eq('user_id', userId)
    await supabase.from('catalog_items').delete().eq('user_id', userId)
    for (const row of invoiceIds) {
      await supabase.from('invoice_items').delete().eq('invoice_id', row.id)
    }
    await supabase.from('invoices').delete().eq('user_id', userId)
    await supabase.from('clients').delete().eq('user_id', userId)
    await supabase.from('companies').delete().eq('user_id', userId)
    await supabase.from('profiles').delete().eq('id', userId)
    await fetch('/api/account/delete', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ userId })
    })
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return <div className="app-shell flex items-center justify-center"><p className="text-[color:var(--color-muted-foreground)]">{t('common.loading')}</p></div>
  }

  return (
    <div className="app-shell">
      <AppNav active="account" />
      <div className="max-w-2xl mx-auto px-8 py-8">
        <h2 className="text-3xl mb-2">{t('set.account')}</h2>
        <p className="text-[color:var(--color-muted-foreground)] mb-8">{t('set.accountLead')}</p>

        <div className="card p-8 mb-6">
          <h3 className="font-bold mb-4">{t('set.personal')}</h3>
          <div className="flex items-start gap-5 mb-6">
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              className="rounded-full focus-visible:outline-none focus-visible:shadow-[0_0_0_4px_var(--ring)]"
              title={t('set.changePhoto')}
              disabled={busy === 'photo'}
            >
              <UserAvatar url={userAvatarUrl} name={name || userName} email={userEmail} size="lg" />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium mb-1">{t('set.photo')}</p>
              <p className="text-sm text-[color:var(--color-muted-foreground)] mb-3">
                {t('set.photoLead')}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => photoInput.current?.click()}
                  disabled={busy === 'photo'}
                  className="btn btn-outline disabled:opacity-50"
                >
                  {busy === 'photo' ? t('common.saving') : userAvatarUrl ? t('set.changePhoto') : t('set.uploadPhoto')}
                </button>
                {userAvatarUrl && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    disabled={busy === 'photo'}
                    className="btn btn-outline disabled:opacity-50"
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
              {photoError && <p className="text-sm text-red-500 mt-2">{photoError}</p>}
              {photoMsg && <p className="text-sm text-green-700 mt-2">{photoMsg}</p>}
              <input
                ref={photoInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={e => savePhoto(e.target.files?.[0])}
              />
            </div>
          </div>
          <form onSubmit={saveName} className="space-y-4">
            <div>
              <label className="block text-sm text-[color:var(--color-muted-foreground)] mb-1">{t('common.email')}</label>
              <input type="email" className="input bg-gray-50" value={userEmail} readOnly />
            </div>
            <div>
              <label className="block text-sm text-[color:var(--color-muted-foreground)] mb-1">{t('common.name')}</label>
              <input
                type="text"
                className="input"
                placeholder="Adrian"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            {profileError && <p className="text-sm text-red-500">{profileError}</p>}
            {profileMsg && <p className="text-sm text-green-700">{profileMsg}</p>}
            <button type="submit" disabled={busy === 'profile'} className="btn btn-primary disabled:opacity-50">
              {busy === 'profile' ? t('common.saving') : t('set.saveName')}
            </button>
          </form>
        </div>

        <div className="card p-8 mb-6">
          <h3 className="font-bold mb-2">{t('set.theme')}</h3>
          <p className="text-sm text-[color:var(--color-muted-foreground)] mb-5">
            {t('set.themeLead')}
          </p>
          <ThemePicker />
        </div>

        <div className="card p-8 mb-6">
          <h3 className="font-bold mb-4">{t('common.password')}</h3>
          <form onSubmit={changePassword} className="space-y-4">
            <input type="password" className="input" placeholder={t('common.newPassword')} value={password} onChange={e => setPassword(e.target.value)} />
            <input type="password" className="input" placeholder={t('set.confirmPassword')} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            {error && <p className="text-sm text-red-500">{error}</p>}
            {msg && <p className="text-sm text-green-700">{msg}</p>}
            <button type="submit" disabled={busy === 'password'} className="btn btn-primary disabled:opacity-50">
              {busy === 'password' ? t('common.saving') : t('set.updatePassword')}
            </button>
          </form>
        </div>

        <div className="card p-8 mb-6">
          <h3 className="font-bold mb-2">{t('set.export')}</h3>
          <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">
            {t('set.exportLead')}
          </p>
          <button onClick={exportData} disabled={busy === 'export'} className="btn btn-outline disabled:opacity-50">
            {busy === 'export' ? t('common.exporting') : t('set.downloadExport')}
          </button>
        </div>

        <div className="card p-8">
          <h3 className="font-bold mb-2">{t('set.deleteAccount')}</h3>
          <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">
            {t('set.deleteLead')}{' '}
            {t('set.readPrivacy')} <Link href="/gdpr" className="underline">{t('set.privacy')}</Link>.
          </p>
          <button onClick={deleteAccount} disabled={busy === 'delete'} className="text-sm text-red-600 border border-red-100 px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-50">
            {busy === 'delete' ? t('common.deleting') : t('set.deleteBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}
