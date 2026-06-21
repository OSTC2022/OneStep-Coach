'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/actions/auth'
import {
  appRoleToProfileRole,
  getRoleLabel,
  profileRoleToAppRole,
} from '@/lib/roles'
import { formatLoginEmailForDisplay } from '@/lib/auth-email'
import {
  getApprovalStatusLabel,
  resolveApprovalStatus,
} from '@/lib/profile-approval'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import {
  ensureProfileRowForAdmin,
  fetchAllProfiles,
  upsertUserProfile,
} from '@/lib/profiles-admin'
import {
  linkAuthUserToMemberRecord,
  unlinkAuthUserFromMemberRecord,
} from '@/lib/actions/member-account'
import type {
  InstructorRoleRow,
  RegisteredAccount,
  SettingsAssignableRole,
} from '@/lib/settings-accounts-types'
import type { ProfileApprovalStatus, ProfileRole } from '@/lib/types'

function toProfileRole(role: SettingsAssignableRole): ProfileRole {
  return appRoleToProfileRole(role)
}

function toLegacyUsersRole(profileRole: ProfileRole): string {
  if (profileRole === 'coach') return 'instructor'
  if (profileRole === 'guardian' || profileRole === 'adult_member') return 'member'
  return profileRole
}

function toAuthMetadataRole(profileRole: ProfileRole): string {
  if (profileRole === 'coach') return 'instructor'
  return profileRole
}

export type ListRegisteredAccountsResult = {
  accounts: RegisteredAccount[]
  error?: string
}

export async function listRegisteredAccountsResult(): Promise<ListRegisteredAccountsResult> {
  try {
    await requireRole(['admin'])
    const admin = createServiceRoleClient()
    const accounts = await mapRegisteredAccounts(admin)
    return { accounts }
  } catch (e) {
    console.error('listRegisteredAccounts:', e)
    const message =
      e instanceof Error
        ? e.message
        : '계정 목록을 불러올 수 없습니다. SUPABASE_SERVICE_ROLE_KEY를 확인하세요.'
    return { accounts: [], error: message }
  }
}

export async function listRegisteredAccounts(): Promise<RegisteredAccount[]> {
  const { accounts } = await listRegisteredAccountsResult()
  return accounts
}

async function mapRegisteredAccounts(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<RegisteredAccount[]> {
  const rows = await fetchAllProfiles(admin)
  const ids = rows.map((p) => p.id)
  const instructorByUserId = new Map<string, string>()
  const memberByUserId = new Map<string, { id: string; name: string }>()

  if (ids.length > 0) {
    const [{ data: instructors }, { data: byAuth }, { data: byUser }] =
      await Promise.all([
        admin.from('instructors').select('name, user_id').in('user_id', ids),
        admin
          .from('members')
          .select('id, name, auth_user_id, user_id')
          .in('auth_user_id', ids),
        admin
          .from('members')
          .select('id, name, auth_user_id, user_id')
          .in('user_id', ids),
      ])

    const members = [...(byAuth ?? []), ...(byUser ?? [])]

    for (const row of instructors ?? []) {
      if (row.user_id) {
        instructorByUserId.set(row.user_id, row.name)
      }
    }

    const seenMemberIds = new Set<string>()
    for (const row of members ?? []) {
      if (seenMemberIds.has(row.id)) continue
      seenMemberIds.add(row.id)
      const uid = row.auth_user_id ?? row.user_id
      if (uid) {
        memberByUserId.set(uid, { id: row.id, name: row.name })
      }
    }
  }

  return rows.map((row) => {
    const profileRole = row.role as ProfileRole
    const appRole = profileRoleToAppRole(profileRole)
    const protectedAccount =
      profileRole === 'admin' || isProtectedAdminAccount(row.email)
    const approvalStatus = resolveApprovalStatus(
      row.email,
      row.approval_status as ProfileApprovalStatus | null | undefined,
    )

    return {
      id: row.id,
      email: formatLoginEmailForDisplay(row.email),
      loginEmail: row.email,
      full_name: row.full_name,
      profileRole,
      appRole,
      roleLabel: protectedAccount ? '관리자' : getRoleLabel(appRole),
      approvalStatus,
      approvalLabel: getApprovalStatusLabel(approvalStatus, row.email),
      created_at: row.created_at,
      linkedInstructorName: instructorByUserId.get(row.id) ?? null,
      linkedMemberId: memberByUserId.get(row.id)?.id ?? null,
      linkedMemberName: memberByUserId.get(row.id)?.name ?? null,
      isProtected: protectedAccount,
    }
  })
}

async function syncLegacyUser(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  email: string | null,
  fullName: string | null,
  profileRole: ProfileRole,
) {
  const { error } = await admin.from('users').upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role: toLegacyUsersRole(profileRole),
    },
    { onConflict: 'id' },
  )

  if (error) {
    return { error: `users 동기화 실패: ${error.message}` }
  }
  return {}
}

async function clearInstructorUserLinks(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  exceptInstructorId?: string,
) {
  let query = admin
    .from('instructors')
    .update({ user_id: null })
    .eq('user_id', userId)

  if (exceptInstructorId) {
    query = query.neq('id', exceptInstructorId)
  }

  await query
}

async function linkInstructorRecord(
  admin: ReturnType<typeof createServiceRoleClient>,
  instructorId: string,
  userId: string,
): Promise<{ error?: string }> {
  await clearInstructorUserLinks(admin, userId, instructorId)

  const { error } = await admin
    .from('instructors')
    .update({ user_id: userId })
    .eq('id', instructorId)

  if (error) return { error: error.message }
  return {}
}

async function ensureInstructorLink(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  fullName: string | null,
  email: string | null,
  preferredInstructorId?: string,
): Promise<{ error?: string }> {
  if (preferredInstructorId) {
    return linkInstructorRecord(admin, preferredInstructorId, userId)
  }

  const { data: linked } = await admin
    .from('instructors')
    .select('id, name')
    .eq('user_id', userId)
    .maybeSingle()

  if (linked) return {}

  const displayName = fullName?.trim() || email?.split('@')[0] || '강사'

  if (fullName?.trim()) {
    const { data: byName } = await admin
      .from('instructors')
      .select('id, user_id')
      .eq('name', fullName.trim())
      .is('user_id', null)
      .maybeSingle()

    if (byName) {
      return linkInstructorRecord(admin, byName.id, userId)
    }
  }

  const { error } = await admin.from('instructors').insert({
    name: displayName,
    user_id: userId,
    is_active: true,
    speciality: [],
  })

  if (error) return { error: error.message }
  return {}
}

async function unlinkInstructorUser(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
) {
  await admin
    .from('instructors')
    .update({ user_id: null })
    .eq('user_id', userId)
}

export async function listInstructorsForSettings(): Promise<InstructorRoleRow[]> {
  await requireRole(['admin'])

  const admin = createServiceRoleClient()
  const { data: instructors, error } = await admin
    .from('instructors')
    .select('id, name, phone, user_id, is_active')
    .order('name', { ascending: true })

  if (error) {
    console.error('listInstructorsForSettings:', error)
    return []
  }

  const rows = instructors ?? []
  const userIds = rows
    .map((i) => i.user_id)
    .filter((id): id is string => Boolean(id))

  const profileById = new Map<
    string,
    { email: string | null; full_name: string | null; role: ProfileRole }
  >()

  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email, full_name, role')
      .in('id', userIds)

    for (const p of profiles ?? []) {
      profileById.set(p.id, {
        email: p.email,
        full_name: p.full_name,
        role: p.role as ProfileRole,
      })
    }
  }

  return rows.map((row) => {
    const profile = row.user_id ? profileById.get(row.user_id) : undefined
    const appRole = profile ? profileRoleToAppRole(profile.role) : null
    const hasCoachAccess = appRole === 'instructor' || profile?.role === 'coach'

    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      is_active: row.is_active,
      user_id: row.user_id,
      accountEmail: profile?.email ?? null,
      accountName: profile?.full_name ?? null,
      accountRoleLabel: appRole ? getRoleLabel(appRole) : null,
      hasCoachAccess,
    }
  })
}

async function applyCoachProfileForUser(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  instructorId?: string,
): Promise<{ error?: string }> {
  const ensured = await ensureProfileRowForAdmin(admin, userId)
  if (ensured.error || !ensured.profile) {
    return { error: ensured.error ?? '계정을 찾을 수 없습니다.' }
  }

  const existing = ensured.profile

  if (
    isProtectedAdminAccount(existing.email) ||
    existing.role === 'admin' ||
    profileRoleToAppRole(existing.role) === 'admin'
  ) {
    return { error: '관리자 계정에는 강사 권한을 부여할 수 없습니다.' }
  }

  const profileSave = await upsertUserProfile(admin, {
    id: userId,
    email: existing.email,
    full_name: existing.full_name,
    role: 'coach',
    approval_status: 'approved',
  })
  if (profileSave.error) return { error: profileSave.error }

  const legacy = await syncLegacyUser(
    admin,
    userId,
    existing.email,
    existing.full_name,
    'coach',
  )
  if (legacy.error) return legacy

  try {
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        role: 'instructor',
        approval_status: 'approved',
        full_name: existing.full_name ?? undefined,
      },
    })
  } catch (e) {
    console.error('applyCoachProfile metadata:', e)
  }

  const link = await ensureInstructorLink(
    admin,
    userId,
    existing.full_name,
    existing.email,
    instructorId,
  )
  if (link.error) return link

  return {}
}

/** 강사 프로필에 로그인 계정을 연결하고 강사(coach) 권한 부여 */
export async function assignCoachRoleToInstructor(
  instructorId: string,
  accountUserId: string,
): Promise<{ error?: string }> {
  await requireRole(['admin'])

  let admin: ReturnType<typeof createServiceRoleClient>
  try {
    admin = createServiceRoleClient()
  } catch {
    return {
      error:
        'SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. .env.local을 확인한 뒤 서버를 재시작해주세요.',
    }
  }

  const { data: instructor, error: instError } = await admin
    .from('instructors')
    .select('id, name')
    .eq('id', instructorId)
    .maybeSingle()

  if (instError || !instructor) {
    return { error: '강사를 찾을 수 없습니다.' }
  }

  const result = await applyCoachProfileForUser(admin, accountUserId, instructorId)
  if (result.error) return result

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/auth/login')

  return {}
}

export type UpdateAccountRoleOptions = {
  /** 가입 승인 처리 중 — 승인 대기 계정에도 권한 부여 */
  skipApprovalCheck?: boolean
  /** 회원 권한 시 연결할 센터 회원 ID */
  memberId?: string | null
}

export async function updateAccountRole(
  userId: string,
  role: SettingsAssignableRole,
  options?: UpdateAccountRoleOptions,
): Promise<{ error?: string }> {
  const currentUser = await requireRole(['admin'])

  if (userId === currentUser.id && role !== 'instructor') {
    return { error: '본인 계정의 권한은 여기서 변경할 수 없습니다.' }
  }

  const admin = createServiceRoleClient()
  const profileRole = toProfileRole(role)
  const allProfiles = await fetchAllProfiles(admin)
  const existingRow = allProfiles.find((p) => p.id === userId)

  if (!existingRow) {
    return { error: '계정을 찾을 수 없습니다.' }
  }

  if (
    !options?.skipApprovalCheck &&
    resolveApprovalStatus(existingRow.email, existingRow.approval_status) !==
      'approved'
  ) {
    return {
      error:
        '승인된 계정만 권한을 변경할 수 있습니다. 가입 승인 탭에서 먼저 승인해주세요.',
    }
  }

  const existing = {
    id: existingRow.id,
    email: existingRow.email,
    full_name: existingRow.full_name,
    role: existingRow.role as ProfileRole,
  }

  if (isProtectedAdminAccount(existing.email) || existing.role === 'admin') {
    return { error: '관리자 계정의 권한은 변경할 수 없습니다.' }
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      role: profileRole,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (profileError) {
    return { error: profileError.message }
  }

  const legacy = await syncLegacyUser(
    admin,
    userId,
    existing.email,
    existing.full_name,
    profileRole,
  )
  if (legacy.error) return legacy

  try {
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        role: toAuthMetadataRole(profileRole),
        full_name: existing.full_name ?? undefined,
      },
    })
  } catch (e) {
    console.error('updateUserById metadata:', e)
  }

  if (profileRole === 'coach') {
    await unlinkAuthUserFromMemberRecord(userId)
    const link = await ensureInstructorLink(
      admin,
      userId,
      existing.full_name,
      existing.email,
    )
    if (link.error) return link
  } else if (profileRole === 'member' || profileRole === 'adult_member') {
    await unlinkInstructorUser(admin, userId)
    const memberId = options?.memberId?.trim()
    if (memberId) {
      const linked = await linkAuthUserToMemberRecord(userId, memberId, {
        role: profileRole,
      })
      if (linked.error) return linked
    }
  } else {
    await unlinkInstructorUser(admin, userId)
    await unlinkAuthUserFromMemberRecord(userId)
  }

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/calendar')

  return {}
}

/** 강사·학부모 등 부여 권한을 회원으로 되돌림 (승인 상태 유지) */
export async function revokeAccountRole(
  userId: string,
): Promise<{ error?: string }> {
  await requireRole(['admin'])

  const admin = createServiceRoleClient()
  const allProfiles = await fetchAllProfiles(admin)
  const profile = allProfiles.find((p) => p.id === userId)

  if (!profile) return { error: '계정을 찾을 수 없습니다.' }
  if (isProtectedAdminAccount(profile.email)) {
    return { error: '시스템 관리자 계정입니다.' }
  }
  if (resolveApprovalStatus(profile.email, profile.approval_status) !== 'approved') {
    return { error: '승인된 계정만 권한을 해제할 수 있습니다.' }
  }

  return updateAccountRole(userId, 'member')
}

/** 승인 취소 — 로그인·대시보드 접속 불가 */
export async function revokeAccountApproval(
  userId: string,
): Promise<{ error?: string }> {
  await requireRole(['admin'])

  const admin = createServiceRoleClient()
  const allProfiles = await fetchAllProfiles(admin)
  const profile = allProfiles.find((p) => p.id === userId)

  if (!profile) return { error: '계정을 찾을 수 없습니다.' }
  if (isProtectedAdminAccount(profile.email)) {
    return { error: '시스템 관리자 계정입니다.' }
  }

  const currentUser = await requireRole(['admin'])
  if (userId === currentUser.id) {
    return { error: '본인 계정의 승인은 취소할 수 없습니다.' }
  }

  await unlinkInstructorUser(admin, userId)

  const result = await upsertUserProfile(admin, {
    id: userId,
    email: profile.email,
    full_name: profile.full_name,
    role: 'member',
    approval_status: 'pending',
  })
  if (result.error) return result

  await syncLegacyUser(admin, userId, profile.email, profile.full_name, 'member')

  try {
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        approval_status: 'pending',
        role: 'member',
        full_name: profile.full_name ?? undefined,
      },
    })
  } catch (e) {
    console.error('revokeAccountApproval metadata:', e)
  }

  revalidatePath('/dashboard/settings')
  return {}
}

/** Auth·프로필 계정 완전 삭제 */
export async function deleteAccount(userId: string): Promise<{ error?: string }> {
  await requireRole(['admin'])

  const admin = createServiceRoleClient()
  const allProfiles = await fetchAllProfiles(admin)
  const profile = allProfiles.find((p) => p.id === userId)

  if (!profile) return { error: '계정을 찾을 수 없습니다.' }
  if (isProtectedAdminAccount(profile.email)) {
    return { error: '시스템 관리자 계정은 삭제할 수 없습니다.' }
  }

  const currentUser = await requireRole(['admin'])
  if (userId === currentUser.id) {
    return { error: '본인 계정은 삭제할 수 없습니다.' }
  }

  await unlinkInstructorUser(admin, userId)
  await admin
    .from('members')
    .update({ auth_user_id: null, user_id: null })
    .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)

  await admin.from('profiles').delete().eq('id', userId)
  await admin.from('users').delete().eq('id', userId)

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError) {
    return { error: deleteError.message }
  }

  revalidatePath('/dashboard/settings')
  revalidatePath('/auth/login')
  return {}
}
