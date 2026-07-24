'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/actions/auth'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { linkAuthUserToMemberRecord } from '@/lib/actions/member-account'
import { findDuplicateMemberCandidates } from '@/lib/member-duplicate-match'
import {
  ACCOUNT_LINK_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  MEMBER_SOURCE_LABELS,
  computeMembershipStatus,
  parseDuplicateMatchReason,
  resolveAccountLinkStatus,
  resolveSourceType,
  type DuplicateMatchReasonCode,
  type MemberAccountLinkStatus,
  type MemberMembershipStatus,
  type MemberSourceType,
  DUPLICATE_MATCH_REASON_LABELS,
} from '@/lib/member-account-status'

export type MemberDuplicateReviewItem = {
  signupMember: {
    id: string
    name: string
    phone: string | null
    parent_phone: string | null
    birth_date: string | null
    invite_email: string | null
    membership_status: MemberMembershipStatus
    source_type: MemberSourceType
    account_link_status: MemberAccountLinkStatus
    duplicate_match_reason: DuplicateMatchReasonCode | null
    duplicate_match_reason_label: string | null
    registered_at: string | null
  }
  existingMember: {
    id: string
    name: string
    phone: string | null
    parent_phone: string | null
    birth_date: string | null
    membership_status: MemberMembershipStatus
    remaining_sessions: number
    source_type: MemberSourceType
    account_link_status: MemberAccountLinkStatus
    last_lesson_date: string | null
  } | null
}

async function logMemberLinkEvent(input: {
  action: string
  keepMemberId?: string | null
  mergeMemberId?: string | null
  authUserId?: string | null
  matchReason?: string | null
  note?: string | null
  performedBy?: string | null
}) {
  try {
    const admin = createServiceRoleClient()
    await admin.from('member_link_events').insert({
      action: input.action,
      keep_member_id: input.keepMemberId ?? null,
      merge_member_id: input.mergeMemberId ?? null,
      auth_user_id: input.authUserId ?? null,
      match_reason: input.matchReason ?? null,
      note: input.note ?? null,
      performed_by: input.performedBy ?? null,
    })
  } catch (error) {
    console.warn('logMemberLinkEvent:', error)
  }
}

async function loadMembershipForMember(
  supabase: Awaited<ReturnType<typeof createStaffDataClient>>,
  memberId: string,
  remainingCache: number | null,
): Promise<MemberMembershipStatus> {
  const { data } = await supabase
    .from('session_packages')
    .select('remaining_sessions, expires_at, is_active, deleted_at, note, total_sessions')
    .eq('member_id', memberId)
    .is('deleted_at', null)
    .limit(40)

  return computeMembershipStatus({
    packages: data ?? [],
    remainingSessionsCache: remainingCache,
  })
}

export async function listMemberDuplicateReviews(): Promise<{
  data: MemberDuplicateReviewItem[]
  error?: string
  migrationRequired?: boolean
}> {
  await requireRole(['admin', 'instructor'])
  const supabase = await createStaffDataClient()

  const { data, error } = await supabase
    .from('members')
    .select(
      `id, name, phone, parent_phone, birth_date, invite_email, remaining_sessions,
       membership_status, source_type, account_link_status, duplicate_match_reason,
       duplicate_of_member_id, registered_at, auth_user_id, user_id, memo`,
    )
    .eq('account_link_status', 'duplicate_candidate')
    .is('deleted_at', null)
    .order('registered_at', { ascending: false })
    .limit(50)

  if (error) {
    if (
      error.message.includes('account_link_status') ||
      error.code === 'PGRST204' ||
      error.code === '42703'
    ) {
      return {
        data: [],
        migrationRequired: true,
        error:
          '중복 후보 기능을 쓰려면 supabase/add-member-duplicate-link.sql 을 실행해주세요.',
      }
    }
    return { data: [], error: error.message }
  }

  const items: MemberDuplicateReviewItem[] = []

  for (const row of data ?? []) {
    const membership = await loadMembershipForMember(
      supabase,
      row.id,
      row.remaining_sessions,
    )
    const reason = parseDuplicateMatchReason(row.duplicate_match_reason)

    let existing: MemberDuplicateReviewItem['existingMember'] = null
    if (row.duplicate_of_member_id) {
      const { data: existingRow } = await supabase
        .from('members')
        .select(
          `id, name, phone, parent_phone, birth_date, remaining_sessions,
           membership_status, source_type, account_link_status, auth_user_id, user_id`,
        )
        .eq('id', row.duplicate_of_member_id)
        .is('deleted_at', null)
        .maybeSingle()

      if (existingRow) {
        const existingMembership = await loadMembershipForMember(
          supabase,
          existingRow.id,
          existingRow.remaining_sessions,
        )
        const { data: lastLesson } = await supabase
          .from('lessons')
          .select('lesson_date')
          .eq('member_id', existingRow.id)
          .order('lesson_date', { ascending: false })
          .limit(1)
          .maybeSingle()

        existing = {
          id: existingRow.id,
          name: existingRow.name,
          phone: existingRow.phone,
          parent_phone: existingRow.parent_phone,
          birth_date: existingRow.birth_date,
          membership_status: existingMembership,
          remaining_sessions: existingRow.remaining_sessions ?? 0,
          source_type: resolveSourceType(existingRow),
          account_link_status: resolveAccountLinkStatus(existingRow),
          last_lesson_date: lastLesson?.lesson_date ?? null,
        }
      }
    }

    items.push({
      signupMember: {
        id: row.id,
        name: row.name,
        phone: row.phone,
        parent_phone: row.parent_phone,
        birth_date: row.birth_date,
        invite_email: row.invite_email,
        membership_status: membership,
        source_type: resolveSourceType(row),
        account_link_status: resolveAccountLinkStatus(row),
        duplicate_match_reason: reason,
        duplicate_match_reason_label: reason
          ? DUPLICATE_MATCH_REASON_LABELS[reason]
          : null,
        registered_at: row.registered_at,
      },
      existingMember: existing,
    })
  }

  return { data: items }
}

export async function getMemberDuplicateContext(memberId: string): Promise<{
  isCandidate: boolean
  matchReasonLabel: string | null
  existingMember: MemberDuplicateReviewItem['existingMember']
  migrationRequired?: boolean
  error?: string
}> {
  await requireRole(['admin', 'instructor'])
  const supabase = await createStaffDataClient()

  const { data: row, error } = await supabase
    .from('members')
    .select(
      `id, name, phone, parent_phone, birth_date, remaining_sessions,
       account_link_status, duplicate_match_reason, duplicate_of_member_id,
       source_type, auth_user_id, user_id, memo`,
    )
    .eq('id', memberId)
    .maybeSingle()

  if (error) {
    if (
      error.message.includes('account_link_status') ||
      error.code === 'PGRST204'
    ) {
      return {
        isCandidate: false,
        matchReasonLabel: null,
        existingMember: null,
        migrationRequired: true,
      }
    }
    return {
      isCandidate: false,
      matchReasonLabel: null,
      existingMember: null,
      error: error.message,
    }
  }

  if (!row || row.account_link_status !== 'duplicate_candidate') {
    return { isCandidate: false, matchReasonLabel: null, existingMember: null }
  }

  const reason = parseDuplicateMatchReason(row.duplicate_match_reason)
  let existing: MemberDuplicateReviewItem['existingMember'] = null

  if (row.duplicate_of_member_id) {
    const { data: existingRow } = await supabase
      .from('members')
      .select(
        `id, name, phone, parent_phone, birth_date, remaining_sessions,
         membership_status, source_type, account_link_status, auth_user_id, user_id`,
      )
      .eq('id', row.duplicate_of_member_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (existingRow) {
      const membership = await loadMembershipForMember(
        supabase,
        existingRow.id,
        existingRow.remaining_sessions,
      )
      const { data: lastLesson } = await supabase
        .from('lessons')
        .select('lesson_date')
        .eq('member_id', existingRow.id)
        .order('lesson_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      existing = {
        id: existingRow.id,
        name: existingRow.name,
        phone: existingRow.phone,
        parent_phone: existingRow.parent_phone,
        birth_date: existingRow.birth_date,
        membership_status: membership,
        remaining_sessions: existingRow.remaining_sessions ?? 0,
        source_type: resolveSourceType(existingRow),
        account_link_status: resolveAccountLinkStatus(existingRow),
        last_lesson_date: lastLesson?.lesson_date ?? null,
      }
    }
  }

  return {
    isCandidate: true,
    matchReasonLabel: reason ? DUPLICATE_MATCH_REASON_LABELS[reason] : null,
    existingMember: existing,
  }
}

/** 기존 관리자 등록 회원 ← 신규가입 로그인 계정 연결 (자동 병합 아님, 관리자 확인 후) */
export async function linkSignupMemberToExistingMember(input: {
  signupMemberId: string
  existingMemberId: string
}): Promise<{ error?: string; keepMemberId?: string }> {
  const adminUser = await requireRole(['admin'])

  if (input.signupMemberId === input.existingMemberId) {
    return { error: '같은 회원입니다.' }
  }

  const admin = createServiceRoleClient()
  const { data: signup, error: signupError } = await admin
    .from('members')
    .select('id, name, auth_user_id, user_id, duplicate_match_reason, invite_email')
    .eq('id', input.signupMemberId)
    .is('deleted_at', null)
    .maybeSingle()

  if (signupError || !signup) {
    return { error: '신규가입 회원을 찾을 수 없습니다.' }
  }

  const authUserId = signup.auth_user_id ?? signup.user_id
  if (!authUserId) {
    return { error: '신규가입 회원에 연결된 로그인 계정이 없습니다.' }
  }

  const { data: existing, error: existingError } = await admin
    .from('members')
    .select('id, name, auth_user_id, user_id')
    .eq('id', input.existingMemberId)
    .is('deleted_at', null)
    .maybeSingle()

  if (existingError || !existing) {
    return { error: '기존 회원을 찾을 수 없습니다.' }
  }

  const existingLinked = existing.auth_user_id ?? existing.user_id
  if (existingLinked && existingLinked !== authUserId) {
    return { error: '기존 회원이 이미 다른 로그인 계정과 연결되어 있습니다.' }
  }

  // 기존 회원(권한/출석/회원권 유지)에 로그인 계정 연결 + 신규 행 병합
  const linkResult = await linkAuthUserToMemberRecord(
    authUserId,
    input.existingMemberId,
  )
  if (linkResult.error) return { error: linkResult.error }

  await admin
    .from('members')
    .update({
      account_link_status: 'linked',
      source_type: 'admin_created',
      duplicate_of_member_id: null,
      duplicate_match_reason: null,
      duplicate_group_id: null,
      duplicate_review_note: null,
      linked_at: new Date().toISOString(),
    })
    .eq('id', input.existingMemberId)

  await logMemberLinkEvent({
    action: 'link_signup_to_existing',
    keepMemberId: input.existingMemberId,
    mergeMemberId: input.signupMemberId,
    authUserId,
    matchReason: signup.duplicate_match_reason,
    note: `${signup.name} 로그인 계정을 기존 회원 ${existing.name}에 연결`,
    performedBy: adminUser.id,
  })

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${input.existingMemberId}`)
  revalidatePath(`/dashboard/members/${input.signupMemberId}`)
  return { keepMemberId: input.existingMemberId }
}

export async function resolveMemberDuplicateReview(input: {
  signupMemberId: string
  resolution: 'keep_separate' | 'false_positive' | 'later'
  note?: string
}): Promise<{ error?: string }> {
  const adminUser = await requireRole(['admin'])
  const admin = createServiceRoleClient()

  if (input.resolution === 'later') {
    await logMemberLinkEvent({
      action: 'duplicate_review_later',
      mergeMemberId: input.signupMemberId,
      note: input.note ?? '나중에 확인',
      performedBy: adminUser.id,
    })
    return {}
  }

  const status: MemberAccountLinkStatus = 'dismissed'
  const note =
    input.resolution === 'keep_separate'
      ? '별도 회원으로 유지 — 두 회원은 각각 관리됩니다.'
      : '잘못된 후보로 표시함'

  const { error } = await admin
    .from('members')
    .update({
      account_link_status: status,
      duplicate_review_note: note,
      // 후보는 해제하되 이력은 note에 남김
      duplicate_of_member_id: null,
      duplicate_match_reason: null,
    })
    .eq('id', input.signupMemberId)

  if (error) {
    if (error.message.includes('account_link_status') || error.code === 'PGRST204') {
      return {
        error:
          'supabase/add-member-duplicate-link.sql 마이그레이션을 먼저 실행해주세요.',
      }
    }
    return { error: error.message }
  }

  // 로그인 계정이 있으면 linked 로 정리
  const { data: row } = await admin
    .from('members')
    .select('auth_user_id, user_id')
    .eq('id', input.signupMemberId)
    .maybeSingle()

  if (row?.auth_user_id || row?.user_id) {
    await admin
      .from('members')
      .update({
        account_link_status: 'linked',
        linked_at: new Date().toISOString(),
      })
      .eq('id', input.signupMemberId)
  }

  await logMemberLinkEvent({
    action:
      input.resolution === 'keep_separate'
        ? 'duplicate_keep_separate'
        : 'duplicate_false_positive',
    mergeMemberId: input.signupMemberId,
    note,
    performedBy: adminUser.id,
  })

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${input.signupMemberId}`)
  return {}
}

/** 상세에서 수동으로 후보 재검색 */
export async function searchLinkableExistingMembers(signupMemberId: string) {
  await requireRole(['admin'])
  const admin = createServiceRoleClient()
  const { data: signup } = await admin
    .from('members')
    .select('id, name, phone, parent_phone, birth_date')
    .eq('id', signupMemberId)
    .maybeSingle()

  if (!signup) return { data: [], error: '회원을 찾을 수 없습니다.' }

  const matches = await findDuplicateMemberCandidates(admin, {
    name: signup.name,
    phone: signup.phone,
    parent_phone: signup.parent_phone,
    birth_date: signup.birth_date,
    excludeMemberId: signup.id,
  })

  return {
    data: matches.map((match) => ({
      id: match.member.id,
      name: match.member.name,
      phone: match.member.phone,
      parent_phone: match.member.parent_phone,
      birth_date: match.member.birth_date,
      remaining_sessions: match.member.remaining_sessions ?? 0,
      reason: match.reason,
      reasonLabel: match.reasonLabel,
      membershipLabel:
        (match.member.remaining_sessions ?? 0) > 0
          ? MEMBERSHIP_STATUS_LABELS.active
          : MEMBERSHIP_STATUS_LABELS.none,
      sourceLabel:
        match.member.source_type === 'self_signup'
          ? MEMBER_SOURCE_LABELS.self_signup
          : MEMBER_SOURCE_LABELS.admin_created,
      linkLabel:
        ACCOUNT_LINK_LABELS[
          (match.member.account_link_status as MemberAccountLinkStatus) ||
            'unlinked'
        ] ?? ACCOUNT_LINK_LABELS.unlinked,
    })),
  }
}

export async function refreshMemberMembershipStatus(
  memberId: string,
): Promise<MemberMembershipStatus> {
  const supabase = await createStaffDataClient()
  const { data: member } = await supabase
    .from('members')
    .select('remaining_sessions')
    .eq('id', memberId)
    .maybeSingle()

  const status = await loadMembershipForMember(
    supabase,
    memberId,
    member?.remaining_sessions ?? 0,
  )

  try {
    await supabase
      .from('members')
      .update({ membership_status: status })
      .eq('id', memberId)
  } catch {
    /* optional column — membership_status may be missing before migration */
  }

  return status
}
