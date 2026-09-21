'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { useCompany } from '@/components/CompanyProvider'
import { supabase } from '@/lib/supabase'
import {
  disconnectEfactura,
  efacturaConnectUrl,
  loadEfacturaConnection,
  type EfacturaConnection
} from '@/lib/invoiceClient'

function formatExpiry(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ro-RO')
}

export default function EfacturaSettingsPage() {
  const router = useRouter()
  const { userId, ownerUserId, isOwner, loading: companyLoading } = useCompany()
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
      setError(err instanceof Error ? err.message : 'Nu s-a putut citi conexiunea ANAF.')
    }
    setLoading(false)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') setMessage('e-Factura TEST este conectat.')
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

  const connect = () => {
    window.location.href = efacturaConnectUrl(userId, ownerUserId || userId)
  }

  const disconnect = async () => {
    if (!confirm('Deconectezi e-Factura TEST? Facturile nu se vor mai putea trimite până la o nouă autorizare.')) return
    setBusy(true)
    setError('')
    try {
      await disconnectEfactura(userId, ownerUserId || userId)
      setMessage('Conexiunea ANAF a fost ștearsă.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu s-a putut deconecta.')
    }
    setBusy(false)
  }

  if (loading || companyLoading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-gray-500">Se încarcă...</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppNav active="efactura" />
      <div className="max-w-3xl mx-auto px-8 py-8">
        <h2 className="text-3xl text-[color:var(--color-foreground)]">e-Factura TEST</h2>
        <p className="mt-1 text-[color:var(--color-muted-foreground)] mb-8">
          Conectează Facturo la ANAF Test cu certificatul calificat (cloud / vToken) în browser. Cheia privată nu se încarcă în aplicație.
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
              <h3 className="font-bold text-[color:var(--color-foreground)]">Conexiune ANAF</h3>
              <p className="text-sm text-[color:var(--color-muted-foreground)] mt-1">
                {connection?.connected
                  ? 'Token JWT salvat pentru profil. Operatorii folosesc aceeași conexiune.'
                  : 'După conectare, facturile emise se trimit în e-Factura TEST.'}
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-lg font-medium ${connection?.connected ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-600'}`}>
              {connection?.connected ? 'Conectat TEST' : 'Neconectat'}
            </span>
          </div>

          {connection?.missingTable && (
            <p className="text-sm text-[color:var(--color-muted-foreground)] mb-4">
              Rulează migrația <span className="font-mono">20260921_anaf_oauth.sql</span> în Supabase, apoi reîncarcă pagina.
            </p>
          )}

          {!connection?.configured && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
              Completează ANAF_OAUTH_CLIENT_ID, ANAF_OAUTH_CLIENT_SECRET și ANAF_OAUTH_REDIRECT_URI. URI-ul trebuie să coincidă exact cu aplicația din portalul ANAF OAuth.
            </p>
          )}

          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6">
            <div>
              <dt className="text-[color:var(--color-muted-foreground)]">Mediu</dt>
              <dd className="font-medium">{connection?.environment || 'test'}</dd>
            </div>
            <div>
              <dt className="text-[color:var(--color-muted-foreground)]">Expiră</dt>
              <dd className="font-medium">{formatExpiry(connection?.expiresAt)}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-[color:var(--color-muted-foreground)]">Serial certificat (JWT)</dt>
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
              {connection?.connected ? 'Reconectează e-Factura TEST' : 'Conectează e-Factura TEST'}
            </button>
            {connection?.connected && isOwner && (
              <button type="button" onClick={disconnect} disabled={busy} className="btn btn-outline disabled:opacity-50">
                Deconectează
              </button>
            )}
          </div>

          <ol className="mt-6 text-sm text-[color:var(--color-muted-foreground)] space-y-1 list-decimal pl-5">
            <li>Pornește paperLESS vToken și aplicația de autorizare.</li>
            <li>Înregistrează certificatul în SPV și obține documentul de confirmare.</li>
            <li>Înregistrează Facturo la anaf.ro/InregOauth cu acest redirect: <span className="font-mono break-all">/api/efactura/oauth/callback</span></li>
            <li>Apasă Conectează, autentifică-te cu certificatul, apoi trimite facturi din Facturi emise.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
