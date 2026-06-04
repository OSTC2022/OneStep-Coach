import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PROFILE_SELECT, USER_LEGACY_SELECT } from '@/lib/supabase-selects'
import { profileRoleToAppRole } from '@/lib/roles'
import type { User, UserRole } from '@/lib/types'

/** 레이아웃·페이지가 같은 요청 안에서 프로필을 한 번만 조회 */
export const getDashboardProfile = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: dbProfile } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', user.id)
    .maybeSingle()

  if (dbProfile) {
    return {
      id: dbProfile.id,
      email: dbProfile.email,
      full_name: dbProfile.full_name,
      role: profileRoleToAppRole(dbProfile.role) as UserRole,
      created_at: dbProfile.created_at,
    }
  }

  const { data: legacy } = await supabase
    .from('users')
    .select(USER_LEGACY_SELECT)
    .eq('id', user.id)
    .maybeSingle()

  if (legacy) {
    return {
      id: legacy.id,
      email: legacy.email,
      full_name: legacy.full_name,
      role: profileRoleToAppRole(legacy.role) as UserRole,
      created_at: legacy.created_at,
    }
  }

  return {
    id: user.id,
    email: user.email ?? null,
    full_name:
      (user.user_metadata?.full_name as string | undefined) ?? user.email ?? null,
    role: profileRoleToAppRole(
      (user.user_metadata?.role as string | undefined) ?? 'member',
    ) as UserRole,
    created_at: user.created_at,
  }
})

export async function requireDashboardProfile(): Promise<User> {
  const profile = await getDashboardProfile()
  if (!profile) redirect('/auth/login')
  return profile
}
