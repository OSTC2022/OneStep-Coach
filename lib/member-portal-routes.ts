import type { UserRole } from '@/lib/types'

export function isMemberPortalRole(role: UserRole | string | null | undefined): boolean {
  return role === 'member' || role === 'guardian'
}

export function isMemberPortalPath(pathname: string): boolean {
  return pathname === '/dashboard/my' || pathname.startsWith('/dashboard/my/')
}
