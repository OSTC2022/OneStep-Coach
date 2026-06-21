import type { UserRole } from '@/lib/types'

export function isMemberPortalRole(role: UserRole | string | null | undefined): boolean {
  return role === 'member' || role === 'guardian' || role === 'adult_member'
}

export function isMemberPortalPath(pathname: string): boolean {
  return pathname === '/dashboard/my' || pathname.startsWith('/dashboard/my/')
}
