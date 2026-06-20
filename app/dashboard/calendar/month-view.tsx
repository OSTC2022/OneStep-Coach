'use client'

import { useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getDateColorClass,
  getWeekdayHeaderColorClass,
  isKoreanHoliday,
  WEEKDAY_LABELS_MON_START,
} from '@/lib/korean-holidays'
import {
  getMonthGridDates,
  isSameDay,
  isSameMonth,
  toDateKey,
  type CalendarMemberSearchItem,
  type LessonEditAnchor,
} from '@/lib/calendar-utils'
import { getInstructorCalendarColor } from '@/lib/instructor-colors'
import type { Lesson } from '@/lib/types'
import { MonthDayPanel } from './month-day-panel'
import { CalendarPanelResizeHandle } from './calendar-panel-resize-handle'
import { Button } from '@/components/ui/button'
import { useCalendarPanelSplit } from '@/lib/calendar-panel-split'

import type { MemoQuickAddPayload } from './month-memo-input'

interface MonthViewProps {
  currentDate: Date
  selectedDate: Date
  onSelectDate: (date: Date) => void
  lessons: Lesson[]
  members: CalendarMemberSearchItem[]
  onMemoSubmit: (payload: MemoQuickAddPayload) => Promise<{ error?: string } | void>
  onLessonEdit?: (lesson: Lesson, anchor?: LessonEditAnchor) => void
  onLessonActivate?: (
    lesson: Lesson,
    anchor?: LessonEditAnchor,
    options?: { altKey?: boolean },
  ) => void
  onLessonLineUpdate?: (lesson: Lesson, line: string) => Promise<void>
  isLessonSelected?: (lessonId: string) => boolean
  onClearLessonSelection?: () => void
}

const WEEKDAY_LABELS = WEEKDAY_LABELS_MON_START
const MAX_LINES = 3
const LINE_HEIGHT = 2
const COLLAPSE_BAR_PX = 36
const WEEKDAY_HEADER_PX = 28
const MIN_WEEK_ROW_PX = 26
const MIN_BOTTOM_PX = 160
const DEFAULT_BOTTOM_PX = 420
const RESIZE_HANDLE_PX = 20

export function MonthView({
  currentDate,
  selectedDate,
  onSelectDate,
  lessons,
  members,
  onMemoSubmit,
  onLessonEdit,
  onLessonActivate,
  onLessonLineUpdate,
  isLessonSelected,
  onClearLessonSelection,
}: MonthViewProps) {
  const [gridExpanded, setGridExpanded] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const gridDates = getMonthGridDates(currentDate)
  const weeks = useMemo(
    () =>
      Array.from({ length: gridDates.length / 7 }, (_, i) =>
        gridDates.slice(i * 7, i * 7 + 7),
      ),
    [gridDates],
  )

  const visibleWeeks = useMemo(() => {
    if (gridExpanded) return weeks
    const selectedKey = toDateKey(selectedDate)
    const week = weeks.find((days) => days.some((d) => toDateKey(d) === selectedKey))
    return week ? [week] : weeks.slice(0, 1)
  }, [gridExpanded, weeks, selectedDate])

  const minTopPx = useMemo(() => {
    if (!gridExpanded) return 0
    return (
      COLLAPSE_BAR_PX +
      WEEKDAY_HEADER_PX +
      visibleWeeks.length * MIN_WEEK_ROW_PX +
      RESIZE_HANDLE_PX +
      4
    )
  }, [gridExpanded, visibleWeeks.length])

  const { bottomPx, isDragging, handleProps } = useCalendarPanelSplit(
    containerRef,
    {
      storageKey: 'month-v2',
      defaultBottomPx: DEFAULT_BOTTOM_PX,
      minBottomPx: MIN_BOTTOM_PX,
      minTopPx,
    },
  )

  const lessonsByDate = useMemo(() => {
    const map = new Map<string, Lesson[]>()
    for (const lesson of lessons) {
      const key = lesson.lesson_date
      const group = map.get(key) ?? []
      group.push(lesson)
      map.set(key, group)
    }
    for (const group of map.values()) {
      group.sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
    }
    return map
  }, [lessons])

  const today = new Date()

  const dayPanel = (
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
  )

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
              달력 접기
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              달력 펼치기
            </>
          )}
        </Button>
      </div>

      <div className="flex shrink-0 flex-col overflow-hidden">
        <div className="grid shrink-0 grid-cols-7 border-b border-border bg-muted/30">
          {WEEKDAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={cn(
                'py-1 text-center text-[10px] font-medium md:py-1.5 md:text-xs',
                getWeekdayHeaderColorClass(i),
              )}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="flex shrink-0 flex-col overflow-hidden">
          {visibleWeeks.map((week, wi) => (
            <div
              key={wi}
              className="grid shrink-0 grid-cols-7 border-b border-border last:border-b-0"
              style={{ minHeight: MIN_WEEK_ROW_PX }}
            >
              {week.map((date) => {
                const dateKey = toDateKey(date)
                const dayLessons = lessonsByDate.get(dateKey) ?? []
                const inMonth = isSameMonth(date, currentDate)
                const isToday = isSameDay(date, today)
                const isSelected = isSameDay(date, selectedDate)
                const isHoliday = isKoreanHoliday(date)
                const dateColor = getDateColorClass(date, { muted: !inMonth })

                return (
                  <button
                    key={dateKey}
                    type="button"
                    className={cn(
                      'flex min-h-0 flex-col overflow-hidden border-r border-border p-0 text-left last:border-r-0 md:p-0.5',
                      !inMonth && 'bg-muted/20',
                      isToday && !isSelected && 'bg-primary/5',
                      isSelected && 'bg-primary/10 ring-2 ring-inset ring-primary/50',
                    )}
                    onClick={() => onSelectDate(date)}
                  >
                    <div className="flex shrink-0 items-center justify-between">
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium tabular-nums md:h-6 md:w-6 md:text-xs',
                          !isSelected && !isToday && dateColor,
                          isToday && !isSelected && 'ring-1 ring-primary/40',
                          isSelected && 'bg-primary text-primary-foreground',
                        )}
                      >
                        {format(date, 'd')}
                      </span>
                      {isHoliday && !isSelected && (
                        <span className="shrink-0 text-[8px] font-medium text-red-500 md:text-[9px]">
                          휴
                        </span>
                      )}
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col justify-end gap-px overflow-hidden px-0.5 pb-px">
                      {dayLessons.slice(0, MAX_LINES).map((lesson) => (
                        <span
                          key={lesson.id}
                          className="block w-full shrink-0 rounded-full"
                          style={{
                            height: LINE_HEIGHT,
                            backgroundColor: getInstructorCalendarColor(lesson.instructor),
                            opacity:
                              lesson.attendance_status === 'cancelled' ? 0.35 : 1,
                          }}
                        />
                      ))}
                      {dayLessons.length > MAX_LINES && (
                        <span
                          className="block w-full shrink-0 rounded-full bg-muted-foreground/35"
                          style={{ height: LINE_HEIGHT }}
                        />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {gridExpanded ? (
        <>
          <div className="min-h-0 flex-1" aria-hidden />
          <CalendarPanelResizeHandle isDragging={isDragging} {...handleProps} />
          <div
            className="flex shrink-0 flex-col overflow-hidden"
            style={{ height: bottomPx }}
          >
            {dayPanel}
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{dayPanel}</div>
      )}
    </div>
  )
}
