import { getLessonsForMonth } from '@/lib/actions/lessons'
import { getInstructorForCurrentUser, getInstructors } from '@/lib/actions/instructors'
import { listMembersForCalendarPicker } from '@/lib/actions/members'
import { listStaffMemoNotes } from '@/lib/actions/staff-memo-notes'
import { getCenterRunningTrainingScheduleForStaff } from '@/lib/actions/center-running-training-schedule'
import { CalendarView } from './calendar-view'

type CalendarMemberOption = {
  id: string
  name: string
  sport?: string | null
  age?: number | null
  birth_date?: string | null
}

function mergeCalendarMemberOptions(
  pickerMembers: CalendarMemberOption[],
  lessons: Awaited<ReturnType<typeof getLessonsForMonth>>,
): CalendarMemberOption[] {
  const map = new Map(pickerMembers.map((member) => [member.id, member]))
  for (const lesson of lessons) {
    if (!lesson.member || map.has(lesson.member.id)) continue
    map.set(lesson.member.id, {
      id: lesson.member.id,
      name: lesson.member.name,
      sport: lesson.member.sport,
      age: lesson.member.age,
      birth_date: lesson.member.birth_date,
    })
  }
  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  )
}

export default async function CalendarPage() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  if (process.env.NODE_ENV === 'development') {
    console.log('[calendar] fetch start', {
      year,
      month,
      coachId: 'all',
      source: 'server-page',
      view: 'month',
    })
  }

  const [lessons, instructors, currentInstructor, pickerMembers, memoResult, runningSchedule] =
    await Promise.all([
      getLessonsForMonth(year, month),
      getInstructors({ isActive: true, calendar: true, limit: 80 }),
      getInstructorForCurrentUser(),
      listMembersForCalendarPicker(),
      listStaffMemoNotes(),
      getCenterRunningTrainingScheduleForStaff(),
    ])

  if (process.env.NODE_ENV === 'development') {
    console.log('[calendar] fetch success', lessons.length)
    console.log('[calendar] fetch end')
  }

  const members = mergeCalendarMemberOptions(pickerMembers, lessons)

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <CalendarView
        initialLessons={lessons}
        instructors={instructors}
        members={members}
        defaultInstructorId={currentInstructor?.id ?? null}
        initialMemoNotes={memoResult.data}
        memoMigrationWarning={memoResult.warning}
        initialRunningSchedule={runningSchedule}
      />
    </div>
  )
}
