'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/actions/auth'
import { assignCoachRoleToInstructor } from '@/lib/actions/settings-accounts'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import { appRoleToProfileRole, profileRoleToAppRole } from '@/lib/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchAllProfiles,
  isMissingApprovalColumn,
  upsertUserProfile,
} from '@/lib/profiles-admin'
import type { ProfileApprovalStatus, ProfileRole } from '@/lib/types'
import {
  formatLoginEmailForDisplay,
  parseRequiredEmail,
} from '@/lib/auth-email'
import { resolveApprovalStatus } from '@/lib/profile-approval'
import type { SettingsAssignableRole } from '@/lib/settings-accounts-types'

export type PublicSignUpRole = 'member'

export type PendingAccountRow = {
  id: string
  email: string | null
  /** 이메일 없을 때 로그인용 ID (내부 주소 포함) */
  loginEmail: string | null
  full_name: string | null
  role: ProfileRole
  roleLabel: string
  created_at: string
}

export async function signUpPublic(
  _prev: { error?: string; success?: boolean; loginIdentifier?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean; loginIdentifier?: string }> {
  const fullName = (formData.get('full_name') as string)?.trim()
  const password = formData.get('password') as string
  const passwordConfirm = formData.get('password_confirm') as string
  const requestedRole = (formData.get('role') as PublicSignUpRole) || 'member'

  if (!fullName || fullName.length < 2) {
    return { error: '이름을 2자 이상 입력해주세요.' }
  }

  const emailResult = parseRequiredEmail(formData.get('email') as string)
  if (emailResult.error || !emailResult.email) {
    return { error: emailResult.error ?? '이메일을 입력해주세요.' }
  }
  const authEmail = emailResult.email
  if (!password || password.length < 8) {
    return { error: '비밀번호는 8자 이상이어야 합니다.' }
  }
  if (password !== passwordConfirm) {
    return { error: '비밀번호가 일치하지 않습니다.' }
  }
  if (requestedRole !== 'member') {
    return { error: '회원 가입만 가능합니다.' }
  }

  const profileRole = appRoleToProfileRole(requestedRole)

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return {
      error:
        '회원가입을 처리할 수 없습니다. SUPABASE_SERVICE_ROLE_KEY가 서버에 설정되어 있는지 확인해주세요.',
    }
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: requestedRole,
        approval_status: 'pending',
      },
    })

  if (createError) {
    const msg = createError.message.toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return { error: '이미 가입된 계정입니다.' }
    }
    if (msg.includes('email') && msg.includes('invalid')) {
      return { error: '이메일 형식이 올바르지 않습니다.' }
    }
    return { error: createError.message }
  }

  if (!created.user) {
    return { error: '가입 처리에 실패했습니다.' }
  }

  const userId = created.user.id

  const profileResult = await upsertUserProfile(admin, {
    id: userId,
    email: authEmail,
    full_name: fullName,
    role: profileRole,
    approval_status: 'pending',
  })
  if (profileResult.error) {
    return { error: `가입 정보 저장 실패: ${profileResult.error}` }
  }

  await admin.from('users').upsert(
    {
      id: userId,
      email: authEmail,
      full_name: fullName,
      role: 'member',
    },
    { onConflict: 'id' },
  )

  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
  } catch {
    /* 로그인 화면 — 세션 없을 수 있음 */
  }

  return { success: true, loginIdentifier: authEmail }
}

export async function listPendingAccounts(): Promise<PendingAccountRow[]> {
  await requireRole(['admin'])

  const admin = createAdminClient()
  const ordered = { ascending: false as const }

  let { data, error } = await admin
    .from('profiles')
    .select(
      'id, email, full_name, role, approval_status, created_at',
    )
    .eq('approval_status', 'pending')
    .order('created_at', ordered)

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

  return (data ?? []).map((row) =>
    mapPendingAccountRow({
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      role: row.role as ProfileRole,
      approval_status: row.approval_status as ProfileApprovalStatus,
      created_at: row.created_at,
    }),
  )
}

function mapPendingAccountRow(row: {
  id: string
  email: string | null
  full_name: string | null
  role: ProfileRole
  approval_status: ProfileApprovalStatus
  created_at: string
}): PendingAccountRow {
  const appRole = profileRoleToAppRole(row.role)
  return {
    id: row.id,
    email: formatLoginEmailForDisplay(row.email),
    loginEmail: row.email,
    full_name: row.full_name,
    role: row.role,
    roleLabel:
      appRole === 'admin'
        ? '관리자'
        : appRole === 'guardian'
          ? '학부모'
          : appRole === 'instructor'
            ? '강사'
            : '회원',
    created_at: row.created_at,
  }
}

/** 강사 탭·기타 — 승인 대기면 승인, 이미 승인됐으면 권한만 변경 */
export async function grantAccountAccess(
  accountUserId: string,
  role: SettingsAssignableRole,
  instructorId?: string | null,
): Promise<{ error?: string; loginEmail?: string }> {
  await requireRole(['admin'])

  const admin = createAdminClient()
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
  const updated = await updateAccountRole(accountUserId, role)
  if (updated.error) return updated

  revalidatePath('/dashboard/settings')
  return { loginEmail }
}

export async function approveAccount(
  userId: string,
  role: SettingsAssignableRole,
  instructorId?: string | null,
): Promise<{ error?: string; loginEmail?: string }> {
  await requireRole(['admin'])

  const admin = createAdminClient()
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
          : role === 'guardian'
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

  const admin = createAdminClient()
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

export async function createAccountByAdmin(
  input: AdminCreateAccountInput,
): Promise<{ error?: string; userId?: string; loginEmail?: string }> {
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

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return {
      error:
        'SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. 서버 환경 변수를 확인해주세요.',
    }
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: authEmail,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: input.role === 'instructor' ? 'instructor' : input.role,
        requested_role: input.role,
        requested_instructor_id: input.instructorId ?? null,
        approval_status: 'pending',
      },
    })

  if (createError || !created.user) {
    return { error: createError?.message ?? '계정 생성에 실패했습니다.' }
  }

  const userId = created.user.id

  const profileResult = await upsertUserProfile(admin, {
    id: userId,
    email: authEmail,
    full_name: fullName,
    role: profileRole,
    approval_status: 'pending',
  })
  if (profileResult.error) {
    return { error: `프로필 저장 실패: ${profileResult.error}`, userId }
  }

  await admin.from('users').upsert(
    {
      id: userId,
      email: authEmail,
      full_name: fullName,
      role: 'member',
    },
    { onConflict: 'id' },
  )

  revalidatePath('/dashboard/settings')

  return {
    userId,
    loginEmail: authEmail,
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
