'use server'

import { listPendingAccounts } from '@/lib/actions/auth-registration'
import { getCurrentUser } from '@/lib/actions/auth'
import { listPendingGoogleSyncLessons } from '@/lib/google-calendar/sync'

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

    const pendingLessons = await listPendingGoogleSyncLessons(20)
    for (const lesson of pendingLessons) {
      const timeLabel = lesson.start_time?.slice(0, 5) ?? '시간 미정'
      notifications.push({
        id: `google-sync-pending:${lesson.id}`,
        title: '구글 캘린더 회원 미연결',
        description: `${lesson.title ?? '제목 없음'} · ${lesson.lesson_date} ${timeLabel}`,
        href: '/dashboard/calendar',
        createdAt: lesson.created_at,
      })
    }
  }

  return notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
