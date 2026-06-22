import { createBrowserClient } from '@supabase/ssr'
import { getPublicSupabaseEnv } from '@/lib/supabase/env'

export function createClient() {
  const { url, anonKey } = getPublicSupabaseEnv({ log: true })
  return createBrowserClient(url, anonKey)
}
