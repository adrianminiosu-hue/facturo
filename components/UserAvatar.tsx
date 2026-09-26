'use client'
import { useEffect, useState } from 'react'
import { userInitials } from '@/lib/userDisplay'

export default function UserAvatar({
  url,
  name,
  email,
  size = 'sm'
}: {
  url?: string
  name?: string
  email?: string
  size?: 'sm' | 'lg'
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [url])

  const dim = size === 'lg' ? 'h-20 w-20 text-xl' : 'h-8 w-8 text-xs'
  const initials = userInitials(name, email)
  if (url && !broken) {
    return (
      <img
        src={url}
        alt={name || email || 'Fotografie de profil'}
        onError={() => setBroken(true)}
        className={`${dim} rounded-full object-cover bg-[color:var(--color-muted)] shrink-0 ring-1 ring-[color:var(--color-border)]`}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`${dim} rounded-full bg-[color:var(--color-muted)] text-[color:var(--color-foreground)] inline-flex items-center justify-center font-medium shrink-0 ring-1 ring-[color:var(--color-border)]`}
    >
      {initials}
    </span>
  )
}
