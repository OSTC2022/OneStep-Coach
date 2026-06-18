import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSafeSessionUser } from '@/lib/supabase/auth-session'
import { PROFILE_SELECT, USER_LEGACY_SELECT } from '@/lib/supabase-selects'
import {
  ensureProtectedAdminRole,
  isProtectedAdminAccount,
} from '@/lib/protected-admin'
import { formatLoginEmailForDisplay } from '@/lib/auth-email'
import {
  getEffectiveApprovalStatus,
  isProfileAccessAllowed,
  resolveApprovalStatus,
} from '@/lib/profile-approval'
import { profileRoleToAppRole } from '@/lib/roles'
import type { ProfileApprovalStatus, User, UserRole } from '@/lib/types'

function resolveAppRole(
  email: string | null,
  profileRole: string | null | undefined,
  fallbackRole?: string | null,
): UserRole {
  if (isProtectedAdminAccount(email)) return 'admin'
  return profileRoleToAppRole(
    profileRole ?? fallbackRole ?? 'member',
  ) as UserRole
}

/** 레이아웃·페이지가 같은 요청 안에서 프로필을 한 번만 조회 */
export const getDashboardProfile = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const { user } = await getSafeSessionUser(supabase)

  if (!user) return null

  const { data: dbProfile } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', user.id)
    .maybeSingle()

  const email = user.email ?? dbProfile?.email ?? null

  if (dbProfile) {
    if (
      isProtectedAdminAccount(email ?? dbProfile.email) &&
      dbProfile.role !== 'admin'
    ) {
      await ensureProtectedAdminRole(user.id, email ?? dbProfile.email)
    }
    return {
      id: dbProfile.id,
      email: formatLoginEmailForDisplay(dbProfile.email) ?? dbProfile.email,
      full_name: dbProfile.full_name,
      role: resolveAppRole(dbProfile.email, dbProfile.role),
      approval_status: getEffectiveApprovalStatus(
        dbProfile.email,
        dbProfile.approval_status as ProfileApprovalStatus | null | undefined,
        user.user_metadata?.approval_status as ProfileApprovalStatus | undefined,
      ),
      created_at: dbProfile.created_at,
      avatar_url: dbProfile.avatar_url ?? null,
      phone: dbProfile.phone ?? null,
      kakao_id: dbProfile.kakao_id ?? null,
      instagram_id: dbProfile.instagram_id ?? null,
    }
  }

  const { data: legacy } = await supabase
    .from('users')
    .select(USER_LEGACY_SELECT)
    .eq('id', user.id)
    .maybeSingle()

  if (legacy) {
    if (isProtectedAdminAccount(legacy.email) && legacy.role !== 'admin') {
      await ensureProtectedAdminRole(user.id, legacy.email)
    }
    return {
      id: legacy.id,
      email: legacy.email,
      full_name: legacy.full_name,
      role: resolveAppRole(legacy.email, legacy.role),
      approval_status: getEffectiveApprovalStatus(
        legacy.email,
        null,
        user.user_metadata?.approval_status as ProfileApprovalStatus | undefined,
      ),
      created_at: legacy.created_at,
    }
  }

  await ensureProtectedAdminRole(user.id, email)

  const metaStatus = user.user_metadata?.approval_status as
    | ProfileApprovalStatus
    | undefined

  return {
    id: user.id,
    email: formatLoginEmailForDisplay(email) ?? email,
    full_name:
      (user.user_metadata?.full_name as string | undefined) ?? user.email ?? null,
    role: resolveAppRole(
      email,
      null,
      (user.user_metadata?.role as string | undefined) ?? 'member',
    ),
    approval_status: resolveApprovalStatus(email, metaStatus),
    created_at: user.created_at,
  }
})

export async function requireDashboardProfile(): Promise<User> {
  const profile = await getDashboardProfile()
  if (!profile) redirect('/auth/login')
  if (isProtectedAdminAccount(profile.email)) return profile
  if (!isProfileAccessAllowed(profile.approval_status, profile.email)) {
    if (profile.approval_status === 'pending') redirect('/auth/pending')
    redirect('/auth/rejected')
  }
  return profile
}
