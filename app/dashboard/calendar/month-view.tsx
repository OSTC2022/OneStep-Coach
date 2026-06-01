'use client'

import { useMemo, useState } from 'react'
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
import { Button } from '@/components/ui/button'

import type { MemoQuickAddPayload } from './month-memo-input'

interface MonthViewProps {
  currentDate: Date
  selectedDate: Date
  onSelectDate: (date: Date) => void
  lessons: Lesson[]
  members: CalendarMemberSearchItem[]
  onMemoSubmit: (payload: MemoQuickAddPayload) => Promise<{ error?: string } | void>
  onLessonEdit?: (lesson: Lesson, anchor?: LessonEditAnchor) => void
  onLessonLineUpdate?: (lesson: Lesson, line: string) => Promise<void>
}

const WEEKDAY_LABELS = WEEKDAY_LABELS_MON_START
const MAX_LINES = 4
const LINE_HEIGHT = 3

export function MonthView({
  currentDate,
  selectedDate,
  onSelectDate,
  lessons,
  members,
  onMemoSubmit,
  onLessonEdit,
  onLessonLineUpdate,
}: MonthViewProps) {
  const [gridExpanded, setGridExpanded] = useState(true)
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

  function getLessonsForDate(date: Date) {
    return lessons
      .filter((lesson) => lesson.lesson_date === toDateKey(date))
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  }

  const today = new Date()

  return (
    <div className="flex h-full min-h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-lg border border-border bg-card">
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
          'flex shrink-0 flex-col overflow-hidden transition-[flex-grow] duration-300',
          gridExpanded ? 'min-h-[42%] flex-[1.1]' : 'h-auto',
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
                const dayLessons = getLessonsForDate(date)
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
