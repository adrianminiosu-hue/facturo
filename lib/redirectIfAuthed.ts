import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function redirectIfAuthed() {
  const jar = await cookies()
  const hasSession = jar.getAll().some(cookie =>
    cookie.name === 'facturo_session' || cookie.name.includes('-auth-token') || cookie.name.startsWith('sb-')
  )
  if (hasSession) redirect('/dashboard')
}
