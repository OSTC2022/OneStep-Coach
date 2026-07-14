import { createBrowserClient } from '@supabase/ssr'
import { getPublicSupabaseEnv } from '@/lib/supabase/env'
import { SUPABASE_AUTH_COOKIE_OPTIONS } from '@/lib/auth/remember-me'

export function createClient() {
  const { url, anonKey } = getPublicSupabaseEnv({ log: true })
  return createBrowserClient(url, anonKey, {
    cookieOptions: SUPABASE_AUTH_COOKIE_OPTIONS,
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}
