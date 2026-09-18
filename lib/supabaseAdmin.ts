import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase admin is not configured')
  return createClient(url, key)
}
