import dynamic from 'next/dynamic'
import { parseISO } from 'date-fns'
import { redirect } from 'next/navigation'
import { getLessonsForStatusView } from '@/lib/actions/lessons'
import { getInstructors } from '@/lib/actions/instructors'
import { getMemberBodyWeightsForLessons } from '@/lib/actions/member-body-records'
import { listStaffMemoNotes } from '@/lib/actions/staff-memo-notes'
import { getCenterRunningTrainingScheduleForStaff } from '@/lib/actions/center-running-training-schedule'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { getRangeForView, type CalendarView } from '@/lib/calendar-utils'
import { buildLessonStatusEntryPath } from '@/lib/lesson-status-date'
import { profileRoleToAppRole } from '@/lib/roles'
import { TimeSlotsSkeleton } from '@/components/dashboard/page-skeletons'
import type { LessonStatusViewMode } from './lesson-status-view'

const LESSON_STATUS_LIMIT = 200
const INSTRUCTOR_PICKER_LIMIT = 80

const LessonStatusView = dynamic(
  () =>
    import('./lesson-status-view').then((mod) => ({
      default: mod.LessonStatusView,
    })),
  { loading: () => <TimeSlotsSkeleton /> },
)

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
  const viewParam = params.view
  const viewMode: LessonStatusViewMode =
    viewParam === 'week' ||
    viewParam === 'month' ||
    viewParam === 'list' ||
    viewParam === 'day'
      ? viewParam
      : 'day'

  if (!params.date) {
    redirect(buildLessonStatusEntryPath(viewMode))
  }

  const selectedDate = params.date

  const rangeView: CalendarView =
    viewMode === 'list' ? 'week' : viewMode === 'day' ? 'day' : viewMode

  const lessonsQuery =
    viewMode === 'day'
      ? { date: selectedDate }
      : getRangeForView(parseISO(selectedDate), rangeView)

  const [lessons, instructors, memoResult, runningSchedule] = await Promise.all([
    viewMode === 'day'
      ? getLessonsForStatusView({
          date: selectedDate,
          limit: LESSON_STATUS_LIMIT,
        })
      : getLessonsForStatusView({
          ...lessonsQuery,
          limit: LESSON_STATUS_LIMIT,
        }),
    getInstructors({
      isActive: true,
      calendar: true,
      limit: INSTRUCTOR_PICKER_LIMIT,
    }),
    listStaffMemoNotes(),
    getCenterRunningTrainingScheduleForStaff(),
  ])

  const bodyWeightByKey = await getMemberBodyWeightsForLessons(
    lessons
      .filter((lesson) => lesson.member_id)
      .map((lesson) => ({
        memberId: lesson.member_id!,
        date: lesson.lesson_date,
      })),
  )

  return (
    <div className="space-y-3 pt-12 lg:pt-0">
      <div>
        <h1 className="text-xl font-bold lg:text-2xl">수업현황</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          시간대별 선수 · 출석/취소로 바로 변경
        </p>
      </div>

      <LessonStatusView
        lessons={lessons}
        instructors={instructors}
        selectedDate={selectedDate}
        initialViewMode={viewMode}
        showAddSchedule={userRole === 'admin'}
        isAdmin={userRole === 'admin'}
        initialBodyWeightByKey={bodyWeightByKey}
        initialMemoNotes={memoResult.data}
        memoMigrationWarning={memoResult.warning}
        initialRunningSchedule={runningSchedule}
      />
    </div>
  )
}
