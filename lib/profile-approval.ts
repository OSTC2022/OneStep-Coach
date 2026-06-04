import { isProtectedAdminAccount } from '@/lib/protected-admin'
import type { ProfileApprovalStatus } from '@/lib/types'

export function resolveApprovalStatus(
  email: string | null | undefined,
  status: ProfileApprovalStatus | string | null | undefined,
): ProfileApprovalStatus {
  if (isProtectedAdminAccount(email)) return 'approved'
  if (status === 'approved' || status === 'pending' || status === 'rejected') {
    return status
  }
  return 'pending'
}

/**
 * 승인 상태: DB의 approved/rejected는 최우선.
 * DB가 pending·비어 있으면 Auth metadata(승인 시 approved 저장)를 반영.
 */
export function getEffectiveApprovalStatus(
  email: string | null | undefined,
  profileStatus: ProfileApprovalStatus | string | null | undefined,
  metadataStatus?: ProfileApprovalStatus | string | null | undefined,
): ProfileApprovalStatus {
  if (isProtectedAdminAccount(email)) return 'approved'
  if (profileStatus === 'approved' || profileStatus === 'rejected') {
    return profileStatus
  }
  if (metadataStatus === 'approved' || metadataStatus === 'rejected') {
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
    default:
      return '승인됨'
  }
}
