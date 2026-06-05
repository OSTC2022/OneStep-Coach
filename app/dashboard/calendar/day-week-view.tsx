'use client'

import { TimeGrid } from './time-grid'
import { MonthDayPanel } from './month-day-panel'
import type { MemoQuickAddPayload } from './month-memo-input'
import type {
  CalendarMemberSearchItem,
  LessonDraft,
  LessonEditAnchor,
} from '@/lib/calendar-utils'
import type { Instructor, Lesson } from '@/lib/types'

interface DayWeekViewProps {
  dates: Date[]
  selectedDate: Date
  onSelectDate: (date: Date) => void
  lessons: Lesson[]
  instructors: Instructor[]
  members: CalendarMemberSearchItem[]
  onDragCreate: (draft: LessonDraft) => void
  onLessonMove?: (
    lessonId: string,
    update: { date: string; startTime: string; endTime: string },
  ) => void
  onLessonEdit?: (lesson: Lesson, anchor?: LessonEditAnchor) => void
  onLessonActivate?: (
    lesson: Lesson,
    anchor?: LessonEditAnchor,
    options?: { altKey?: boolean },
  ) => void
  onLessonLineUpdate?: (lesson: Lesson, line: string) => Promise<void>
  onMemoSubmit: (payload: MemoQuickAddPayload) => Promise<{ error?: string } | void>
  compactHeader?: boolean
  highlightedLessonIds?: string[]
  isLessonSelected?: (lessonId: string) => boolean
  onClearLessonSelection?: () => void
}

export function DayWeekView({
  dates,
  selectedDate,
  onSelectDate,
  lessons,
  instructors,
  members,
  onDragCreate,
  onLessonMove,
  onLessonEdit,
  onLessonActivate,
  onLessonLineUpdate,
  onMemoSubmit,
  compactHeader = false,
  highlightedLessonIds,
  isLessonSelected,
  onClearLessonSelection,
}: DayWeekViewProps) {
  return (
    <div className="flex h-full min-h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="min-h-0 flex-[1.1] overflow-hidden">
        <TimeGrid
          dates={dates}
          lessons={lessons}
          instructors={instructors}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          onDragCreate={onDragCreate}
          onLessonMove={onLessonMove}
          onLessonEdit={onLessonEdit}
          onLessonActivate={onLessonActivate}
          isLessonSelected={isLessonSelected}
          onClearLessonSelection={onClearLessonSelection}
          compactHeader={compactHeader}
          highlightedLessonIds={highlightedLessonIds}
          className="h-full min-h-0 rounded-none border-0"
        />
      </div>

      <MonthDayPanel
        selectedDate={selectedDate}
        lessons={lessons}
        members={members}
        onLessonActivate={onLessonActivate}
        onLessonEdit={onLessonEdit}
        onLessonLineUpdate={onLessonLineUpdate}
        onMemoSubmit={onMemoSubmit}
        isLessonSelected={isLessonSelected}
      />
    </div>
  )
}
