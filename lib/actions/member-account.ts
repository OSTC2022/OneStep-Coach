'use server'

import { revalidatePath } from 'next/cache'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createAuthEmailClient } from '@/lib/supabase/auth-email-client'
import {
  getInviteEmailRedirectUrl,
  getRecoveryEmailRedirectUrl,
  getSiteUrl,
} from '@/lib/site-url'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import { getCurrentUser } from './auth'

const INVITE_SUCCESS =
  '초대 메일을 보냈습니다. 회원이 이메일에서 링크를 눌러 비밀번호를 설정하면 앱에 로그인할 수 있습니다.'

const INVITE_RESEND_SUCCESS =
  '등록된 이메일로 비밀번호 설정 링크를 다시 보냈습니다. 메일함(스팸함)을 확인해주세요.'

const INVITE_MANUAL_LINK_SUCCESS =
  '자동 메일 발송에 실패했습니다. 아래 링크를 회원에게 직접 보내주세요. (유효 시간이 제한됩니다)'

const INVITE_FAILURE =
  '초대 메일 발송에 실패했습니다. 이메일 주소와 Supabase Auth 설정을 확인해주세요.'

function formatInviteError(message?: string): string {
  const lower = message?.toLowerCase() ?? ''
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return (
      'Supabase 이메일 발송 한도를 초과했습니다. ' +
      '약 1시간 후 다시 시도하거나, Authentication → SMTP Settings에서 Custom SMTP를 설정해주세요. ' +
      '계정이 이미 연결되어 있다면 회원에게 비밀번호 재설정 메일을 보내거나, 이전에 받은 초대 메일 링크를 사용할 수 있습니다.'
    )
  }
  if (lower.includes('invalid') && lower.includes('redirect')) {
    return (
      'Redirect URL이 Supabase에 등록되지 않았습니다. ' +
      'Authentication → URL Configuration에 /auth/callback, /auth/callback/hash 를 추가해주세요.'
    )
  }
  if (
    lower.includes('recovery email') ||
    lower.includes('magic link') ||
    lower.includes('sending recovery') ||
    lower.includes('unexpected_failure')
  ) {
    return (
      '메일 발송에 실패했습니다. Supabase Dashboard → Authentication → Email에서 SMTP를 설정했는지 확인하고, ' +
      '기본 SMTP는 시간당 발송 한도가 매우 낮습니다. 잠시 후 다시 시도해주세요.'
    )
  }
  if (message) {
    return `${INVITE_FAILURE} (${message})`
  }
  return INVITE_FAILURE
}

const MISSING_SERVICE_ROLE =
  'SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. Supabase Dashboard > Settings > API에서 service_role 키를 .env.local에 추가한 뒤 dev 서버를 재시작해주세요.'

function getAdminEnvError(): string | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return 'NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.'
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return MISSING_SERVICE_ROLE
  }
  return null
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isAlreadyRegisteredError(message: string) {
  const lower = message.toLowerCase()
  return (
    lower.includes('already') ||
    lower.includes('registered') ||
    lower.includes('exists')
  )
}

async function listAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<{ id: string; email: string | undefined } | null> {
  let page = 1
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error || !data.users.length) break

    const found = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    )
    if (found) {
      return { id: found.id, email: found.email }
    }

    if (!data.nextPage) break
    page = data.nextPage
  }

  return null
}

/** Auth 삭제 후 남은 profiles/users·members 연결 정리 */
async function cleanupOrphanRecordsByEmail(email: string) {
  const admin = createAdminClient()
  const authUser = await listAuthUserByEmail(admin, email)

  const { data: profiles } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)

  for (const row of profiles ?? []) {
    if (authUser?.id === row.id) continue

    const { data: authCheck } = await admin.auth.admin.getUserById(row.id)
    if (authCheck.user) continue

    await admin
      .from('members')
      .update({ auth_user_id: null, user_id: null })
      .or(`auth_user_id.eq.${row.id},user_id.eq.${row.id}`)

    await admin.from('profiles').delete().eq('id', row.id)
    await admin.from('users').delete().eq('id', row.id)
  }

  if (!authUser) {
    await admin
      .from('members')
      .update({ auth_user_id: null, user_id: null })
      .eq('invite_email', email)
  }
}

async function clearStaleMemberAuthLink(memberId: string) {
  const admin = createAdminClient()
  const { data: member } = await admin
    .from('members')
    .select('auth_user_id, user_id')
    .eq('id', memberId)
    .maybeSingle()

  const linkedId = member?.auth_user_id ?? member?.user_id
  if (!linkedId) return

  const { data: authCheck } = await admin.auth.admin.getUserById(linkedId)
  if (authCheck.user) return

  await admin
    .from('members')
    .update({ auth_user_id: null, user_id: null })
    .eq('id', memberId)
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient()
  const authUser = await listAuthUserByEmail(admin, email)
  return authUser?.id ?? null
}

async function sendInviteEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  memberName: string,
  memberId: string,
  redirectTo: string,
) {
  return admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      full_name: memberName,
      role: 'member',
      member_id: memberId,
    },
  })
}

type MemberInviteSendResult = {
  userId: string | null
  sent: boolean
  resent: boolean
  manualLink?: string | null
  error?: { message?: string } | null
}

function extractActionLink(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const props = record.properties
  if (props && typeof props === 'object') {
    const link = (props as Record<string, unknown>).action_link
    if (typeof link === 'string' && link.length > 0) return link
  }
  const direct = record.action_link
  if (typeof direct === 'string' && direct.length > 0) return direct
  return null
}

/** SMTP 실패 시 관리자가 직접 전달할 수 있는 일회성 링크 */
async function generateManualAuthLink(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  memberName: string,
  memberId: string,
  siteUrl: string,
): Promise<string | null> {
  const attempts: {
    type: 'recovery' | 'magiclink' | 'invite'
    redirectTo: string
  }[] = [
    { type: 'recovery', redirectTo: getRecoveryEmailRedirectUrl(siteUrl) },
    { type: 'magiclink', redirectTo: getRecoveryEmailRedirectUrl(siteUrl) },
    { type: 'invite', redirectTo: getInviteEmailRedirectUrl(siteUrl) },
  ]

  for (const attempt of attempts) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: attempt.type,
      email,
      options: {
        redirectTo: attempt.redirectTo,
        ...(attempt.type === 'invite'
          ? {
              data: {
                full_name: memberName,
                role: 'member',
                member_id: memberId,
              },
            }
          : {}),
      },
    })
    if (error) continue
    const link = extractActionLink(data)
    if (link) return link
  }

  return null
}

/** 기존 계정: 비밀번호 재설정 또는 매직링크 (anon 클라이언트) */
async function sendExistingUserLoginEmail(
  email: string,
  siteUrl: string,
): Promise<{ sent: boolean; error?: { message?: string } | null }> {
  const anon = createAuthEmailClient()
  const recoveryRedirect = getRecoveryEmailRedirectUrl(siteUrl)

  const { error: recoveryError } = await anon.auth.resetPasswordForEmail(email, {
    redirectTo: recoveryRedirect,
  })
  if (!recoveryError) {
    return { sent: true }
  }

  const { error: otpError } = await anon.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: recoveryRedirect,
      shouldCreateUser: false,
    },
  })
  if (!otpError) {
    return { sent: true }
  }

  return { sent: false, error: otpError ?? recoveryError }
}

/** 신규는 초대 메일, 이미 등록된 이메일은 초대 재시도 후 비밀번호/매직링크 재발송 */
async function sendMemberInviteEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  memberName: string,
  memberId: string,
  inviteRedirectTo: string,
  siteUrl: string,
): Promise<MemberInviteSendResult> {
  const existingUserId = await findAuthUserIdByEmail(email)

  const invite = await sendInviteEmail(
    admin,
    email,
    memberName,
    memberId,
    inviteRedirectTo,
  )

  if (!invite.error) {
    return {
      userId: invite.data?.user?.id ?? existingUserId,
      sent: true,
      resent: Boolean(existingUserId),
    }
  }

  const alreadyRegistered = isAlreadyRegisteredError(invite.error.message)

  if (alreadyRegistered || existingUserId) {
    const userId =
      existingUserId ?? (await findAuthUserIdByEmail(email))

    const fallback = await sendExistingUserLoginEmail(email, siteUrl)
    if (fallback.sent) {
      return {
        userId,
        sent: true,
        resent: true,
      }
    }

    const manualLink = await generateManualAuthLink(
      admin,
      email,
      memberName,
      memberId,
      siteUrl,
    )

    return {
      userId,
      sent: false,
      resent: true,
      manualLink,
      error: fallback.error ?? invite.error,
    }
  }

  const manualLink = await generateManualAuthLink(
    admin,
    email,
    memberName,
    memberId,
    siteUrl,
  )

  return {
    userId: null,
    sent: false,
    resent: false,
    manualLink,
    error: invite.error,
  }
}

async function isAuthUserLinkedToOtherMember(
  authUserId: string,
  memberId: string,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('members')
    .select('id')
    .or(`auth_user_id.eq.${authUserId},user_id.eq.${authUserId}`)
    .neq('id', memberId)
    .maybeSingle()

  return Boolean(data)
}

async function ensureMemberProfile(
  authUserId: string,
  email: string,
  fullName: string,
): Promise<{ error?: string }> {
  if (isProtectedAdminAccount(email)) {
    return {
      error:
        '관리자 계정 이메일은 회원 로그인에 사용할 수 없습니다. 회원 또는 보호자 이메일을 입력해주세요.',
    }
  }

  const admin = createAdminClient()

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: authUserId,
      email,
      full_name: fullName,
      role: 'member',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (profileError) {
    return { error: profileError.message }
  }

  // public.users CHECK allows admin | instructor | member only
  const { error: legacyError } = await admin.from('users').upsert(
    {
      id: authUserId,
      email,
      full_name: fullName,
      role: 'member',
    },
    { onConflict: 'id' },
  )

  if (legacyError) {
    return {
      error: `users 프로필 동기화 실패: ${legacyError.message}. supabase/fix-users-role-trigger.sql 을 실행해주세요.`,
    }
  }

  return {}
}

async function linkMemberRecord(
  memberId: string,
  authUserId: string,
  inviteEmail?: string,
): Promise<{ error?: string }> {
  const admin = createAdminClient()

  const { error } = await admin
    .from('members')
    .update({
      auth_user_id: authUserId,
      user_id: authUserId,
    })
    .eq('id', memberId)

  if (error) {
    return { error: error.message }
  }

  if (inviteEmail) {
    const { error: inviteEmailError } = await admin
      .from('members')
      .update({ invite_email: inviteEmail })
      .eq('id', memberId)

    if (inviteEmailError) {
      const message = inviteEmailError.message?.toLowerCase() ?? ''
      const missingColumn =
        inviteEmailError.code === 'PGRST204' ||
        message.includes('invite_email') ||
        message.includes('schema cache')
      if (!missingColumn) {
        return { error: inviteEmailError.message }
      }
    }
  }

  return {}
}

async function linkInvitedUser(
  memberId: string,
  authUserId: string,
  email: string,
  fullName: string,
  inviteEmail?: string,
): Promise<{ error?: string }> {
  const profileResult = await ensureMemberProfile(authUserId, email, fullName)
  if (profileResult.error) return profileResult

  return linkMemberRecord(memberId, authUserId, inviteEmail)
}

export async function linkExistingAuthUserToMember(
  memberId: string,
  authUserId: string,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: '로그인이 필요합니다.' }
  }
  if (user.role !== 'admin') {
    return { error: '관리자만 계정을 연결할 수 있습니다.' }
  }

  const envError = getAdminEnvError()
  if (envError) {
    return { error: envError }
  }

  const admin = createAdminClient()
  const { data: authUser, error: authError } =
    await admin.auth.admin.getUserById(authUserId)
  if (authError || !authUser.user) {
    return { error: 'auth user UUID를 찾을 수 없습니다.' }
  }

  if (isProtectedAdminAccount(authUser.user.email)) {
    return {
      error:
        '관리자 계정은 회원과 연결할 수 없습니다. 회원 전용 계정 UUID를 사용해주세요.',
    }
  }

  const linkResult = await linkInvitedUser(
    memberId,
    authUserId,
    authUser.user.email ?? '',
    authUser.user.user_metadata?.full_name ?? authUser.user.email ?? '회원',
  )
  if (!linkResult.error) {
    revalidatePath(`/dashboard/members/${memberId}`)
    revalidatePath('/dashboard/members')
  }
  return linkResult
}

export async function inviteMemberLogin(
  memberId: string,
  email: string,
  memberName: string,
): Promise<{
  userId?: string
  message?: string
  error?: string
  /** SMTP 실패 시 화면에 표시·복사용 */
  manualLink?: string
}> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: '로그인이 필요합니다.' }
  }
  if (user.role !== 'admin') {
    return { error: '관리자만 초대 메일을 보낼 수 있습니다.' }
  }

  const envError = getAdminEnvError()
  if (envError) {
    return { error: envError }
  }

  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { error: '올바른 이메일 주소를 입력해주세요.' }
  }

  if (isProtectedAdminAccount(normalizedEmail)) {
    return {
      error:
        '관리자 계정 이메일(allakj@naver.com)은 회원 초대에 사용할 수 없습니다. 회원 또는 보호자 이메일을 입력해주세요.',
    }
  }

  try {
    await clearStaleMemberAuthLink(memberId)
    await cleanupOrphanRecordsByEmail(normalizedEmail)

    const admin = createAdminClient()
    const siteUrl = getSiteUrl()
    const inviteRedirectTo = getInviteEmailRedirectUrl(siteUrl)

    const existingUserId = await findAuthUserIdByEmail(normalizedEmail)

    if (existingUserId) {
      const linkedElsewhere = await isAuthUserLinkedToOtherMember(
        existingUserId,
        memberId,
      )
      if (linkedElsewhere) {
        return {
          error:
            '이 이메일은 다른 회원에 연결된 계정입니다. Supabase Authentication에서 해당 사용자를 확인하거나 다른 이메일을 사용해주세요.',
        }
      }
    }

    const sendResult = await sendMemberInviteEmail(
      admin,
      normalizedEmail,
      memberName,
      memberId,
      inviteRedirectTo,
      siteUrl,
    )

    let authUserId =
      sendResult.userId ?? existingUserId ?? (await findAuthUserIdByEmail(normalizedEmail))

    let manualLink = sendResult.manualLink ?? null

    if (!sendResult.sent) {
      if (!authUserId) {
        authUserId = await findAuthUserIdByEmail(normalizedEmail)
      }

      if (!manualLink && authUserId) {
        manualLink = await generateManualAuthLink(
          admin,
          normalizedEmail,
          memberName,
          memberId,
          siteUrl,
        )
      }

      if (!authUserId && !manualLink) {
        console.error('inviteMemberLogin:', sendResult.error)
        return {
          error: sendResult.error
            ? formatInviteError(sendResult.error.message)
            : '계정을 찾을 수 없습니다. Supabase Authentication > Users에서 확인해주세요.',
        }
      }

      if (!authUserId && manualLink) {
        return {
          error:
            'Auth 계정이 없어 연결할 수 없습니다. Supabase에서 사용자를 만든 뒤 UUID로 연결하거나 SMTP 설정 후 다시 초대해주세요.',
          manualLink,
        }
      }
    }

    if (!authUserId) {
      return { error: '계정을 찾을 수 없습니다. 잠시 후 다시 시도해주세요.' }
    }

    const linkResult = await linkInvitedUser(
      memberId,
      authUserId,
      normalizedEmail,
      memberName,
      normalizedEmail,
    )
    if (linkResult.error) {
      return { error: linkResult.error }
    }

    revalidatePath(`/dashboard/members/${memberId}`)
    revalidatePath('/dashboard/members')

    if (manualLink) {
      return {
        userId: authUserId,
        message: INVITE_MANUAL_LINK_SUCCESS,
        manualLink,
      }
    }

    return {
      userId: authUserId,
      message: sendResult.resent ? INVITE_RESEND_SUCCESS : INVITE_SUCCESS,
    }
  } catch (err) {
    if (isRedirectError(err)) {
      throw err
    }
    console.error('inviteMemberLogin unexpected:', err)
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return { error: MISSING_SERVICE_ROLE }
    }
    return {
      error: message.includes('must be set')
        ? MISSING_SERVICE_ROLE
        : formatInviteError(message),
    }
  }
}

export async function searchAuthProfiles(query: string) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return []
  }
  const supabase = await createClient()
  const q = query.trim()
  if (!q) return []

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
    .limit(10)

  return data ?? []
}

export type MemberAccountEmailInfo = {
  email: string | null
  source: 'auth' | 'invite' | null
}

/** 연결된 auth 계정 또는 초대 이메일 조회 */
export async function getMemberAccountEmail(
  memberId: string,
): Promise<MemberAccountEmailInfo> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return { email: null, source: null }
  }

  const envError = getAdminEnvError()
  if (envError) {
    return { email: null, source: null }
  }

  try {
    const admin = createAdminClient()
    const { data: member } = await admin
      .from('members')
      .select('auth_user_id, user_id, invite_email')
      .eq('id', memberId)
      .maybeSingle()

    if (!member) return { email: null, source: null }

    const linkedId = member.auth_user_id ?? member.user_id
    if (linkedId) {
      const { data: authData } = await admin.auth.admin.getUserById(linkedId)
      const authEmail = authData.user?.email?.trim()
      if (authEmail && !isProtectedAdminAccount(authEmail)) {
        return { email: authEmail, source: 'auth' }
      }
    }

    const inviteEmail = member.invite_email?.trim()
    if (inviteEmail && !isProtectedAdminAccount(inviteEmail)) {
      return { email: inviteEmail, source: 'invite' }
    }

    return { email: null, source: null }
  } catch {
    return { email: null, source: null }
  }
}
