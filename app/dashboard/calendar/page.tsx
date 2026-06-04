import { getLessonsForMonth } from '@/lib/actions/lessons'
import { getInstructorForCurrentUser, getInstructors } from '@/lib/actions/instructors'
import { CalendarView } from './calendar-view'

export default async function CalendarPage() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [lessons, instructors, currentInstructor] = await Promise.all([
    getLessonsForMonth(year, month),
    getInstructors({ isActive: true }),
    getInstructorForCurrentUser(),
  ])

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
    <div className="-m-4 md:-m-6 flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <CalendarView
        initialLessons={lessons}
        instructors={instructors}
        members={members}
        defaultInstructorId={currentInstructor?.id ?? null}
      />
    </div>
  )
}
