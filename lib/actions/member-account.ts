'use server'

import { revalidatePath } from 'next/cache'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site-url'
import { getCurrentUser } from './auth'

const INVITE_SUCCESS =
  '초대 메일을 보냈습니다. 회원이 이메일에서 링크를 눌러 비밀번호를 설정하면 앱에 로그인할 수 있습니다.'

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
      'Authentication → URL Configuration에 /auth/callback/hash 등을 추가해주세요.'
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
): Promise<{ userId?: string; message?: string; error?: string }> {
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

  try {
    await clearStaleMemberAuthLink(memberId)
    await cleanupOrphanRecordsByEmail(normalizedEmail)

    const admin = createAdminClient()
    const siteUrl = getSiteUrl()
    const redirectTo = `${siteUrl}/auth/callback/hash?next=${encodeURIComponent('/auth/set-password')}`

    let existingUserId = await findAuthUserIdByEmail(normalizedEmail)

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

      const { data: resendData, error: resendError } = await sendInviteEmail(
        admin,
        normalizedEmail,
        memberName,
        memberId,
        redirectTo,
      )

      const authUserId = resendData?.user?.id ?? existingUserId

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

      if (!resendError) {
        return { userId: authUserId, message: INVITE_SUCCESS }
      }

      if (isAlreadyRegisteredError(resendError.message)) {
        return {
          userId: authUserId,
          message:
            '이미 Auth에 등록된 이메일입니다. 회원 계정과 연결했습니다. 비밀번호를 잊었다면 로그인 화면에서 비밀번호 재설정을 이용해주세요.',
        }
      }

      return {
        userId: authUserId,
        error: formatInviteError(resendError.message),
      }
    }

    let { data, error } = await sendInviteEmail(
      admin,
      normalizedEmail,
      memberName,
      memberId,
      redirectTo,
    )

    if ((error || !data.user) && isAlreadyRegisteredError(error?.message ?? '')) {
      await cleanupOrphanRecordsByEmail(normalizedEmail)
      existingUserId = await findAuthUserIdByEmail(normalizedEmail)

      if (existingUserId) {
        const linkedElsewhere = await isAuthUserLinkedToOtherMember(
          existingUserId,
          memberId,
        )
        if (!linkedElsewhere) {
          const retry = await sendInviteEmail(
            admin,
            normalizedEmail,
            memberName,
            memberId,
            redirectTo,
          )
          data = retry.data
          error = retry.error
        }
      } else {
        return {
          error:
            'Supabase Auth에 이메일이 남아 있는 것 같습니다. Dashboard > Authentication > Users에서 완전히 삭제한 뒤 1–2분 후 다시 시도해주세요.',
        }
      }
    }

    if (error || !data?.user) {
      console.error('inviteMemberLogin:', error)
      return { error: formatInviteError(error?.message) }
    }

    const linkResult = await linkInvitedUser(
      memberId,
      data.user.id,
      normalizedEmail,
      memberName,
      normalizedEmail,
    )
    if (linkResult.error) {
      return { error: linkResult.error }
    }

    revalidatePath(`/dashboard/members/${memberId}`)
    revalidatePath('/dashboard/members')

    return { userId: data.user.id, message: INVITE_SUCCESS }
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
