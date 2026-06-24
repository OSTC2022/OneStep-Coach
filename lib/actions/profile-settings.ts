'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getMemberForCurrentUser, requireAuth } from '@/lib/actions/auth'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import { formatKoreanPhoneInput } from '@/lib/phone-format'
import { normalizeMemberGender } from '@/lib/running-league/ranking-gender'
import type { MemberGender } from '@/lib/running-league/ranking-gender'
import type { UserRole } from '@/lib/types'

const PROFILE_SETTINGS_SELECT =
  'full_name, avatar_url, phone, kakao_id, instagram_id, email, role'

function toLegacyUsersRole(role: UserRole) {
  if (role === 'admin') return 'admin'
  if (role === 'instructor') return 'instructor'
  return 'member'
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
}

async function syncContactToLinkedRecords(
  userId: string,
  contact: {
    phone: string | null
    kakao_id: string | null
    instagram_id: string | null
    gender?: MemberGender | null
  },
) {
  const supabase = await createClient()

  const memberPatch: Record<string, string | null> = {
    phone: contact.phone,
    kakao_id: contact.kakao_id,
    instagram_id: contact.instagram_id,
  }
  if (contact.gender !== undefined) {
    memberPatch.gender = contact.gender
  }

  await supabase
    .from('members')
    .update(memberPatch)
    .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)

  try {
    const admin = createServiceRoleClient()
    await admin
      .from('instructors')
      .update({
        phone: contact.phone,
        kakao_id: contact.kakao_id,
        instagram_id: contact.instagram_id,
      })
      .eq('user_id', userId)
  } catch {
    /* service role 없으면 instructors 동기화 생략 */
  }
}

export type MyProfileSettings = {
  full_name: string
  email: string | null
  role: UserRole
  avatar_url: string | null
  phone: string
  kakao_id: string
  instagram_id: string
  gender: MemberGender | null
}

export async function getMyProfileSettings(): Promise<MyProfileSettings | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select(PROFILE_SETTINGS_SELECT)
    .eq('id', user.id)
    .maybeSingle()

  let phone = profile?.phone ?? user.phone ?? ''
  let kakaoId = profile?.kakao_id ?? user.kakao_id ?? ''
  let instagramId = profile?.instagram_id ?? user.instagram_id ?? ''
  let gender: MemberGender | null = null

  const member = await getMemberForCurrentUser()
  if (member) {
    phone = phone || member.phone || ''
    kakaoId = kakaoId || member.kakao_id || ''
    instagramId = instagramId || member.instagram_id || ''
    gender = normalizeMemberGender(member.gender)
  }

  return {
    full_name: profile?.full_name ?? user.full_name ?? '',
    email: user.email,
    role: user.role,
    avatar_url: profile?.avatar_url ?? user.avatar_url ?? null,
    phone,
    kakao_id: kakaoId,
    instagram_id: instagramId,
    gender,
  }
}

export async function updateMyProfile(input: {
  full_name: string
  avatar_url?: string | null
  phone?: string
  kakao_id?: string
  instagram_id?: string
  gender?: MemberGender | null
}): Promise<{ error?: string }> {
  const user = await requireAuth()
  const fullName = input.full_name.trim()
  const phone = normalizeOptionalText(
    input.phone ? formatKoreanPhoneInput(input.phone) : null,
  )
  const kakaoId = normalizeOptionalText(input.kakao_id)
  const instagramId = normalizeOptionalText(input.instagram_id)
  const gender =
    input.gender === undefined ? undefined : normalizeMemberGender(input.gender)
  const avatarUrl =
    input.avatar_url === undefined
      ? undefined
      : normalizeOptionalText(input.avatar_url ?? null)

  if (!fullName) {
    return { error: '이름을 입력해주세요.' }
  }

  if (user.role === 'adult_member') {
    const resolvedGender = normalizeMemberGender(input.gender)
    if (!resolvedGender) {
      return { error: '성별을 선택해주세요.' }
    }
  }

  const genderToSync =
    user.role === 'adult_member'
      ? normalizeMemberGender(input.gender)
      : gender

  if (fullName.length > 40) {
    return { error: '이름은 40자 이내로 입력해주세요.' }
  }

  if (kakaoId && kakaoId.length > 80) {
    return { error: '카카오톡 아이디는 80자 이내로 입력해주세요.' }
  }

  if (instagramId && instagramId.length > 80) {
    return { error: '인스타그램 아이디는 80자 이내로 입력해주세요.' }
  }

  const supabase = await createClient()
  const updatePayload: Record<string, string | null> = {
    full_name: fullName,
    phone,
    kakao_id: kakaoId,
    instagram_id: instagramId,
    updated_at: new Date().toISOString(),
  }

  if (avatarUrl !== undefined) {
    updatePayload.avatar_url = avatarUrl
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', user.id)

  if (profileError) {
    return { error: profileError.message }
  }

  await syncContactToLinkedRecords(user.id, {
    phone,
    kakao_id: kakaoId,
    instagram_id: instagramId,
    ...(genderToSync !== undefined ? { gender: genderToSync } : {}),
  })

  await supabase.from('users').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: fullName,
      role: toLegacyUsersRole(user.role),
    },
    { onConflict: 'id' },
  )

  try {
    const admin = createServiceRoleClient()
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        full_name: fullName,
        role: user.role,
        ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
      },
    })

    if (isProtectedAdminAccount(user.email)) {
      await admin.from('profiles').update({ role: 'admin' }).eq('id', user.id)
      await admin.from('users').upsert(
        {
          id: user.id,
          email: user.email,
          full_name: fullName,
          role: 'admin',
        },
        { onConflict: 'id' },
      )
    }
  } catch {
    /* service role 없으면 profiles만 갱신 */
  }

  revalidatePath('/dashboard/profile', 'page')
  revalidatePath('/dashboard/my/profile', 'page')
  revalidatePath('/dashboard/my', 'page')
  revalidatePath('/dashboard', 'layout')
  return { success: true as const }
}
