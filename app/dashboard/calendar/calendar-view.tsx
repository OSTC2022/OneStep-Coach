'use client'

import { LessonCalendar } from './lesson-calendar'
import type { Instructor, Lesson } from '@/lib/types'
import type { StaffMemoNote } from '@/lib/actions/staff-memo-notes'
import type { CenterRunningTrainingScheduleBundle } from '@/lib/actions/center-running-training-schedule'

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
  initialMemoNotes?: StaffMemoNote[]
  memoMigrationWarning?: string
  initialRunningSchedule?: CenterRunningTrainingScheduleBundle | null
}

export function CalendarView(props: CalendarViewProps) {
  return <LessonCalendar {...props} />
}
