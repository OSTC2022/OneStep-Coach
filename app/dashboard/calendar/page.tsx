import { getLessonsForRange } from '@/lib/actions/lessons'
import { getInstructorForCurrentUser, getInstructors } from '@/lib/actions/instructors'
import { getRangeForView } from '@/lib/calendar-utils'
import { CalendarView } from './calendar-view'

export default async function CalendarPage() {
  const now = new Date()
  const { dateFrom, dateTo } = getRangeForView(now, 'week')

  if (process.env.NODE_ENV === 'development') {
    console.log('[calendar] fetch start', {
      rangeStart: dateFrom,
      rangeEnd: dateTo,
      coachId: 'all',
      source: 'server-page',
    })
  }

  const [lessons, instructors, currentInstructor] = await Promise.all([
    getLessonsForRange(dateFrom, dateTo),
    getInstructors({ isActive: true, calendar: true, limit: 80 }),
    getInstructorForCurrentUser(),
  ])

  if (process.env.NODE_ENV === 'development') {
    console.log('[calendar] fetch success', lessons.length)
    console.log('[calendar] fetch end')
  }

  const members = (() => {
    const map = new Map<
      string,
      {
        id: string
        name: string
        sport?: string | null
        age?: number | null
        birth_date?: string | null
      }
    >()
    for (const lesson of lessons) {
      if (lesson.member && !map.has(lesson.member.id)) {
        map.set(lesson.member.id, {
          id: lesson.member.id,
          name: lesson.member.name,
          sport: lesson.member.sport,
          age: lesson.member.age,
          birth_date: lesson.member.birth_date,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'ko'),
    )
  })()

  return (
    <div className="flex min-h-0 w-full max-w-full min-w-0 flex-1 flex-col">
      <CalendarView
        initialLessons={lessons}
        instructors={instructors}
        members={members}
        defaultInstructorId={currentInstructor?.id ?? null}
      />
    </div>
  )
}
