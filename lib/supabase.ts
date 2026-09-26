import { createClient, type User } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

type CurrentUser = { data: { user: User | null } }
let pendingUser: Promise<CurrentUser> | null = null

/**
 * The signed-in user, for pages and providers in the browser. Reads the local session instead of
 * calling the auth server (supabase.auth.getUser), and merges simultaneous calls into one: on page load
 * a dozen components ask at once, and parallel getUser calls queue on the auth lock until Supabase
 * steals it and throws "Lock ... was released because another request stole it". API routes still
 * verify the token on the server, so access control does not depend on this.
 */
export function getCurrentUser(): Promise<CurrentUser> {
  if (pendingUser) return pendingUser
  pendingUser = (async () => {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data } = await supabase.auth.getSession()
        return { data: { user: data.session?.user ?? null } }
      } catch (error) {
        // A lock taken over by another tab or request: wait a moment and read again.
        lastError = error
        await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)))
      }
    }
    throw lastError
  })().finally(() => {
    // Keep the answer for the burst of calls on page load, then read fresh again.
    setTimeout(() => { pendingUser = null }, 1000)
  })
  return pendingUser
}

/**
 * The Supabase session lives in localStorage, which the server cannot read. A small marker cookie
 * lets server components (e.g. the landing page) redirect logged-in users before rendering.
 */
export const SESSION_MARKER_COOKIE = 'facturo_session'

if (typeof document !== 'undefined') {
  const mark = (on: boolean) => {
    document.cookie = on
      ? `${SESSION_MARKER_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
      : `${SESSION_MARKER_COOKIE}=; path=/; max-age=0; SameSite=Lax`
  }
  supabase.auth.getSession().then(({ data }) => mark(!!data.session))
  supabase.auth.onAuthStateChange((_event, session) => mark(!!session))
}
