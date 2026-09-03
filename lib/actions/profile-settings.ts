'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getMemberForCurrentUser, requireAuth } from '@/lib/actions/auth'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import { formatKoreanPhoneInput } from '@/lib/phone-format'
import { normalizeMemberGender } from '@/lib/running-league/ranking-gender'
import type { MemberGender } from '@/lib/running-league/ranking-gender'
import {
  normalizeRankingStatusMessage,
  normalizeRankingStatusMessageColor,
  RANKING_STATUS_MESSAGE_MAX_LENGTH,
} from '@/lib/running-league/ranking-status-message'
import type { UserRole } from '@/lib/types'
import { CENTER_PORTAL_RANKINGS_CACHE_TAG } from '@/lib/running-league/center-portal-rankings-data'

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
    ranking_status_message?: string | null
    ranking_status_message_color?: string | null
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
  if (contact.ranking_status_message !== undefined) {
    memberPatch.ranking_status_message = contact.ranking_status_message
  }
  if (contact.ranking_status_message_color !== undefined) {
    memberPatch.ranking_status_message_color = contact.ranking_status_message_color
  }

  let memberUpdate = await supabase
    .from('members')
    .update(memberPatch)
    .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)

  if (
    memberUpdate.error &&
    memberPatch.ranking_status_message_color !== undefined &&
    memberUpdate.error.code === '42703' &&
    memberUpdate.error.message?.includes('ranking_status_message_color')
  ) {
    const { ranking_status_message_color: _color, ...patchWithoutColor } = memberPatch
    memberUpdate = await supabase
      .from('members')
      .update(patchWithoutColor)
      .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)
  }

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
  ranking_status_message: string
  ranking_status_message_color: string
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
  let rankingStatusMessage = ''
  let rankingStatusMessageColor = ''

  const member = await getMemberForCurrentUser()
  if (member) {
    phone = phone || member.phone || ''
    kakaoId = kakaoId || member.kakao_id || ''
    instagramId = instagramId || member.instagram_id || ''
    gender = normalizeMemberGender(member.gender)
    rankingStatusMessage = member.ranking_status_message ?? ''
    rankingStatusMessageColor = normalizeRankingStatusMessageColor(
      member.ranking_status_message_color,
    )
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
    ranking_status_message: rankingStatusMessage,
    ranking_status_message_color: rankingStatusMessageColor,
  }
}

export async function updateMyProfile(input: {
  full_name: string
  avatar_url?: string | null
  phone?: string
  kakao_id?: string
  instagram_id?: string
  gender?: MemberGender | null
  ranking_status_message?: string
  ranking_status_message_color?: string
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

  const rankingStatusMessage =
    input.ranking_status_message === undefined
      ? undefined
      : normalizeRankingStatusMessage(input.ranking_status_message)
  const rankingStatusMessageColor =
    input.ranking_status_message_color === undefined
      ? undefined
      : normalizeRankingStatusMessageColor(input.ranking_status_message_color)

  if (
    input.ranking_status_message !== undefined &&
    input.ranking_status_message.trim().length > RANKING_STATUS_MESSAGE_MAX_LENGTH
  ) {
    return { error: `상태 메시지는 ${RANKING_STATUS_MESSAGE_MAX_LENGTH}자 이내로 입력해주세요.` }
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
    ...(user.role === 'adult_member' && rankingStatusMessage !== undefined
      ? { ranking_status_message: rankingStatusMessage }
      : {}),
    ...(user.role === 'adult_member' && rankingStatusMessageColor !== undefined
      ? { ranking_status_message_color: rankingStatusMessageColor }
      : {}),
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
  revalidatePath('/dashboard/my/running-league', 'page')
  revalidatePath('/dashboard/settings/adult-running-portal', 'page')
  revalidatePath('/dashboard', 'layout')
  if (user.role === 'adult_member') {
    revalidateTag(CENTER_PORTAL_RANKINGS_CACHE_TAG, 'max')
  }
  return { success: true as const }
}

/** 랭킹 상태메시지만 빠르게 수정 (성인회원 육상) */
export async function updateMyRankingStatusMessage(input: {
  message: string
  color?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuth()
  if (user.role !== 'adult_member') {
    return { ok: false, error: '성인회원만 상태메시지를 설정할 수 있습니다.' }
  }

  if (input.message.trim().length > RANKING_STATUS_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: `상태 메시지는 ${RANKING_STATUS_MESSAGE_MAX_LENGTH}자 이내로 입력해주세요.`,
    }
  }

  const message = normalizeRankingStatusMessage(input.message)
  const color = normalizeRankingStatusMessageColor(input.color)

  const supabase = await createClient()
  const memberPatch: Record<string, string | null> = {
    ranking_status_message: message,
    ranking_status_message_color: color,
  }

  let memberUpdate = await supabase
    .from('members')
    .update(memberPatch)
    .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)

  if (
    memberUpdate.error &&
    memberUpdate.error.code === '42703' &&
    memberUpdate.error.message?.includes('ranking_status_message_color')
  ) {
    memberUpdate = await supabase
      .from('members')
      .update({ ranking_status_message: message })
      .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
  }

  if (memberUpdate.error) {
    return { ok: false, error: memberUpdate.error.message }
  }

  revalidatePath('/dashboard/my', 'page')
  revalidatePath('/dashboard/my/running-league', 'page')
  revalidatePath('/dashboard/running-portal', 'page')
  revalidatePath('/dashboard/my/profile', 'page')
  revalidateTag(CENTER_PORTAL_RANKINGS_CACHE_TAG, 'max')
  return { ok: true }
}

