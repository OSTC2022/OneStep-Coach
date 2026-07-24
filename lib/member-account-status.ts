import type { SessionPackage } from '@/lib/types'
import { isPackageUsableForLesson } from '@/lib/session-package-utils'

export type MemberSourceType = 'admin_created' | 'self_signup'

export type MemberAccountLinkStatus =
  | 'linked'
  | 'unlinked'
  | 'duplicate_candidate'
  | 'dismissed'

export type MemberMembershipStatus = 'active' | 'none' | 'expired' | 'pending'

export type DuplicateMatchReasonCode =
  | 'phone'
  | 'parent_phone'
  | 'name_birth'
  | 'name_phone_partial'
  | 'name_only'

export const MEMBER_SOURCE_LABELS: Record<MemberSourceType, string> = {
  admin_created: '관리자 등록',
  self_signup: '직접 가입',
}

export const MEMBER_SOURCE_HINTS: Record<MemberSourceType, string> = {
  admin_created: '관리자가 먼저 등록한 회원입니다.',
  self_signup: '회원이 직접 가입한 계정입니다.',
}

export const ACCOUNT_LINK_LABELS: Record<MemberAccountLinkStatus, string> = {
  linked: '연동 완료',
  unlinked: '계정 미연동',
  duplicate_candidate: '중복 후보',
  dismissed: '별도 유지',
}

export const MEMBERSHIP_STATUS_LABELS: Record<MemberMembershipStatus, string> = {
  active: '회원권 있음',
  none: '회원권 없음',
  expired: '만료됨',
  pending: '확인 필요',
}

export const DUPLICATE_MATCH_REASON_LABELS: Record<DuplicateMatchReasonCode, string> = {
  phone: '전화번호 일치',
  parent_phone: '보호자 전화번호 일치',
  name_birth: '이름+생년월일 일치',
  name_phone_partial: '이름+연락처 일부 일치',
  name_only: '이름만 일치 (동명이인 가능)',
}

export function normalizePhoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const da = normalizePhoneDigits(a)
  const db = normalizePhoneDigits(b)
  if (!da || !db) return false
  if (da === db) return true
  // 국내번호 10~11자리 끝자리 비교 (0 누락 등)
  const aTail = da.length >= 10 ? da.slice(-10) : da
  const bTail = db.length >= 10 ? db.slice(-10) : db
  return aTail.length >= 9 && aTail === bTail
}

export function phonePartialMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const da = normalizePhoneDigits(a)
  const db = normalizePhoneDigits(b)
  if (da.length < 4 || db.length < 4) return false
  if (phonesMatch(a, b)) return true
  return da.slice(-4) === db.slice(-4)
}

export function namesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase() && Boolean((a ?? '').trim())
}

export function birthDatesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = (a ?? '').trim().slice(0, 10)
  const nb = (b ?? '').trim().slice(0, 10)
  return Boolean(na) && na === nb
}

/** 패키지 기준으로 회원권 상태 계산 (캐시 컬럼보다 우선) */
export function computeMembershipStatus(input: {
  packages?: Array<
    Pick<
      SessionPackage,
      'remaining_sessions' | 'expires_at' | 'is_active' | 'deleted_at' | 'note' | 'total_sessions'
    >
  >
  remainingSessionsCache?: number | null
}): MemberMembershipStatus {
  const packages = (input.packages ?? []).filter(
    (pkg) => pkg.deleted_at == null && pkg.is_active !== false,
  )

  if (packages.length > 0) {
    const usable = packages.some((pkg) => isPackageUsableForLesson(pkg))
    if (usable) return 'active'

    const hadAny = packages.some(
      (pkg) =>
        (pkg.total_sessions ?? 0) > 0 ||
        (pkg.remaining_sessions ?? 0) !== 0 ||
        Boolean(pkg.expires_at),
    )
    if (hadAny) return 'expired'
    return 'none'
  }

  const cache = input.remainingSessionsCache ?? 0
  if (cache > 0) return 'active'
  return 'none'
}

export function resolveSourceType(member: {
  source_type?: MemberSourceType | null
  auth_user_id?: string | null
  user_id?: string | null
  memo?: string | null
}): MemberSourceType {
  if (member.source_type === 'admin_created' || member.source_type === 'self_signup') {
    return member.source_type
  }
  if (member.auth_user_id || member.user_id) return 'self_signup'
  if ((member.memo ?? '').includes('가입')) return 'self_signup'
  return 'admin_created'
}

export function resolveAccountLinkStatus(member: {
  account_link_status?: MemberAccountLinkStatus | null
  auth_user_id?: string | null
  user_id?: string | null
}): MemberAccountLinkStatus {
  if (
    member.account_link_status === 'linked' ||
    member.account_link_status === 'unlinked' ||
    member.account_link_status === 'duplicate_candidate' ||
    member.account_link_status === 'dismissed'
  ) {
    return member.account_link_status
  }
  return member.auth_user_id || member.user_id ? 'linked' : 'unlinked'
}

export function isStrongDuplicateReason(reason: DuplicateMatchReasonCode): boolean {
  return reason !== 'name_only'
}

export function parseDuplicateMatchReason(
  value: string | null | undefined,
): DuplicateMatchReasonCode | null {
  if (
    value === 'phone' ||
    value === 'parent_phone' ||
    value === 'name_birth' ||
    value === 'name_phone_partial' ||
    value === 'name_only'
  ) {
    return value
  }
  return null
}
