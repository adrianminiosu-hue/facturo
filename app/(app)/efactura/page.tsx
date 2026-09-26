'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { supabase } from '@/lib/supabase'
import {
  disconnectEfactura,
  startEfacturaConnect,
  loadEfacturaConnection,
  type EfacturaConnection
} from '@/lib/invoiceClient'
import { useLocale } from '@/components/LocaleProvider'
import EfacturaStatsCard from '@/components/EfacturaStatsCard'

function formatExpiry(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ro-RO')
}

export default function EfacturaSettingsPage() {
  const router = useRouter()
  const { t } = useLocale()
  const { userId, ownerUserId, isOwner, company, loading: companyLoading } = useCompany()
  const [connection, setConnection] = useState<EfacturaConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const data = await loadEfacturaConnection(userId, ownerUserId || userId)
      setConnection(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('set.readFail'))
    }
    setLoading(false)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') setMessage(t('set.connectedMsg'))
    if (params.get('error')) setError(params.get('error') || '')
  }, [])

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await load()
    }
    init()
  }, [userId, ownerUserId, companyLoading])

  const connect = async () => {
    setError('')
    try {
      await startEfacturaConnect(ownerUserId || userId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const disconnect = async () => {
    if (!confirm(t('set.connectConfirm'))) return
    setBusy(true)
    setError('')
    try {
      await disconnectEfactura(userId, ownerUserId || userId)
      setMessage(t('set.disconnectedMsg'))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('set.disconnectFail'))
    }
    setBusy(false)
  }

  if (loading || companyLoading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppNav active="efactura" />
      <div className="max-w-3xl mx-auto px-8 py-8">
        <h2 className="text-3xl text-[color:var(--color-foreground)]">{t('set.efacturaTitle')}</h2>
        <p className="mt-1 text-[color:var(--color-muted-foreground)] mb-8">
          {t('set.efacturaLead')}
        </p>

        {message && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2 mb-4">{message}</p>
        )}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">{error}</p>
        )}

        <div className="card p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h3 className="font-bold text-[color:var(--color-foreground)]">{t('set.anafConnection')}</h3>
              <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
                {connection?.connected ? t('set.connectedHint') : t('set.disconnectedHint')}
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-lg font-medium ${connection?.connected ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-600'}`}>
              {connection?.connected ? t('set.connected') : t('set.disconnected')}
            </span>
          </div>

          {connection?.missingTable && (
            <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">
              {t('set.missingTable')}
            </p>
          )}

          {!connection?.configured && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
              {t('set.envMissing')}
            </p>
          )}

          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6">
            <div>
              <dt className="text-[color:var(--color-muted-foreground)]">{t('set.environment')}</dt>
              <dd className="font-medium">{connection?.environment || 'test'}</dd>
            </div>
            <div>
              <dt className="text-[color:var(--color-muted-foreground)]">{t('set.expires')}</dt>
              <dd className="font-medium">{formatExpiry(connection?.expiresAt)}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-[color:var(--color-muted-foreground)]">{t('set.certSerial')}</dt>
              <dd className="font-mono text-xs break-all">{connection?.certSerial || '—'}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={connect}
              disabled={!connection?.configured || busy}
              className="btn btn-primary disabled:opacity-50"
            >
              {connection?.connected ? t('set.reconnect') : t('set.connect')}
            </button>
            {connection?.connected && isOwner && (
              <button type="button" onClick={disconnect} disabled={busy} className="btn btn-outline disabled:opacity-50">
                {t('set.disconnect')}
              </button>
            )}
          </div>

          <ol className="mt-6 text-sm text-[color:var(--color-muted-foreground)] space-y-1 list-decimal pl-5">
            <li>{t('set.step1')}</li>
            <li>{t('set.step2')}</li>
            <li>{t('set.step3')}</li>
            <li>{t('set.step4')}</li>
          </ol>
        </div>

        <EfacturaStatsCard companyId={company?.id} />
      </div>
    </div>
  )
}
