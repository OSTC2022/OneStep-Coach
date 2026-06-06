import type { Instructor } from '@/lib/types'

type LessonInstructorRow = {
  instructor_id: string | null
  instructor?: {
    id: string
    name: string
    calendar_color?: string | null
  } | null
}

/** 오늘 수업에 등장하는 강사만 추출 — 별도 instructors 전체 조회 불필요 */
export function collectInstructorsFromLessons(
  lessons: LessonInstructorRow[],
): Pick<Instructor, 'id' | 'name' | 'calendar_color' | 'is_active'>[] {
  const map = new Map<
    string,
    Pick<Instructor, 'id' | 'name' | 'calendar_color' | 'is_active'>
  >()

  for (const lesson of lessons) {
    const id = lesson.instructor?.id ?? lesson.instructor_id
    if (!id || map.has(id)) continue

    map.set(id, {
      id,
      name: lesson.instructor?.name ?? '강사',
      calendar_color: lesson.instructor?.calendar_color ?? null,
      is_active: true,
    })
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}
