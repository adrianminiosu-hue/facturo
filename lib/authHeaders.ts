import { supabase } from '@/lib/supabase'

/** Headers for calling our own API routes as the signed-in user. */
export async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
    ? { ...extra, Authorization: `Bearer ${session.access_token}` }
    : extra
}
