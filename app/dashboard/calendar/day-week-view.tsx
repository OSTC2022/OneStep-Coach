'use client'

import { MonthDayPanel } from './month-day-panel'
import { TimeGrid } from './time-grid'
import { CalendarMobileWeek } from './calendar-mobile-week'
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
  selectedLessonIds?: ReadonlySet<string>
  isLessonSelected?: (lessonId: string) => boolean
  onClearLessonSelection?: () => void
  rangeLoading?: boolean
  hasRangeCache?: boolean
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
  selectedLessonIds,
  isLessonSelected,
  onClearLessonSelection,
  rangeLoading = false,
  hasRangeCache = true,
}: DayWeekViewProps) {
  const isWeekView = dates.length > 1

  return (
    <div className="flex h-full min-h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-lg border border-border bg-card">
      {isWeekView ? (
        <div className="min-h-0 flex-1 overflow-hidden md:hidden">
          <CalendarMobileWeek
            dates={dates}
            selectedDate={selectedDate}
            lessons={lessons}
            onSelectDate={onSelectDate}
            onLessonActivate={onLessonActivate}
            highlightedLessonIds={highlightedLessonIds}
            rangeLoading={rangeLoading}
            hasCache={hasRangeCache}
          />
        </div>
      ) : null}

      <div
        className={
          isWeekView
            ? 'hidden min-h-0 flex-1 overflow-hidden md:flex md:flex-[1.1]'
            : 'min-h-0 flex-1 overflow-hidden md:flex-[1.1]'
        }
      >
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
          selectedLessonIds={selectedLessonIds}
          rangeLoading={rangeLoading}
          hasRangeCache={hasRangeCache}
          className="h-full min-h-0 rounded-none border-0"
        />
      </div>

      <div className="max-h-[32vh] min-h-0 shrink-0 overflow-hidden border-t border-border md:max-h-none md:flex-1">
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
    </div>
  )
}
