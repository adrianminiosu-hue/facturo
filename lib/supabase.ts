import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
