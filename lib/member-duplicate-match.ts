import 'server-only'

import type { createServiceRoleClient } from '@/lib/supabase/admin'
import {
  birthDatesEqual,
  isStrongDuplicateReason,
  namesEqual,
  phonePartialMatch,
  phonesMatch,
  type DuplicateMatchReasonCode,
} from '@/lib/member-account-status'

export type DuplicateCandidateRow = {
  id: string
  name: string
  phone: string | null
  parent_phone: string | null
  birth_date: string | null
  remaining_sessions: number | null
  membership_status: string | null
  source_type: string | null
  account_link_status: string | null
  auth_user_id: string | null
  user_id: string | null
}

export type DuplicateMatch = {
  member: DuplicateCandidateRow
  reason: DuplicateMatchReasonCode
  reasonLabel: string
}

const REASON_PRIORITY: DuplicateMatchReasonCode[] = [
  'phone',
  'parent_phone',
  'name_birth',
  'name_phone_partial',
  'name_only',
]

function reasonRank(reason: DuplicateMatchReasonCode): number {
  return REASON_PRIORITY.indexOf(reason)
}

function matchReasonAgainst(
  incoming: {
    name: string
    phone?: string | null
    parent_phone?: string | null
    birth_date?: string | null
  },
  existing: DuplicateCandidateRow,
): DuplicateMatchReasonCode | null {
  if (phonesMatch(incoming.phone, existing.phone)) return 'phone'
  if (
    phonesMatch(incoming.phone, existing.parent_phone) ||
    phonesMatch(incoming.parent_phone, existing.phone) ||
    phonesMatch(incoming.parent_phone, existing.parent_phone)
  ) {
    return 'parent_phone'
  }
  if (
    namesEqual(incoming.name, existing.name) &&
    birthDatesEqual(incoming.birth_date, existing.birth_date)
  ) {
    return 'name_birth'
  }
  if (
    namesEqual(incoming.name, existing.name) &&
    (phonePartialMatch(incoming.phone, existing.phone) ||
      phonePartialMatch(incoming.phone, existing.parent_phone) ||
      phonePartialMatch(incoming.parent_phone, existing.phone) ||
      phonePartialMatch(incoming.parent_phone, existing.parent_phone))
  ) {
    return 'name_phone_partial'
  }
  if (namesEqual(incoming.name, existing.name)) return 'name_only'
  return null
}

/** 신규 가입자와 기존(미삭제) 회원 후보 매칭 — 자동 병합하지 않음 */
export async function findDuplicateMemberCandidates(
  admin: ReturnType<typeof createServiceRoleClient>,
  incoming: {
    name: string
    phone?: string | null
    parent_phone?: string | null
    birth_date?: string | null
    excludeMemberId?: string
  },
): Promise<DuplicateMatch[]> {
  const { data, error } = await admin
    .from('members')
    .select(
      'id, name, phone, parent_phone, birth_date, remaining_sessions, membership_status, source_type, account_link_status, auth_user_id, user_id',
    )
    .is('deleted_at', null)
    .eq('is_active', true)
    .limit(800)

  if (error) {
    // 신규 컬럼 없는 DB — 최소 컬럼으로 재시도
    const retry = await admin
      .from('members')
      .select(
        'id, name, phone, parent_phone, birth_date, remaining_sessions, auth_user_id, user_id',
      )
      .is('deleted_at', null)
      .eq('is_active', true)
      .limit(800)

    if (retry.error || !retry.data) {
      console.error('findDuplicateMemberCandidates:', error.message)
      return []
    }

    return scoreCandidates(incoming, retry.data as DuplicateCandidateRow[])
  }

  return scoreCandidates(incoming, (data ?? []) as DuplicateCandidateRow[])
}

function scoreCandidates(
  incoming: {
    name: string
    phone?: string | null
    parent_phone?: string | null
    birth_date?: string | null
    excludeMemberId?: string
  },
  rows: DuplicateCandidateRow[],
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = []

  for (const row of rows) {
    if (incoming.excludeMemberId && row.id === incoming.excludeMemberId) continue
    // 이미 로그인 계정이 있는 회원은 후보에서 제외 (다른 사람 계정일 가능성)
    if (row.auth_user_id || row.user_id) continue

    const reason = matchReasonAgainst(incoming, row)
    if (!reason) continue

    matches.push({
      member: row,
      reason,
      reasonLabel:
        reason === 'phone'
          ? '전화번호 일치'
          : reason === 'parent_phone'
            ? '보호자 전화번호 일치'
            : reason === 'name_birth'
              ? '이름+생년월일 일치'
              : reason === 'name_phone_partial'
                ? '이름+연락처 일부 일치'
                : '이름만 일치 (동명이인 가능)',
    })
  }

  matches.sort((a, b) => reasonRank(a.reason) - reasonRank(b.reason))
  return matches
}

export function pickPrimaryStrongMatch(
  matches: DuplicateMatch[],
): DuplicateMatch | null {
  const strong = matches.find((item) => isStrongDuplicateReason(item.reason))
  return strong ?? null
}

/** 회원가입 직후 신규 회원에 중복 후보 표시 (자동 병합 없음) */
export async function markSignupMemberDuplicateCandidates(
  admin: ReturnType<typeof createServiceRoleClient>,
  signupMemberId: string,
  incoming: {
    name: string
    phone?: string | null
    parent_phone?: string | null
    birth_date?: string | null
  },
): Promise<{ marked: boolean; reason?: DuplicateMatchReasonCode }> {
  const matches = await findDuplicateMemberCandidates(admin, {
    ...incoming,
    excludeMemberId: signupMemberId,
  })
  const primary = pickPrimaryStrongMatch(matches)

  if (!primary) {
    // 이름만 같은 경우는 상태 변경 없이 메모만 (선택)
    const nameOnly = matches.find((item) => item.reason === 'name_only')
    if (nameOnly) {
      await admin
        .from('members')
        .update({
          duplicate_review_note: `동명이인 가능성: ${nameOnly.member.name} (${nameOnly.member.id.slice(0, 8)}…) — 이름만 같아 자동 연결하지 않음`,
        })
        .eq('id', signupMemberId)
    }
    return { marked: false }
  }

  const groupId = crypto.randomUUID()
  const { error } = await admin
    .from('members')
    .update({
      account_link_status: 'duplicate_candidate',
      duplicate_of_member_id: primary.member.id,
      duplicate_match_reason: primary.reason,
      duplicate_group_id: groupId,
      duplicate_review_note: `${primary.reasonLabel} — 관리자 확인 필요. 이름만 같다고 자동 연결하지 않았습니다.`,
    })
    .eq('id', signupMemberId)

  if (error) {
    // 컬럼 미적용 DB는 조용히 스킵
    if (
      error.message.includes('account_link_status') ||
      error.message.includes('duplicate_of') ||
      error.code === 'PGRST204'
    ) {
      console.warn('markSignupMemberDuplicateCandidates: migration needed')
      return { marked: false }
    }
    console.error('markSignupMemberDuplicateCandidates:', error)
    return { marked: false }
  }

  return { marked: true, reason: primary.reason }
}
