'use server'

import { listPendingAccounts } from '@/lib/actions/auth-registration'
import { getCurrentUser } from '@/lib/actions/auth'

export type DashboardNotification = {
  id: string
  title: string
  description: string
  href: string
  createdAt: string
}

export async function getDashboardNotifications(): Promise<DashboardNotification[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const notifications: DashboardNotification[] = []

  if (user.role === 'admin') {
    const pending = await listPendingAccounts()
    for (const account of pending) {
      notifications.push({
        id: `pending-approval:${account.id}`,
        title: '가입 승인 대기',
        description: `${account.full_name || account.email || '신규 사용자'} · ${account.roleLabel}`,
        href: '/dashboard/settings',
        createdAt: account.created_at,
      })
    }
  }

  return notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
