import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getServiceSupabaseEnv } from '@/lib/supabase/env'

/**
 * Service-role Supabase client — server-only. Never import from client components.
 */
export function createServiceRoleClient(): SupabaseClient {
  const { url, serviceRoleKey } = getServiceSupabaseEnv({ log: true })

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
