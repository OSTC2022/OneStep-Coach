'use client'

import { memo, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getLessonCalendarDisplayLine,
  toDateKey,
  type LessonEditAnchor,
} from '@/lib/calendar-utils'
import { getInstructorCalendarColor } from '@/lib/instructor-colors'
import type { Lesson } from '@/lib/types'

interface CalendarMobileWeekProps {
  dates: Date[]
  selectedDate: Date
  lessons: Lesson[]
  onSelectDate: (date: Date) => void
  onLessonActivate?: (
    lesson: Lesson,
    anchor?: LessonEditAnchor,
    options?: { altKey?: boolean },
  ) => void
  highlightedLessonIds?: string[]
  rangeLoading?: boolean
  hasCache?: boolean
}

function groupLessonsByDate(lessons: Lesson[], dates: Date[]) {
  const keys = new Set(dates.map((d) => toDateKey(d)))
  const map = new Map<string, Lesson[]>()
  for (const lesson of lessons) {
    if (!keys.has(lesson.lesson_date)) continue
    const group = map.get(lesson.lesson_date) ?? []
    group.push(lesson)
    map.set(lesson.lesson_date, group)
  }
  for (const group of map.values()) {
    group.sort((a, b) =>
      (a.start_time ?? '').localeCompare(b.start_time ?? ''),
    )
  }
  return map
}

export const CalendarMobileWeek = memo(function CalendarMobileWeek({
  dates,
  selectedDate,
  lessons,
  onSelectDate,
  onLessonActivate,
  highlightedLessonIds,
  rangeLoading = false,
  hasCache = true,
}: CalendarMobileWeekProps) {
  const lessonsByDate = useMemo(
    () => groupLessonsByDate(lessons, dates),
    [lessons, dates],
  )
  const highlightedSet = useMemo(
    () => new Set(highlightedLessonIds ?? []),
    [highlightedLessonIds],
  )
  const selectedKey = toDateKey(selectedDate)

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-2">
        {dates.map((date) => {
          const key = toDateKey(date)
          const isSelected = key === selectedKey
          const count = lessonsByDate.get(key)?.length ?? 0
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(date)}
              className={cn(
                'flex min-w-[3rem] flex-col items-center rounded-lg px-2 py-1.5 text-center transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/40 text-foreground',
              )}
            >
              <span className="text-[10px] font-medium opacity-80">
                {format(date, 'EEE', { locale: ko })}
              </span>
              <span className="text-sm font-bold tabular-nums">
                {format(date, 'd')}
              </span>
              {count > 0 ? (
                <span className="mt-0.5 text-[9px] tabular-nums opacity-80">
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {rangeLoading && !hasCache ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            일정 불러오는 중…
          </div>
        ) : (
          <ul className="space-y-2">
            {(lessonsByDate.get(selectedKey) ?? []).length === 0 ? (
              <li className="py-10 text-center text-sm text-muted-foreground">
                이 날짜에 등록된 수업이 없습니다.
              </li>
            ) : (
              (lessonsByDate.get(selectedKey) ?? []).map((lesson) => {
                const color = getInstructorCalendarColor(lesson.instructor)
                const isHighlighted = highlightedSet.has(lesson.id)
                return (
                  <li key={lesson.id}>
                    <button
                      type="button"
                      onClick={() => onLessonActivate?.(lesson)}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2.5 text-left transition-colors active:bg-muted/50',
                        isHighlighted && 'ring-2 ring-primary',
                      )}
                      style={{ borderColor: color }}
                    >
                      <p className="text-xs font-medium tabular-nums text-muted-foreground">
                        {lesson.start_time?.slice(0, 5) ?? '--:--'}
                        {lesson.end_time
                          ? ` – ${lesson.end_time.slice(0, 5)}`
                          : ''}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold leading-snug">
                        {getLessonCalendarDisplayLine(lesson)}
                      </p>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        )}
        {rangeLoading && hasCache ? (
          <div className="pointer-events-none absolute right-3 top-2 flex items-center gap-1 rounded-full bg-card/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
            <Loader2 className="h-3 w-3 animate-spin" />
            갱신 중
          </div>
        ) : null}
      </div>
    </div>
  )
})
