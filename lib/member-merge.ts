import 'server-only'

import type { createServiceRoleClient } from '@/lib/supabase/admin'

const MEMBER_FK_TABLES = [
  'session_packages',
  'lessons',
  'lesson_sessions',
  'session_transactions',
  'member_body_records',
  'signatures',
] as const

const MERGE_SCALAR_FIELDS = [
  'phone',
  'parent_phone',
  'birth_date',
  'age',
  'grade',
  'school',
  'sport',
  'height_cm',
  'weight_kg',
  'bmi',
  'goal',
  'injury_history',
  'kakao_id',
  'instagram_id',
  'primary_instructor_id',
  'invite_email',
] as const

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** 가입 시 자동 생성된 중복 회원 ID (대상 회원 제외) */
export async function findAuthDuplicateMemberIds(
  admin: ReturnType<typeof createServiceRoleClient>,
  authUserId: string,
  targetMemberId: string,
  email?: string | null,
): Promise<string[]> {
  const ids = new Set<string>()

  const { data: byAuth } = await admin
    .from('members')
    .select('id')
    .or(`auth_user_id.eq.${authUserId},user_id.eq.${authUserId}`)
    .is('deleted_at', null)
    .neq('id', targetMemberId)

  for (const row of byAuth ?? []) {
    ids.add(row.id as string)
  }

  const normalizedEmail = email?.trim() ? normalizeEmail(email) : ''
  if (normalizedEmail) {
    const { data: byInvite } = await admin
      .from('members')
      .select('id')
      .ilike('invite_email', normalizedEmail)
      .is('deleted_at', null)
      .neq('id', targetMemberId)

    for (const row of byInvite ?? []) {
      ids.add(row.id as string)
    }
  }

  return [...ids]
}

function pickMergePatch(
  keep: Record<string, unknown>,
  discard: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  for (const field of MERGE_SCALAR_FIELDS) {
    const keepValue = keep[field]
    const discardValue = discard[field]
    const keepEmpty =
      keepValue === null ||
      keepValue === undefined ||
      (typeof keepValue === 'string' && !keepValue.trim())
    if (keepEmpty && discardValue != null && discardValue !== '') {
      patch[field] = discardValue
    }
  }

  const discardMemo =
    typeof discard.memo === 'string' ? discard.memo.trim() : ''
  if (discardMemo) {
    const keepMemo = typeof keep.memo === 'string' ? keep.memo.trim() : ''
    const stamp = new Date().toLocaleString('ko-KR')
    patch.memo = keepMemo
      ? `${keepMemo}\n[프로필 통합 ${stamp}] ${discardMemo}`
      : `[프로필 통합 ${stamp}] ${discardMemo}`
  }

  return patch
}

/** 중복 회원 데이터를 대상 회원으로 합치고 중복 행은 휴지통 처리 */
export async function mergeMemberIntoTarget(
  admin: ReturnType<typeof createServiceRoleClient>,
  keepMemberId: string,
  discardMemberId: string,
): Promise<{ error?: string; merged?: boolean }> {
  if (keepMemberId === discardMemberId) {
    return { merged: false }
  }

  const { data: keep, error: keepError } = await admin
    .from('members')
    .select('*')
    .eq('id', keepMemberId)
    .is('deleted_at', null)
    .maybeSingle()

  if (keepError) return { error: keepError.message }
  if (!keep) return { error: '통합 대상 회원을 찾을 수 없습니다.' }

  const { data: discard, error: discardError } = await admin
    .from('members')
    .select('*')
    .eq('id', discardMemberId)
    .is('deleted_at', null)
    .maybeSingle()

  if (discardError) return { error: discardError.message }
  if (!discard) return { merged: false }

  for (const table of MEMBER_FK_TABLES) {
    const { error } = await admin
      .from(table)
      .update({ member_id: keepMemberId })
      .eq('member_id', discardMemberId)

    if (error) {
      const message = error.message?.toLowerCase() ?? ''
      const missingTable =
        error.code === 'PGRST204' ||
        error.code === '42P01' ||
        message.includes('does not exist') ||
        message.includes('schema cache')
      if (!missingTable) {
        return { error: `${table} 통합 실패: ${error.message}` }
      }
    }
  }

  const patch = pickMergePatch(
    keep as Record<string, unknown>,
    discard as Record<string, unknown>,
  )
  if (Object.keys(patch).length > 0) {
    const { error: patchError } = await admin
      .from('members')
      .update(patch)
      .eq('id', keepMemberId)
    if (patchError) {
      return { error: `회원 정보 통합 실패: ${patchError.message}` }
    }
  }

  const { error: discardUpdateError } = await admin
    .from('members')
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
      auth_user_id: null,
      user_id: null,
      member_login_enabled: false,
      memo: `[통합됨 → ${keep.name}] ${typeof discard.memo === 'string' ? discard.memo : ''}`.trim(),
    })
    .eq('id', discardMemberId)

  if (discardUpdateError) {
    return { error: `중복 회원 정리 실패: ${discardUpdateError.message}` }
  }

  try {
    await admin.rpc('sync_member_remaining_sessions', {
      p_member_id: keepMemberId,
    })
  } catch {
    /* optional RPC */
  }

  return { merged: true }
}

export async function mergeAuthDuplicateMembersIntoTarget(
  admin: ReturnType<typeof createServiceRoleClient>,
  authUserId: string,
  targetMemberId: string,
  email?: string | null,
): Promise<{ error?: string; mergedCount: number }> {
  const duplicateIds = await findAuthDuplicateMemberIds(
    admin,
    authUserId,
    targetMemberId,
    email,
  )

  let mergedCount = 0
  for (const duplicateId of duplicateIds) {
    const result = await mergeMemberIntoTarget(admin, targetMemberId, duplicateId)
    if (result.error) return { error: result.error, mergedCount }
    if (result.merged) mergedCount += 1
  }

  return { mergedCount }
}
