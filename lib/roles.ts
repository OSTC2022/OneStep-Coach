import type { AttendanceStatus, UserRole as DbUserRole } from '@/lib/types'

/** DB profile roles */
export type ProfileRole = 'admin' | 'coach' | 'member' | 'guardian'

/** App navigation roles (coach shown as instructor in legacy UI) */
export type AppRole = 'admin' | 'instructor' | 'member' | 'guardian'

export function profileRoleToAppRole(role: ProfileRole | DbUserRole | string | null): AppRole {
  if (role === 'coach' || role === 'instructor') return 'instructor'
  if (role === 'admin') return 'admin'
  if (role === 'guardian') return 'guardian'
  return 'member'
}

export function appRoleToProfileRole(role: AppRole): ProfileRole {
  if (role === 'instructor') return 'coach'
  return role
}

export function getRoleLabel(role: AppRole): string {
  switch (role) {
    case 'admin':
      return '관리자'
    case 'instructor':
      return '강사'
    case 'guardian':
      return '학부모'
    default:
      return '회원'
  }
}

export function getDefaultDashboardPath(role: AppRole): string {
  switch (role) {
    case 'member':
    case 'guardian':
      return '/dashboard/my'
    default:
      return '/dashboard'
  }
}

export const ADMIN_PATHS = [
  '/dashboard/sessions',
  '/dashboard/instructors',
  '/dashboard/reports',
  '/dashboard/settings',
]

export function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** 수업현황·출석에서 역할별로 설정 가능한 상태 */
export function getAttendanceStatusesForRole(role: AppRole): AttendanceStatus[] {
  if (role === 'admin') return ['present', 'absent', 'makeup', 'cancelled']
  if (role === 'instructor') return ['present', 'absent', 'cancelled']
  return []
}

export function canRoleSetAttendanceStatus(
  role: AppRole,
  status: AttendanceStatus,
): boolean {
  return getAttendanceStatusesForRole(role).includes(status)
}

export function canAccessPath(role: AppRole, pathname: string): boolean {
  if (role === 'admin') return true

  if (role === 'member' || role === 'guardian') {
    return pathname === '/dashboard/my' || pathname.startsWith('/dashboard/my/')
  }

  // coach / instructor — 회원 관리는 관리자 전용, 수업·캘린더·출석만 이용
  if (isAdminPath(pathname)) return false
  if (pathname.startsWith('/dashboard/members')) return false
  return (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/lesson-status') ||
    pathname.startsWith('/dashboard/lessons') ||
    pathname.startsWith('/dashboard/calendar') ||
    pathname.startsWith('/dashboard/attendance')
  )
}
