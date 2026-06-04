'use client'

import { LessonCalendar } from './lesson-calendar'
import type { Instructor, Lesson } from '@/lib/types'

type CalendarMemberOption = {
  id: string
  name: string
  sport?: string | null
  age?: number | null
  birth_date?: string | null
}

interface CalendarViewProps {
  initialLessons: Lesson[]
  instructors: Instructor[]
  members: CalendarMemberOption[]
  defaultInstructorId: string | null
}

export function CalendarView(props: CalendarViewProps) {
  return <LessonCalendar {...props} />
}
