import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  buildSupabaseAuthCookieKeyFromPairs,
  getSafeSessionUser,
} from '@/lib/supabase/auth-session'
import { cookies } from 'next/headers'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import { getDefaultDashboardPath, profileRoleToAppRole } from '@/lib/roles'

export default async function Home() {
  const cookieStore = await cookies()
  const authCookies = cookieStore.getAll().filter((cookie) => cookie.name.startsWith('sb-'))
  if (authCookies.length === 0) {
    redirect('/auth/login')
  }

  const supabase = await createClient()
  const { user } = await getSafeSessionUser(supabase, {
    cookieKey: buildSupabaseAuthCookieKeyFromPairs(authCookies),
  })

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (isProtectedAdminAccount(user.email ?? profile?.email)) {
    redirect('/dashboard')
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

  redirect(getDefaultDashboardPath(role))
}
