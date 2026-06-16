'use client'

import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { CalendarMobileWeek } from './calendar-mobile-week'
import { MonthDayPanel } from './month-day-panel'
import { CalendarPanelResizeHandle } from './calendar-panel-resize-handle'
import { useIsMobileViewport } from '@/hooks/use-min-md'
import type { MemoQuickAddPayload } from './month-memo-input'
import type {
  CalendarMemberSearchItem,
  LessonDraft,
  LessonEditAnchor,
} from '@/lib/calendar-utils'
import type { Instructor, Lesson } from '@/lib/types'
import { useCalendarPanelSplit } from '@/lib/calendar-panel-split'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const TimeGrid = dynamic(
  () => import('./time-grid').then((m) => ({ default: m.TimeGrid })),
  { ssr: false },
)

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

const MIN_BOTTOM_PX = 168
const MIN_TOP_PX = 160
const DEFAULT_BOTTOM_PX = 280

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
  const isMobile = useIsMobileViewport()
  const [gridExpanded, setGridExpanded] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const splitKey = isWeekView ? 'week' : 'day'

  const { bottomPx, isDragging, handleProps } = useCalendarPanelSplit(
    containerRef,
    {
      storageKey: splitKey,
      defaultBottomPx: DEFAULT_BOTTOM_PX,
      minBottomPx: MIN_BOTTOM_PX,
      minTopPx: MIN_TOP_PX,
    },
  )

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
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
      </div>
    )
  }

  return (
      <div
        ref={containerRef}
        className={cn(
          'flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card',
          isDragging && 'select-none',
        )}
      >
        <div className="flex shrink-0 items-center justify-center border-b border-border bg-muted/20 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground"
            onClick={() => setGridExpanded((prev) => !prev)}
          >
            {gridExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                시간표 접기
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                시간표 펼치기
              </>
            )}
          </Button>
        </div>

        <div
          className={cn(
            'min-h-0 w-full overflow-hidden',
            gridExpanded ? 'flex-1' : 'shrink-0',
          )}
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
            collapsed={!gridExpanded}
            highlightedLessonIds={highlightedLessonIds}
            selectedLessonIds={selectedLessonIds}
            rangeLoading={rangeLoading}
            hasRangeCache={hasRangeCache}
            className="h-full min-h-0 rounded-none border-0"
          />
        </div>

        <CalendarPanelResizeHandle isDragging={isDragging} {...handleProps} />

        <div
          className="w-full shrink-0 overflow-y-auto"
          style={{ maxHeight: `${bottomPx}px` }}
        >
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
