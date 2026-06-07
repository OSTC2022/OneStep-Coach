import 'server-only'

import { redirect } from 'next/navigation'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import {
  canManageMembers,
  canViewMembers,
  profileRoleToAppRole,
  type AppRole,
} from '@/lib/roles'

export async function requireMemberViewer(): Promise<{
  role: AppRole
  canManage: boolean
}> {
  const user = await getDashboardProfile()
  if (!user) redirect('/auth/login')

  const role = profileRoleToAppRole(user.role)
  if (!canViewMembers(role)) redirect('/unauthorized')

  return { role, canManage: canManageMembers(role) }
}

export async function requireMemberManager(): Promise<void> {
  const { canManage } = await requireMemberViewer()
  if (!canManage) redirect('/unauthorized')
}
