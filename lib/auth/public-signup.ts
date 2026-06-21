import 'server-only'

import { appRoleToProfileRole } from '@/lib/roles'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { upsertUserProfile } from '@/lib/profiles-admin'
import {
  parseRequiredEmail,
} from '@/lib/auth-email'
import {
  parseBirthDateSlash,
  resolveMemberAgeAndBirthDate,
} from '@/lib/member-utils'
import { formatKoreanPhoneInput } from '@/lib/phone-format'

export type PublicSignUpMemberType = 'student' | 'adult'
export type PublicSignUpRole = 'member'

type SignupPhoneResult =
  | { ok: true; phone: string }
  | { ok: false; error: string }

function normalizeSignupPhone(value: string, label: string): SignupPhoneResult {
  const trimmed = value.trim()
  if (!trimmed) {
    return { ok: false, error: `${label}을(를) 입력해주세요.` }
  }
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 11) {
    return { ok: false, error: `${label} 형식이 올바르지 않습니다.` }
  }
  return { ok: true, phone: formatKoreanPhoneInput(trimmed) }
}

async function createSignupMemberProfile(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  payload: {
    name: string
    email: string
    birth_date: string
    phone: string
    parent_phone: string
    member_type: PublicSignUpMemberType
  },
): Promise<{ memberId?: string; error?: string }> {
  const { birth_date, age } = resolveMemberAgeAndBirthDate(payload.birth_date)
  const typeLabel = payload.member_type === 'student' ? '학생' : '성인'

  const { data, error } = await admin
    .from('members')
    .insert({
      name: payload.name,
      birth_date,
      age,
      phone: payload.phone,
      parent_phone: payload.parent_phone || null,
      auth_user_id: userId,
      invite_email: payload.email,
      is_active: true,
      memo: `로그인 화면 가입 신청 (${typeLabel}, 승인 대기)`,
    })
    .select('id')
    .single()

  if (error) {
    console.error('createSignupMemberProfile:', error)
    return { error: `회원 정보 저장 실패: ${error.message}` }
  }

  return { memberId: data.id as string }
}

export async function executePublicSignup(
  formData: FormData,
): Promise<{ error?: string; success?: boolean; loginIdentifier?: string }> {
  try {
    return await runPublicSignup(formData)
  } catch (error) {
    console.error('executePublicSignup:', error)
    const message =
      error instanceof Error ? error.message : '가입 처리 중 오류가 발생했습니다.'
    return { error: message }
  }
}

async function runPublicSignup(
  formData: FormData,
): Promise<{ error?: string; success?: boolean; loginIdentifier?: string }> {
  const fullName = (formData.get('full_name') as string)?.trim()
  const password = formData.get('password') as string
  const passwordConfirm = formData.get('password_confirm') as string
  const requestedRole = (formData.get('role') as PublicSignUpRole) || 'member'
  const birthDateRaw = (formData.get('birth_date') as string)?.trim() ?? ''
  const birth_date = birthDateRaw.includes('-')
    ? birthDateRaw
    : parseBirthDateSlash(birthDateRaw)
  const phoneResult = normalizeSignupPhone(
    (formData.get('phone') as string) ?? '',
    '개인 연락처',
  )
  const memberType =
    (formData.get('member_type') as PublicSignUpMemberType) || 'student'
  const isStudent = memberType === 'student'
  const parentPhoneRaw = (formData.get('parent_phone') as string) ?? ''

  if (!fullName || fullName.length < 2) {
    return { error: '이름을 2자 이상 입력해주세요.' }
  }

  if (!birth_date) {
    return { error: '생년월일을 yymmdd 형식(6자리)으로 입력해주세요.' }
  }

  if (!phoneResult.ok) return { error: phoneResult.error }

  let parent_phone = ''
  if (isStudent) {
    const parentPhoneResult = normalizeSignupPhone(
      parentPhoneRaw,
      '보호자 연락처',
    )
    if (!parentPhoneResult.ok) return { error: parentPhoneResult.error }
    parent_phone = parentPhoneResult.phone
  } else if (parentPhoneRaw.trim()) {
    const parentPhoneResult = normalizeSignupPhone(
      parentPhoneRaw,
      '보호자 연락처',
    )
    if (!parentPhoneResult.ok) return { error: parentPhoneResult.error }
    parent_phone = parentPhoneResult.phone
  }

  if (memberType !== 'student' && memberType !== 'adult') {
    return { error: '회원 유형을 선택해주세요.' }
  }

  const phone = phoneResult.phone

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

  let admin: ReturnType<typeof createServiceRoleClient>
  try {
    admin = createServiceRoleClient()
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
        birth_date,
        phone,
        parent_phone,
        member_type: memberType,
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

  const memberResult = await createSignupMemberProfile(admin, userId, {
    name: fullName,
    email: authEmail,
    birth_date,
    phone,
    parent_phone,
    member_type: memberType,
  })
  if (memberResult.error) {
    return { error: memberResult.error }
  }

  if (memberResult.memberId) {
    try {
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          full_name: fullName,
          role: requestedRole,
          approval_status: 'pending',
          birth_date,
          phone,
          parent_phone,
          member_type: memberType,
          signup_member_id: memberResult.memberId,
        },
      })
    } catch (e) {
      console.error('executePublicSignup signup_member_id metadata:', e)
    }
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
    console.error('executePublicSignup users upsert:', usersError)
  }

  return { success: true, loginIdentifier: authEmail }
}
