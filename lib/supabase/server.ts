import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPublicSupabaseEnv } from '@/lib/supabase/env'
import {
  applyRememberMeToSupabaseCookieOptions,
  getRememberMeFromCookieList,
} from '@/lib/auth/remember-me'

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient() {
  const { url, anonKey } = getPublicSupabaseEnv({ log: true })
  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          const rememberMe = getRememberMeFromCookieList(cookieStore.getAll())
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(
              name,
              value,
              applyRememberMeToSupabaseCookieOptions(name, options ?? {}, rememberMe),
            ),
          )
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[supabase/server] cookie set skipped:', error)
          }
        }
      },
    },
  })
}
