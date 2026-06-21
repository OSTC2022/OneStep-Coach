import type { AttendanceStatus, UserRole as DbUserRole } from '@/lib/types'

/** DB profile roles */
export type ProfileRole = 'admin' | 'coach' | 'member' | 'guardian' | 'adult_member'

/** App navigation roles (coach shown as instructor in legacy UI) */
export type AppRole = 'admin' | 'instructor' | 'member' | 'guardian' | 'adult_member'

export function profileRoleToAppRole(role: ProfileRole | DbUserRole | string | null): AppRole {
  if (role === 'coach' || role === 'instructor') return 'instructor'
  if (role === 'admin') return 'admin'
  if (role === 'guardian') return 'guardian'
  if (role === 'adult_member') return 'adult_member'
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
    case 'adult_member':
      return '성인회원'
    default:
      return '회원'
  }
}

export function getDefaultDashboardPath(role: AppRole): string {
  switch (role) {
    case 'member':
    case 'guardian':
    case 'adult_member':
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

export function canManageMembers(role: AppRole): boolean {
  return role === 'admin'
}

export function canViewMembers(role: AppRole): boolean {
  return role === 'admin' || role === 'instructor'
}

/** 생년월일·학년/포지션·학교/소속팀 등 기본 정보 수정 */
export function canEditMemberBasicInfo(role: AppRole): boolean {
  return role === 'admin' || role === 'instructor'
}

/** 신체정보 수정 버튼 표시 (관리자·강사) */
export function canViewPhysicalEditButton(role: AppRole): boolean {
  return role === 'admin' || role === 'instructor'
}

/** 신체정보 키·몸무게 초기 설정 저장 (관리자만) */
export function canSavePhysicalBaseline(role: AppRole): boolean {
  return role === 'admin'
}

/** 회원 등록·수정·수업권 관리 등 쓰기 전용 경로 */
export function isMemberWritePath(pathname: string): boolean {
  if (pathname === '/dashboard/members/new') return true
  if (/\/dashboard\/members\/[^/]+\/edit\/?$/.test(pathname)) return true
  if (/\/dashboard\/members\/[^/]+\/packages(\/|$)/.test(pathname)) return true
  return false
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

export const MEMBER_PORTAL_PATHS = ['/dashboard/my', '/my'] as const

export function isMemberPortalPath(pathname: string): boolean {
  if (pathname === '/my' || pathname.startsWith('/my/')) return true
  return pathname === '/dashboard/my' || pathname.startsWith('/dashboard/my/')
}

export function canAccessPath(role: AppRole, pathname: string): boolean {
  if (role === 'admin') return true

  if (role === 'member' || role === 'guardian' || role === 'adult_member') {
    return isMemberPortalPath(pathname)
  }

  if (isAdminPath(pathname)) return false

  if (pathname.startsWith('/dashboard/members')) {
    if (!canViewMembers(role)) return false
    return !isMemberWritePath(pathname)
  }

  return (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/lesson-status') ||
    pathname.startsWith('/dashboard/lessons') ||
    pathname.startsWith('/dashboard/calendar') ||
    pathname.startsWith('/dashboard/attendance')
  )
}
