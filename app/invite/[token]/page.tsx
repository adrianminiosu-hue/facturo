'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import BrandLockup from '@/components/BrandLockup'
import { supabase } from '@/lib/supabase'

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [status, setStatus] = useState('Se încarcă...')
  const [email, setEmail] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/team/invite/${token}`)
      const data = await res.json()
      if (!res.ok) {
        setStatus(data.error || 'Invitația nu este validă.')
        return
      }
      setEmail(data.email)
      setOwnerName(data.ownerName)
      setReady(true)
      setStatus('')
      const { data: { user } } = await supabase.auth.getUser()
      if (user && data.status === 'pending') {
        setBusy(true)
        const accept = await fetch('/api/team/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, token })
        })
        const body = await accept.json()
        setBusy(false)
        if (!accept.ok) {
          setError(body.error || 'Nu s-a putut accepta invitația.')
          return
        }
        router.push('/dashboard')
      }
    }
    if (token) load()
  }, [token, router])

  return (
    <div className="app-shell flex flex-col">
      <nav className="top-nav">
        <BrandLockup href="/" />
      </nav>
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="card p-10 w-full max-w-md">
          <p className="kicker mb-4">Echipă</p>
          <h1 className="text-4xl text-[color:var(--color-foreground)] mb-3">Invitație</h1>
          {!ready ? (
            <p className="text-[color:var(--color-muted-foreground)]">{status}</p>
          ) : (
            <>
              <p className="text-[color:var(--color-muted-foreground)] mb-6">
                {ownerName} te-a invitat ca operator pe facturile cabinetului. Folosește {email}.
              </p>
              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
              <div className="flex flex-col gap-3">
                <Link href={`/register?invite=${token}&email=${encodeURIComponent(email)}`} className="btn btn-primary text-center">
                  Creează cont
                </Link>
                <Link href={`/login?next=/invite/${token}`} className="btn btn-outline text-center">
                  Am deja cont
                </Link>
              </div>
              {busy && <p className="text-sm text-[color:var(--color-muted-foreground)] mt-4">Se acceptă invitația...</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
