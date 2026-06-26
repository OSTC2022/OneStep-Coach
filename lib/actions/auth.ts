'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import type {
  Member,
  Profile,
  ProfileApprovalStatus,
  ProfileRole,
  User,
  UserRole,
} from '@/lib/types'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import {
  getEffectiveApprovalStatus,
  isProfileAccessAllowed,
} from '@/lib/profile-approval'
import { resolveLoginAuthEmail } from '@/lib/auth/login-resolve'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import { appRoleToProfileRole, getDefaultDashboardPath, profileRoleToAppRole, type AppRole } from '@/lib/roles'
import {
  findAuthUserByEmail,
  formatRecoveryEmailError,
  sendPasswordRecoveryEmail,
} from '@/lib/auth-recovery-link'
import {
  REMEMBER_ME_COOKIE,
  REMEMBER_ME_MAX_AGE_SECONDS,
  applyRememberMeToSupabaseCookieOptions,
} from '@/lib/auth/remember-me'

async function applyRememberMeCookies(rememberMe: boolean) {
  const cookieStore = await cookies()
  const secure = process.env.NODE_ENV === 'production'

  if (rememberMe) {
    cookieStore.set(REMEMBER_ME_COOKIE, '1', {
      path: '/',
      maxAge: REMEMBER_ME_MAX_AGE_SECONDS,
      sameSite: 'lax',
      secure,
      httpOnly: true,
    })
    for (const cookie of cookieStore.getAll()) {
      if (!cookie.name.startsWith('sb-')) continue
      cookieStore.set(
        cookie.name,
        cookie.value,
        applyRememberMeToSupabaseCookieOptions(cookie.name, { path: '/', sameSite: 'lax', secure }, true),
      )
    }
    return
  }

  cookieStore.set(REMEMBER_ME_COOKIE, '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    sameSite: 'lax',
    secure,
    httpOnly: true,
  })
}

export async function signIn(
  _prevState: { error?: string; redirectTo?: string } | null,
  formData: FormData,
): Promise<{ error?: string; redirectTo?: string }> {
  const supabase = await createClient()

  const loginInput = (formData.get('email') as string)?.trim() ?? ''
  const password = formData.get('password') as string
  const rememberMe = formData.get('remember_me') === 'on'

  const resolved = await resolveLoginAuthEmail(loginInput)
  if (resolved.error) {
    return { error: resolved.error }
  }

  // 깨진 refresh token·이전 세션 쿠키가 새 로그인을 막는 경우 방지
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // ignore
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: resolved.email,
    password,
  })

  if (error) {
    console.warn('[signIn] auth failed', {
      email: resolved.email,
      code: error.code ?? null,
      message: error.message,
    })
    const message =
      error.message === 'Invalid login credentials'
        ? '이메일 또는 비밀번호가 올바르지 않습니다.'
        : error.message
    return { error: message }
  }

  const authUser = data.user
  if (!authUser) {
    console.error('[signIn] signInWithPassword succeeded but user is missing', {
      email: resolved.email,
      hasSession: Boolean(data.session),
    })
    return { error: '로그인 처리에 실패했습니다. 잠시 후 다시 시도해주세요.' }
  }

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('approval_status, email, role, full_name')
    .eq('id', authUser.id)
    .maybeSingle()

  const accountEmail =
    profileRow?.email ?? authUser.email ?? resolved.email
  const approvalStatus = getEffectiveApprovalStatus(
    accountEmail,
    profileRow?.approval_status as ProfileApprovalStatus | null | undefined,
    authUser.user_metadata?.approval_status as ProfileApprovalStatus | undefined,
  )

  if (
    !isProtectedAdminAccount(accountEmail) &&
    !isProfileAccessAllowed(approvalStatus, accountEmail)
  ) {
    if (approvalStatus === 'pending') {
      await applyRememberMeCookies(rememberMe)
      return { redirectTo: '/auth/pending' }
    }
    if (approvalStatus === 'rejected') {
      await supabase.auth.signOut()
      return { error: '가입 승인이 거절되었습니다. 관리자에게 문의해주세요.' }
    }
    await supabase.auth.signOut()
    return { error: '가입 승인 후 로그인할 수 있습니다.' }
  }

  const profileRole = isProtectedAdminAccount(accountEmail)
    ? 'admin'
    : profileRow?.role ??
      (authUser.user_metadata?.role as string | undefined) ??
      'member'
  const metaRole = authUser.user_metadata?.role as string | undefined
  const metaApproval = authUser.user_metadata?.approval_status as
    | ProfileApprovalStatus
    | undefined

  if (metaRole !== profileRole || metaApproval !== approvalStatus) {
    try {
      await supabase.auth.updateUser({
        data: {
          role: profileRole,
          approval_status: approvalStatus,
          ...(profileRow?.full_name
            ? { full_name: profileRow.full_name }
            : {}),
        },
      })
    } catch (error) {
      console.error('signIn updateUser metadata:', error)
    }
  }

  const appRole = profileRoleToAppRole(profileRole) as AppRole
  if (appRole === 'member' || appRole === 'guardian' || appRole === 'adult_member') {
    try {
      const { createServiceRoleClient } = await import('@/lib/supabase/admin')
      const admin = createServiceRoleClient()
      await admin
        .from('members')
        .update({ last_login_at: new Date().toISOString() })
        .or(`auth_user_id.eq.${authUser.id},user_id.eq.${authUser.id}`)
    } catch {
      // last_login_at 컬럼 미적용 시 무시
    }
  }

  await applyRememberMeCookies(rememberMe)

  return { redirectTo: getDefaultDashboardPath(appRole) }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  await applyRememberMeCookies(false)
  redirect('/auth/login')
}

export async function requestPasswordReset(
  _prev: { error?: string; success?: boolean; message?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean; message?: string }> {
  const loginInput =
    (formData.get('identifier') as string)?.trim() ||
    (formData.get('email') as string)?.trim() ||
    ''

  if (!loginInput) {
    return { error: '이메일 또는 로그인 ID를 입력해주세요.' }
  }

  const resolved = await resolveLoginAuthEmail(loginInput)
  if (resolved.error) {
    return { error: resolved.error }
  }

  if (!resolved.email.includes('@')) {
    return {
      error:
        '비밀번호 재설정은 등록된 이메일이 필요합니다. 관리자에게 문의해주세요.',
    }
  }

  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  let authEmail = resolved.email

  if (hasServiceRole) {
    const authUser = await findAuthUserByEmail(resolved.email)
    if (!authUser) {
      return {
        error:
          '등록된 계정을 찾을 수 없습니다. 이메일 또는 로그인 ID를 확인해주세요.',
      }
    }
    authEmail = authUser.email
  }

  const emailResult = await sendPasswordRecoveryEmail(authEmail)
  if (!emailResult.sent) {
    return {
      error: formatRecoveryEmailError(emailResult.error),
    }
  }

  return {
    success: true,
    message:
      '비밀번호 재설정 링크를 이메일로 보냈습니다. 메일함과 스팸함을 확인해주세요.',
  }
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getDashboardProfile()
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: appRoleToProfileRole(user.role as AppRole),
    approval_status: user.approval_status,
    created_at: user.created_at,
  }
}

/** 레이아웃·권한 검사와 동일한 프로필 (보호 관리자·레거시 포함) */
export async function getCurrentUser(): Promise<User | null> {
  return getDashboardProfile()
}

export async function getUserRole(): Promise<UserRole | null> {
  const user = await getCurrentUser()
  return user?.role ?? null
}

export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')
  return user
}

export async function requireRole(allowedRoles: UserRole[]): Promise<User> {
  const user = await requireAuth()
  if (!allowedRoles.includes(user.role)) redirect('/unauthorized')
  return user
}

async function fetchLinkedMemberRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authUserId: string,
): Promise<Member | null> {
  const { data: basic, error: basicError } = await supabase
    .from('members')
    .select('*')
    .or(`auth_user_id.eq.${authUserId},user_id.eq.${authUserId}`)
    .maybeSingle()

  if (basicError) {
    console.error('getMemberForCurrentUser:', basicError.message)
    return null
  }

  if (!basic) return null

  const member = basic as Member
  if (!member.primary_instructor_id) {
    return member
  }

  const { data: instructor } = await supabase
    .from('instructors')
    .select('id, name')
    .eq('id', member.primary_instructor_id)
    .maybeSingle()

  if (!instructor) return member

  return {
    ...member,
    primary_instructor: instructor,
  }
}

export async function getMemberForCurrentUser(): Promise<Member | null> {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) return null

  const linked = await fetchLinkedMemberRow(supabase, authUser.id)
  if (linked) return linked

  // RLS 정책 미적용 환경 — 본인 auth id와 일치하는 행만 service role로 조회
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/admin')
    const admin = createServiceRoleClient()
    return await fetchLinkedMemberRow(admin, authUser.id)
  } catch {
    return null
  }
}

export async function linkMemberToAuthUser(
  memberId: string,
  authUserId: string,
): Promise<{ error?: string }> {
  await requireRole(['admin'])

  const supabase = await createClient()

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'member' satisfies ProfileRole })
    .eq('id', authUserId)

  if (profileError) {
    console.error('linkMemberToAuthUser profile:', profileError)
  }

  const { error } = await supabase
    .from('members')
    .update({
      auth_user_id: authUserId,
      user_id: authUserId,
    })
    .eq('id', memberId)

  if (error) {
    return { error: error.message }
  }

  return {}
}

export async function setPasswordAfterInvite(
  _prevState: { error?: string } | null,
  formData: FormData,
) {
  const password = formData.get('password') as string
  const passwordConfirm = formData.get('password_confirm') as string

  if (!password || password.length < 8) {
    return { error: '비밀번호는 8자 이상이어야 합니다.' }
  }
  if (password !== passwordConfirm) {
    return { error: '비밀번호가 일치하지 않습니다.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard/my')
}

export async function createMemberAuthAccount(
  memberId: string,
  email: string,
  password: string,
  fullName: string,
): Promise<{ userId?: string; error?: string }> {
  await requireRole(['admin'])

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: 'member',
      },
    },
  })

  if (error || !data.user) {
    return { error: error?.message ?? '계정 생성에 실패했습니다.' }
  }

  const linkResult = await linkMemberToAuthUser(memberId, data.user.id)
  if (linkResult.error) return { error: linkResult.error }

  return { userId: data.user.id }
}

export async function createAdminUser(
  email: string,
  password: string,
  fullName: string,
) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: 'admin',
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { data }
}
