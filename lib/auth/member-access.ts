import 'server-only'

import { redirect } from 'next/navigation'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import {
  canEditMemberBasicInfo,
  canManageMembers,
  canViewMembers,
  profileRoleToAppRole,
  type AppRole,
} from '@/lib/roles'

export function canAddMemberBodyRecordRole(role: AppRole): boolean {
  return role === 'admin' || role === 'instructor'
}

export async function requireMemberViewer(): Promise<{
  role: AppRole
  canManage: boolean
  userId: string
}> {
  const user = await getDashboardProfile()
  if (!user) redirect('/auth/login')

  const role = profileRoleToAppRole(user.role)
  if (!canViewMembers(role)) redirect('/unauthorized')

  return { role, canManage: canManageMembers(role), userId: user.id }
}

export async function requireMemberManager(): Promise<void> {
  const { canManage } = await requireMemberViewer()
  if (!canManage) redirect('/unauthorized')
}

export async function canEditMemberBasicInfoFor(memberId: string): Promise<boolean> {
  const user = await getDashboardProfile()
  if (!user) return false

  const role = profileRoleToAppRole(user.role)
  return canEditMemberBasicInfo(role)
}

export async function isLinkedMemberSelf(memberId: string): Promise<boolean> {
  const linkedMember = await getMemberForCurrentUser()
  return linkedMember?.id === memberId
}

/** 신체 기록 추가 — 관리자·강사 또는 본인 회원 */
export async function canAddBodyRecordFor(memberId: string): Promise<boolean> {
  const user = await getDashboardProfile()
  if (!user) return false

  const role = profileRoleToAppRole(user.role)
  if (canAddMemberBodyRecordRole(role)) return true

  const linkedMember = await getMemberForCurrentUser()
  return linkedMember?.id === memberId
}
