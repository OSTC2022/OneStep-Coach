import {
  isAdultGeneralSport,
  isAdultRunningSport,
} from '@/lib/adult-member-programs'
import type { UserRole } from '@/lib/types'

export function isMemberPortalRole(role: UserRole | string | null | undefined): boolean {
  return role === 'member' || role === 'guardian' || role === 'adult_member'
}

export function isMemberPortalPath(pathname: string): boolean {
  return pathname === '/dashboard/my' || pathname.startsWith('/dashboard/my/')
}

/** 회원 역할·종목에 맞는 포털 홈 경로 */
export function resolveMemberPortalHomePath(input: {
  role?: string | null
  sport?: string | null
  /** 관리자·강사 러닝 포털 등 호출 측에서 지정 */
  fallbackHref?: string | null
}): string {
  if (input.fallbackHref?.trim()) return input.fallbackHref.trim()
  if (isAdultGeneralSport(input.sport)) return '/dashboard/my/weight-portal'
  if (input.role === 'adult_member' || isAdultRunningSport(input.sport)) {
    return '/dashboard/my'
  }
  return '/dashboard/my'
}
