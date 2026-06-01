'use client'

import { TimeGrid } from './time-grid'
import { MonthDayPanel } from './month-day-panel'
import type { MemoQuickAddPayload } from './month-memo-input'
import type {
  CalendarMemberSearchItem,
  LessonDraft,
  LessonEditAnchor,
} from '@/lib/calendar-utils'
import type { Lesson } from '@/lib/types'

interface DayWeekViewProps {
  dates: Date[]
  selectedDate: Date
  onSelectDate: (date: Date) => void
  lessons: Lesson[]
  members: CalendarMemberSearchItem[]
  onDragCreate: (draft: LessonDraft) => void
  onLessonMove?: (
    lessonId: string,
    update: { date: string; startTime: string; endTime: string },
  ) => void
  onLessonEdit?: (lesson: Lesson, anchor?: LessonEditAnchor) => void
  onLessonLineUpdate?: (lesson: Lesson, line: string) => Promise<void>
  onMemoSubmit: (payload: MemoQuickAddPayload) => Promise<{ error?: string } | void>
  compactHeader?: boolean
  highlightedLessonIds?: string[]
}

export function DayWeekView({
  dates,
  selectedDate,
  onSelectDate,
  lessons,
  members,
  onDragCreate,
  onLessonMove,
  onLessonEdit,
  onLessonLineUpdate,
  onMemoSubmit,
  compactHeader = false,
  highlightedLessonIds,
}: DayWeekViewProps) {
  return (
    <div className="flex h-full min-h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="min-h-0 flex-[1.1] overflow-hidden">
        <TimeGrid
          dates={dates}
          lessons={lessons}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          onDragCreate={onDragCreate}
          onLessonMove={onLessonMove}
          onLessonEdit={onLessonEdit}
          compactHeader={compactHeader}
          highlightedLessonIds={highlightedLessonIds}
          className="h-full min-h-0 rounded-none border-0"
        />
      </div>

      <MonthDayPanel
        selectedDate={selectedDate}
        lessons={lessons}
        members={members}
        onLessonEdit={(lesson) => onLessonEdit?.(lesson)}
        onLessonLineUpdate={onLessonLineUpdate}
        onMemoSubmit={onMemoSubmit}
      />
    </div>
  )
}
