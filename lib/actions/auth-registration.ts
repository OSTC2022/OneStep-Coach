'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/actions/auth'
import { assignCoachRoleToInstructor } from '@/lib/actions/settings-accounts'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import { appRoleToProfileRole, profileRoleToAppRole, getRoleLabel } from '@/lib/roles'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import {
  fetchAllProfiles,
  isMissingApprovalColumn,
  upsertUserProfile,
} from '@/lib/profiles-admin'
import type { ProfileApprovalStatus, ProfileRole } from '@/lib/types'
import { formatLoginEmailForDisplay } from '@/lib/auth-email'
import { resolveApprovalStatus } from '@/lib/profile-approval'
import {
  executePublicSignup,
} from '@/lib/auth/public-signup'
import type { SettingsAssignableRole } from '@/lib/settings-accounts-types'
import { requiresMemberLinkRole } from '@/lib/settings-accounts-types'

export type PendingAccountRow = {
  id: string
  email: string | null
  /** 이메일 없을 때 로그인용 ID (내부 주소 포함) */
  loginEmail: string | null
  full_name: string | null
  role: ProfileRole
  roleLabel: string
  created_at: string
  birth_date?: string | null
  phone?: string | null
  parent_phone?: string | null
  /** 가입 시 자동 생성된 회원 프로필 */
  signupMemberId?: string | null
}

export async function signUpPublic(
  _prev: { error?: string; success?: boolean; loginIdentifier?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean; loginIdentifier?: string }> {
  return executePublicSignup(formData)
}

export async function listPendingAccounts(): Promise<PendingAccountRow[]> {
  await requireRole(['admin'])

  const admin = createServiceRoleClient()
  const ordered = { ascending: false as const }

  let { data, error } = await admin
    .from('profiles')
    .select(
      'id, email, full_name, role, approval_status, created_at',
    )
    .eq('approval_status', 'pending')
    .order('created_at', ordered)
    .limit(30)

  if (error && isMissingApprovalColumn(error.message)) {
    const rows = await fetchAllProfiles(admin)
    return rows
      .filter((row) => row.approval_status === 'pending')
      .map((row) => mapPendingAccountRow(row))
  }

  if (error) {
    console.error('listPendingAccounts:', error)
    return []
  }

  const pendingRows = data ?? []
  const authIds = pendingRows.map((row) => row.id)
  const memberByAuthId = new Map<
    string,
    {
      id: string
      birth_date: string | null
      phone: string | null
      parent_phone: string | null
    }
  >()

  if (authIds.length > 0) {
    const { data: signupMembers } = await admin
      .from('members')
      .select('id, auth_user_id, birth_date, phone, parent_phone')
      .in('auth_user_id', authIds)

    for (const member of signupMembers ?? []) {
      if (member.auth_user_id) {
        memberByAuthId.set(member.auth_user_id, {
          id: member.id,
          birth_date: member.birth_date,
          phone: member.phone,
          parent_phone: member.parent_phone,
        })
      }
    }
  }

  return pendingRows.map((row) => {
    const linked = memberByAuthId.get(row.id)
    return mapPendingAccountRow(
      {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        role: row.role as ProfileRole,
        approval_status: row.approval_status as ProfileApprovalStatus,
        created_at: row.created_at,
      },
      linked,
    )
  })
}

function mapPendingAccountRow(
  row: {
    id: string
    email: string | null
    full_name: string | null
    role: ProfileRole
    approval_status: ProfileApprovalStatus
    created_at: string
  },
  signupMember?: {
    id: string
    birth_date: string | null
    phone: string | null
    parent_phone: string | null
  } | null,
): PendingAccountRow {
  const appRole = profileRoleToAppRole(row.role)
  return {
    id: row.id,
    email: formatLoginEmailForDisplay(row.email),
    loginEmail: row.email,
    full_name: row.full_name,
    role: row.role,
    roleLabel: getRoleLabel(appRole),
    created_at: row.created_at,
    birth_date: signupMember?.birth_date ?? null,
    phone: signupMember?.phone ?? null,
    parent_phone: signupMember?.parent_phone ?? null,
    signupMemberId: signupMember?.id ?? null,
  }
}

/** 강사 탭·기타 — 승인 대기면 승인, 이미 승인됐으면 권한만 변경 */
export async function grantAccountAccess(
  accountUserId: string,
  role: SettingsAssignableRole,
  instructorId?: string | null,
  memberId?: string | null,
): Promise<{ error?: string; loginEmail?: string }> {
  await requireRole(['admin'])

  const admin = createServiceRoleClient()
  const rows = await fetchAllProfiles(admin)
  const profile = rows.find((p) => p.id === accountUserId)

  if (!profile) return { error: '계정을 찾을 수 없습니다.' }
  if (isProtectedAdminAccount(profile.email)) {
    return { error: '시스템 관리자 계정입니다.' }
  }

  const loginEmail =
    formatLoginEmailForDisplay(profile.email) ?? profile.email ?? undefined

  if (
    resolveApprovalStatus(profile.email, profile.approval_status) !==
    'approved'
  ) {
    return approveAccount(
      accountUserId,
      role,
      role === 'instructor' ? instructorId : null,
      requiresMemberLinkRole(role) ? memberId : null,
    )
  }

  if (role === 'instructor') {
    if (!instructorId) {
      return { error: '왼쪽 목록에서 강사를 먼저 선택하세요.' }
    }
    const link = await assignCoachRoleToInstructor(instructorId, accountUserId)
    if (link.error) return link
    return { loginEmail }
  }

  const { updateAccountRole } = await import('@/lib/actions/settings-accounts')
  const updated = await updateAccountRole(accountUserId, role, {
    memberId: requiresMemberLinkRole(role) ? memberId : null,
  })
  if (updated.error) return updated

  revalidatePath('/dashboard/settings')
  return { loginEmail }
}

export async function approveAccount(
  userId: string,
  role: SettingsAssignableRole,
  instructorId?: string | null,
  memberId?: string | null,
): Promise<{ error?: string; loginEmail?: string }> {
  await requireRole(['admin'])

  const admin = createServiceRoleClient()
  let resolvedMemberId = memberId?.trim() || null

  if (requiresMemberLinkRole(role) && !resolvedMemberId) {
    const { data: signupMember } = await admin
      .from('members')
      .select('id')
      .eq('auth_user_id', userId)
      .maybeSingle()
    if (signupMember?.id) {
      resolvedMemberId = signupMember.id
    }
  }

  if (requiresMemberLinkRole(role) && !resolvedMemberId) {
    return { error: '회원·성인회원 권한은 센터 회원 프로필을 선택해 연결해주세요.' }
  }

  const allProfiles = await fetchAllProfiles(admin)
  const profile = allProfiles.find((p) => p.id === userId)

  if (!profile) return { error: '계정을 찾을 수 없습니다.' }
  if (isProtectedAdminAccount(profile.email)) {
    return { error: '시스템 관리자 계정입니다.' }
  }

  let linkedInstructorId = instructorId ?? null
  if (role === 'instructor' && !linkedInstructorId) {
    try {
      const { data: authData } = await admin.auth.admin.getUserById(userId)
      const meta = authData.user?.user_metadata ?? {}
      linkedInstructorId =
        (meta.requested_instructor_id as string | null | undefined) ?? null
    } catch {
      /* ignore */
    }
  }

  const approveProfile = await upsertUserProfile(admin, {
    id: userId,
    email: profile.email,
    full_name: profile.full_name,
    role: appRoleToProfileRole(role),
    approval_status: 'approved',
  })
  if (approveProfile.error) {
    return { error: approveProfile.error }
  }

  const { error: approveUpdateError } = await admin
    .from('profiles')
    .update({
      approval_status: 'approved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (approveUpdateError && !isMissingApprovalColumn(approveUpdateError.message)) {
    return { error: `승인 상태 저장 실패: ${approveUpdateError.message}` }
  }

  const { data: verified } = await admin
    .from('profiles')
    .select('approval_status')
    .eq('id', userId)
    .maybeSingle()

  if (
    verified?.approval_status &&
    verified.approval_status !== 'approved'
  ) {
    return {
      error:
        '승인 상태가 반영되지 않았습니다. Supabase에서 add-profile-approval.sql 실행 여부를 확인해주세요.',
    }
  }

  try {
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        approval_status: 'approved',
        role:
          role === 'instructor'
            ? 'instructor'
            : role === 'admin'
              ? 'admin'
              : role,
      },
    })
  } catch (e) {
    console.error('approveAccount metadata:', e)
  }

  await admin.from('users').upsert(
    {
      id: userId,
      email: profile.email,
      full_name: profile.full_name,
      role:
        role === 'instructor'
          ? 'instructor'
          : role === 'guardian' || role === 'adult_member'
            ? 'member'
            : role,
    },
    { onConflict: 'id' },
  )

  if (role === 'instructor' && linkedInstructorId) {
    const result = await assignCoachRoleToInstructor(linkedInstructorId, userId)
    if (result.error) return result
  } else {
    const { updateAccountRole } = await import('@/lib/actions/settings-accounts')
    const result = await updateAccountRole(userId, role, {
      skipApprovalCheck: true,
      memberId: requiresMemberLinkRole(role) ? resolvedMemberId : null,
    })
    if (result.error) return result
  }

  revalidatePath('/dashboard/settings')
  revalidatePath('/auth/login')

  return {
    loginEmail: formatLoginEmailForDisplay(profile.email) ?? profile.email,
  }
}

export async function rejectAccount(userId: string): Promise<{ error?: string }> {
  await requireRole(['admin'])

  const admin = createServiceRoleClient()
  const allProfiles = await fetchAllProfiles(admin)
  const profile = allProfiles.find((p) => p.id === userId)

  if (!profile) return { error: '계정을 찾을 수 없습니다.' }
  if (isProtectedAdminAccount(profile.email)) {
    return { error: '시스템 관리자 계정입니다.' }
  }

  const rejectResult = await upsertUserProfile(admin, {
    id: userId,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role as ProfileRole,
    approval_status: 'rejected',
  })
  if (rejectResult.error) return { error: rejectResult.error }

  revalidatePath('/dashboard/settings')
  return {}
}

export type AdminCreateAccountInput = {
  fullName: string
  email: string
  password: string
  passwordConfirm: string
  role: SettingsAssignableRole
  instructorId?: string | null
}

function isAlreadyRegisteredError(message: string) {
  const lower = message.toLowerCase()
  return (
    lower.includes('already') ||
    lower.includes('registered') ||
    lower.includes('exists')
  )
}

async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createServiceRoleClient>,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  let page = 1
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error || !data.users.length) break

    const found = data.users.find(
      (user) => user.email?.toLowerCase() === normalized,
    )
    if (found) return found.id

    if (!data.nextPage) break
    page = data.nextPage
  }
  return null
}

async function persistAdminCreatedAccount(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  authEmail: string,
  fullName: string,
  profileRole: ProfileRole,
): Promise<{ error?: string }> {
  const profileResult = await upsertUserProfile(admin, {
    id: userId,
    email: authEmail,
    full_name: fullName,
    role: profileRole,
    approval_status: 'pending',
  })
  if (profileResult.error) {
    return { error: `프로필 저장 실패: ${profileResult.error}` }
  }

  const { error: usersError } = await admin.from('users').upsert(
    {
      id: userId,
      email: authEmail,
      full_name: fullName,
      role: 'member',
    },
    { onConflict: 'id' },
  )
  if (usersError) {
    return { error: `계정 정보 저장 실패: ${usersError.message}` }
  }

  return {}
}

export async function createAccountByAdmin(
  input: AdminCreateAccountInput,
): Promise<{ error?: string; userId?: string; loginEmail?: string; recovered?: boolean }> {
  await requireRole(['admin'])

  const fullName = input.fullName.trim()
  if (fullName.length < 2) {
    return { error: '이름을 2자 이상 입력해주세요.' }
  }
  if (!input.password || input.password.length < 8) {
    return { error: '비밀번호는 8자 이상이어야 합니다.' }
  }
  if (input.password !== input.passwordConfirm) {
    return { error: '비밀번호가 일치하지 않습니다.' }
  }

  const emailResult = parseRequiredEmail(input.email)
  if (emailResult.error || !emailResult.email) {
    return { error: emailResult.error ?? '이메일을 입력해주세요.' }
  }
  const authEmail = emailResult.email
  const profileRole = appRoleToProfileRole(input.role)

  let admin: ReturnType<typeof createServiceRoleClient>
  try {
    admin = createServiceRoleClient()
  } catch {
    return {
      error:
        'SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. 서버 환경 변수를 확인해주세요.',
    }
  }

  const userMetadata = {
    full_name: fullName,
    role: input.role === 'instructor' ? 'instructor' : input.role,
    requested_role: input.role,
    requested_instructor_id: input.instructorId ?? null,
    approval_status: 'pending' as const,
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: authEmail,
      password: input.password,
      email_confirm: true,
      user_metadata: userMetadata,
    })

  let userId: string | undefined
  let recovered = false

  if (createError || !created.user) {
    const message = createError?.message ?? ''
    if (!isAlreadyRegisteredError(message)) {
      return { error: message || '계정 생성에 실패했습니다.' }
    }

    const existingUserId = await findAuthUserIdByEmail(admin, authEmail)
    if (!existingUserId) {
      return { error: '이미 가입된 이메일입니다.' }
    }

    const allProfiles = await fetchAllProfiles(admin)
    const existing = allProfiles.find((p) => p.id === existingUserId)
    if (
      existing &&
      resolveApprovalStatus(existing.email, existing.approval_status) ===
        'approved'
    ) {
      return {
        error:
          '이미 승인된 계정입니다. 가입 승인 탭에서 확인하거나 다른 이메일을 사용해주세요.',
      }
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(
      existingUserId,
      {
        password: input.password,
        email_confirm: true,
        user_metadata: userMetadata,
      },
    )
    if (updateError) {
      return { error: `기존 계정 복구 실패: ${updateError.message}` }
    }

    userId = existingUserId
    recovered = true
  } else {
    userId = created.user.id
  }

  const saveResult = await persistAdminCreatedAccount(
    admin,
    userId,
    authEmail,
    fullName,
    profileRole,
  )
  if (saveResult.error) {
    return { error: saveResult.error, userId, recovered }
  }

  revalidatePath('/dashboard/settings')

  return {
    userId,
    loginEmail: authEmail,
    recovered,
  }
}

export async function redirectIfNotApproved(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('approval_status, role, email')
    .eq('id', user.id)
    .maybeSingle()

  if (isProtectedAdminAccount(user.email ?? profile?.email)) return

  const { getEffectiveApprovalStatus } = await import('@/lib/profile-approval')
  const status = getEffectiveApprovalStatus(
    user.email ?? profile?.email,
    profile?.approval_status as ProfileApprovalStatus | null | undefined,
    user.user_metadata?.approval_status as ProfileApprovalStatus | undefined,
  )
  if (status === 'pending') redirect('/auth/pending')
  if (status === 'rejected') redirect('/auth/rejected')
}
