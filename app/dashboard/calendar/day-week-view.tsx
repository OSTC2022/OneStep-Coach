'use client'

import dynamic from 'next/dynamic'
import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { CalendarMobileDateStrip } from './calendar-mobile-week'
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

const MIN_BOTTOM_PX = 160
const DEFAULT_BOTTOM_PX = 420
const RESIZE_HANDLE_PX = 20
const COLLAPSE_BAR_PX = 36
const MOBILE_WEEK_STRIP_PX = 44
const TIME_GRID_COLLAPSED_PX = 52
const MIN_EXPANDED_GRID_PX = 140

function computeMinTopPx(
  isMobile: boolean,
  isWeekView: boolean,
  gridExpanded: boolean,
): number {
  if (!gridExpanded) return 0
  let height = COLLAPSE_BAR_PX + RESIZE_HANDLE_PX + MIN_EXPANDED_GRID_PX
  if (isMobile && isWeekView) height += MOBILE_WEEK_STRIP_PX
  return height
}

function showCollapsedTimeGrid(
  isMobile: boolean,
  isWeekView: boolean,
): boolean {
  return !(isMobile && isWeekView)
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
  const isMobile = useIsMobileViewport()
  const [gridExpanded, setGridExpanded] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const splitKey = isWeekView ? 'week-v2' : 'day-v2'

  const minTopPx = useMemo(
    () => computeMinTopPx(isMobile, isWeekView, gridExpanded),
    [isMobile, isWeekView, gridExpanded],
  )

  const { bottomPx, isDragging, handleProps } = useCalendarPanelSplit(
    containerRef,
    {
      storageKey: splitKey,
      defaultBottomPx: DEFAULT_BOTTOM_PX,
      minBottomPx: MIN_BOTTOM_PX,
      minTopPx,
    },
  )

  const showMobileWeekStrip = isMobile && isWeekView
  const showCollapsedGrid = !gridExpanded && showCollapsedTimeGrid(isMobile, isWeekView)

  const gridDates = useMemo(() => {
    if (isMobile && isWeekView) return [selectedDate]
    return dates
  }, [isMobile, isWeekView, dates, selectedDate])

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card',
        isDragging && 'select-none',
      )}
    >
      <div className="flex shrink-0 items-center justify-center border-b border-border bg-muted/20 py-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-[11px] text-muted-foreground"
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

      {gridExpanded ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {showMobileWeekStrip ? (
              <CalendarMobileDateStrip
                dates={dates}
                selectedDate={selectedDate}
                lessons={lessons}
                onSelectDate={onSelectDate}
              />
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <TimeGrid
                dates={gridDates}
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
          </div>

          <CalendarPanelResizeHandle isDragging={isDragging} {...handleProps} />

          <div
            className="flex shrink-0 flex-col overflow-hidden"
            style={{ height: bottomPx }}
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
        </>
      ) : (
        <>
          {showMobileWeekStrip ? (
            <CalendarMobileDateStrip
              dates={dates}
              selectedDate={selectedDate}
              lessons={lessons}
              onSelectDate={onSelectDate}
            />
          ) : null}

          {showCollapsedGrid ? (
            <div
              className="shrink-0 overflow-hidden"
              style={{ height: TIME_GRID_COLLAPSED_PX }}
            >
              <TimeGrid
                dates={gridDates}
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
                collapsed
                highlightedLessonIds={highlightedLessonIds}
                selectedLessonIds={selectedLessonIds}
                rangeLoading={rangeLoading}
                hasRangeCache={hasRangeCache}
                className="h-full min-h-0 rounded-none border-0"
              />
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
        </>
      )}
    </div>
  )
}
