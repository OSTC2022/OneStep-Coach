import { parseISO } from 'date-fns'
import { getLessons } from '@/lib/actions/lessons'
import { getInstructors } from '@/lib/actions/instructors'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { getRangeForView, type CalendarView } from '@/lib/calendar-utils'
import { profileRoleToAppRole } from '@/lib/roles'
import { redirect } from 'next/navigation'
import {
  LessonStatusView,
  type LessonStatusViewMode,
} from './lesson-status-view'

export default async function LessonStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>
}) {
  const profile = await getDashboardProfile()
  if (!profile) redirect('/auth/login')

  const userRole = profileRoleToAppRole(profile.role)
  if (userRole !== 'admin' && userRole !== 'instructor') {
    redirect('/dashboard/my')
  }

  const params = await searchParams
  const selectedDate = params.date ?? new Date().toISOString().split('T')[0]
  const viewParam = params.view
  const viewMode: LessonStatusViewMode =
    viewParam === 'week' ||
    viewParam === 'month' ||
    viewParam === 'list' ||
    viewParam === 'day'
      ? viewParam
      : 'day'

  const rangeView: CalendarView =
    viewMode === 'list' ? 'week' : viewMode === 'day' ? 'day' : viewMode

  const lessonsQuery =
    viewMode === 'day'
      ? { date: selectedDate }
      : getRangeForView(parseISO(selectedDate), rangeView)

  const [lessons, instructors] = await Promise.all([
    viewMode === 'day'
      ? getLessons({ date: selectedDate })
      : getLessons(lessonsQuery),
    getInstructors({ isActive: true, calendar: true }),
  ])

  return (
    <div className="space-y-3 pt-12 lg:pt-0">
      <div>
        <h1 className="text-xl font-bold lg:text-2xl">수업현황</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          시간대별 선수 · 출석/취소로 바로 변경
        </p>
      </div>

      <LessonStatusView
        lessons={lessons}
        instructors={instructors}
        selectedDate={selectedDate}
        initialViewMode={viewMode}
        showAddMember={userRole === 'admin'}
      />
    </div>
  )
}
