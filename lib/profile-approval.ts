import { isProtectedAdminAccount } from '@/lib/protected-admin'
import type { ProfileApprovalStatus } from '@/lib/types'

export function resolveApprovalStatus(
  email: string | null | undefined,
  status: ProfileApprovalStatus | string | null | undefined,
): ProfileApprovalStatus {
  if (isProtectedAdminAccount(email)) return 'approved'
  if (
    status === 'approved' ||
    status === 'pending' ||
    status === 'rejected' ||
    status === 'on_hold'
  ) {
    return status
  }
  return 'pending'
}

/**
 * 승인 상태: DB의 approved/rejected/on_hold는 최우선.
 * DB가 pending·비어 있으면 Auth metadata(승인 시 approved 저장)를 반영.
 */
export function getEffectiveApprovalStatus(
  email: string | null | undefined,
  profileStatus: ProfileApprovalStatus | string | null | undefined,
  metadataStatus?: ProfileApprovalStatus | string | null | undefined,
): ProfileApprovalStatus {
  if (isProtectedAdminAccount(email)) return 'approved'
  if (
    profileStatus === 'approved' ||
    profileStatus === 'rejected' ||
    profileStatus === 'on_hold'
  ) {
    return profileStatus
  }
  if (
    metadataStatus === 'approved' ||
    metadataStatus === 'rejected' ||
    metadataStatus === 'on_hold'
  ) {
    return metadataStatus
  }
  if (profileStatus === 'pending') return 'pending'
  return resolveApprovalStatus(email, metadataStatus)
}

export function isProfileAccessAllowed(
  status: ProfileApprovalStatus | string | null | undefined,
  email?: string | null,
): boolean {
  return resolveApprovalStatus(email, status) === 'approved'
}

export function getApprovalStatusLabel(
  status: ProfileApprovalStatus | string | null | undefined,
  email?: string | null,
): string {
  switch (resolveApprovalStatus(email, status)) {
    case 'pending':
      return '승인 대기'
    case 'rejected':
      return '거절됨'
    case 'on_hold':
      return '보류'
    default:
      return '승인됨'
  }
}

/** 로그인 차단 시 사용자에게 보여줄 메시지 */
export function getApprovalBlockedLoginMessage(
  status: ProfileApprovalStatus | string | null | undefined,
): string {
  if (status === 'rejected') {
    return '가입 승인이 거절되었습니다. 관리자에게 문의해주세요.'
  }
  if (status === 'on_hold' || status === 'pending') {
    return '회원가입 대기중입니다.'
  }
  return '가입 승인 후 로그인할 수 있습니다.'
}
