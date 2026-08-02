import type { ProfileApprovalStatus, UserRole } from '@/lib/types'

export type PortalManageAccessUser = {
  role: UserRole | string
  approval_status?: ProfileApprovalStatus | string | null
  email?: string | null
  adult_running_portal_manage?: boolean | null
}

/**
 * 관리자, 또는 승인된 강사 중 adult_running_portal_manage=true
 * (client-safe — profile-approval/server-only 의존 없음)
 */
export function canManageAdultRunningPortal(
  user: PortalManageAccessUser | null | undefined,
): boolean {
  if (!user) return false
  const role = String(user.role)
  if (role === 'admin') return true
  if (role !== 'instructor' && role !== 'coach') return false
  if (!user.adult_running_portal_manage) return false
  return (user.approval_status ?? 'pending') === 'approved'
}
