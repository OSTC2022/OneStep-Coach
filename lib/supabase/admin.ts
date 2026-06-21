import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client — server-only. Never import from client components.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set on the server.',
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
