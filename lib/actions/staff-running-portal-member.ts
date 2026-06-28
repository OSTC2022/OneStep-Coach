'use server'

import { getCurrentUser, getMemberForCurrentUser } from '@/lib/actions/auth'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { Member } from '@/lib/types'
import type { User } from '@/lib/types'

const STAFF_PORTAL_MEMBER_MEMO = '스태프 러닝 포털 자동 프로필'
const STAFF_PORTAL_SPORT = '성인 러닝'

function isStaffRunningPortalRole(role: User['role'] | undefined): boolean {
  return role === 'admin' || role === 'instructor'
}

async function fetchMemberByAuthUserId(
  admin: ReturnType<typeof createServiceRoleClient>,
  authUserId: string,
): Promise<Member | null> {
  const { data, error } = await admin
    .from('members')
    .select('*')
    .or(`auth_user_id.eq.${authUserId},user_id.eq.${authUserId}`)
    .maybeSingle()

  if (error || !data) return null
  return data as Member
}

async function createStaffRunningPortalMember(user: User): Promise<Member | null> {
  const displayName = user.full_name?.trim() || user.email?.split('@')[0]?.trim() || '스태프'
  let admin: ReturnType<typeof createServiceRoleClient>
  try {
    admin = createServiceRoleClient()
  } catch {
    return null
  }

  const insertRow: Record<string, unknown> = {
    name: displayName,
    sport: STAFF_PORTAL_SPORT,
    auth_user_id: user.id,
    user_id: user.id,
    is_active: true,
    memo: STAFF_PORTAL_MEMBER_MEMO,
  }

  const { data, error } = await admin.from('members').insert(insertRow).select('*').single()

  if (error) {
    if (error.message.includes('auth_user_id') || error.message.includes('user_id')) {
      const legacyRow = { ...insertRow }
      delete legacyRow.user_id
      const retry = await admin.from('members').insert(legacyRow).select('*').single()
      if (retry.error) {
        console.error('[staff-running-portal] create member:', retry.error)
        return null
      }
      return retry.data as Member
    }
    console.error('[staff-running-portal] create member:', error)
    return null
  }

  return data as Member
}

/** 연결된 회원이 없어도 관리자·강사는 프로필 이름으로 러닝 포털 회원 프로필을 확보합니다. */
export async function getRunningPortalMemberForCurrentUser(): Promise<Member | null> {
  const linked = await getMemberForCurrentUser()
  if (linked) return linked

  const user = await getCurrentUser()
  if (!user || !isStaffRunningPortalRole(user.role)) return null

  let admin: ReturnType<typeof createServiceRoleClient>
  try {
    admin = createServiceRoleClient()
  } catch {
    return null
  }

  const existing = await fetchMemberByAuthUserId(admin, user.id)
  if (existing) {
    const profileName = user.full_name?.trim()
    if (
      profileName &&
      existing.name !== profileName &&
      existing.memo?.includes('스태프 러닝 포털')
    ) {
      const { data: updated } = await admin
        .from('members')
        .update({ name: profileName })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (updated) return updated as Member
    }
    return existing
  }

  return createStaffRunningPortalMember(user)
}

export async function getRunningPortalMemberData() {
  const member = await getRunningPortalMemberForCurrentUser()
  if (!member) return null

  const { loadMemberPortalData } = await import('@/lib/member-portal-data')
  return loadMemberPortalData(member)
}
