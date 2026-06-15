'use client'

import { useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { CalendarMobileWeek } from './calendar-mobile-week'
import { useIsMobileViewport } from '@/hooks/use-min-md'
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
const MAX_LINES = 4
const LINE_HEIGHT = 3
const MIN_BOTTOM_PX = 168
const MIN_TOP_PX = 120
const DEFAULT_BOTTOM_PX = 300

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
  const isMobile = useIsMobileViewport()
  const [gridExpanded, setGridExpanded] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const { bottomPx, isDragging, handleProps } = useCalendarPanelSplit(
    containerRef,
    {
      storageKey: 'month',
      defaultBottomPx: DEFAULT_BOTTOM_PX,
      minBottomPx: MIN_BOTTOM_PX,
      minTopPx: MIN_TOP_PX,
    },
  )
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
  const monthDates = useMemo(
    () => gridDates.filter((date) => isSameMonth(date, currentDate)),
    [gridDates, currentDate],
  )

  return (
    <>
      {isMobile ? (
      <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-clip">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <CalendarMobileWeek
            dates={monthDates}
            selectedDate={selectedDate}
            lessons={lessons}
            onSelectDate={onSelectDate}
            onLessonActivate={onLessonActivate}
          />
        </div>
      </div>
      ) : (
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

      <div
        className={cn(
          'flex min-h-0 flex-col overflow-hidden transition-[flex-grow] duration-300',
          gridExpanded ? 'min-h-0 flex-1' : 'shrink-0',
        )}
      >
        <div className="grid shrink-0 grid-cols-7 border-b border-border bg-muted/30">
          {WEEKDAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={cn(
                'py-2 text-center text-xs font-medium',
                getWeekdayHeaderColorClass(i),
              )}
            >
              {label}
            </div>
          ))}
        </div>

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-y-auto',
            !gridExpanded && 'overflow-hidden',
          )}
        >
          {visibleWeeks.map((week, wi) => (
            <div
              key={wi}
              className={cn(
                'grid grid-cols-7 border-b border-border last:border-b-0',
                gridExpanded ? 'min-h-[72px] flex-1' : 'min-h-[64px]',
              )}
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
                      'flex min-h-[64px] flex-col border-r border-border p-1 text-left last:border-r-0',
                      !inMonth && 'bg-muted/20',
                      isToday && !isSelected && 'bg-primary/5',
                      isSelected && 'bg-primary/10 ring-2 ring-inset ring-primary/50',
                    )}
                    onClick={() => onSelectDate(date)}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium tabular-nums',
                          !isSelected && !isToday && dateColor,
                          isToday && !isSelected && 'ring-1 ring-primary/40',
                          isSelected && 'bg-primary text-primary-foreground',
                        )}
                      >
                        {format(date, 'd')}
                      </span>
                      {isHoliday && !isSelected && (
                        <span className="text-[9px] font-medium text-red-500">휴</span>
                      )}
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col justify-end gap-[2px] px-0.5 pb-0.5">
                      {dayLessons.slice(0, MAX_LINES).map((lesson) => (
                        <span
                          key={lesson.id}
                          className="block w-full rounded-full"
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
                          className="block w-full rounded-full bg-muted-foreground/35"
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

      <CalendarPanelResizeHandle isDragging={isDragging} {...handleProps} />

      <div
        className="w-full shrink-0 self-start overflow-y-auto"
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
      )}
    </>
  )
}
