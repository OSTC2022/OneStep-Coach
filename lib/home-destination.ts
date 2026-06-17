import { createClient } from '@/lib/supabase/server'
import {
  buildSupabaseAuthCookieKeyFromPairs,
  getSafeSessionUser,
} from '@/lib/supabase/auth-session'
import { cookies } from 'next/headers'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import { getDefaultDashboardPath, profileRoleToAppRole } from '@/lib/roles'

/** PWA start_url(/) — 서버 redirect 대신 클라이언트 이동용 목적지 */
export async function resolveHomeDestination(): Promise<string> {
  const cookieStore = await cookies()
  const authCookies = cookieStore
    .getAll()
    .filter((cookie) => cookie.name.startsWith('sb-'))

  if (authCookies.length === 0) {
    return '/auth/login'
  }

  const supabase = await createClient()
  const { user } = await getSafeSessionUser(supabase, {
    cookieKey: buildSupabaseAuthCookieKeyFromPairs(authCookies),
  })

  if (!user) {
    return '/auth/login'
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (isProtectedAdminAccount(user.email ?? profile?.email)) {
    return '/dashboard'
  }

  let role = profileRoleToAppRole(profile?.role ?? null)
  if (!profile?.role) {
    const { data: legacy } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    role = profileRoleToAppRole(legacy?.role ?? 'member')
  }

  return getDefaultDashboardPath(role)
}
