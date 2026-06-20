'use client'

import { memo, useMemo } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { toDateKey } from '@/lib/calendar-utils'
import type { Lesson } from '@/lib/types'

interface CalendarMobileDateStripProps {
  dates: Date[]
  selectedDate: Date
  lessons: Lesson[]
  onSelectDate: (date: Date) => void
}

function groupLessonCounts(lessons: Lesson[], dates: Date[]) {
  const keys = new Set(dates.map((d) => toDateKey(d)))
  const map = new Map<string, number>()
  for (const lesson of lessons) {
    if (!keys.has(lesson.lesson_date)) continue
    map.set(lesson.lesson_date, (map.get(lesson.lesson_date) ?? 0) + 1)
  }
  return map
}

export const CalendarMobileDateStrip = memo(function CalendarMobileDateStrip({
  dates,
  selectedDate,
  lessons,
  onSelectDate,
}: CalendarMobileDateStripProps) {
  const countsByDate = useMemo(
    () => groupLessonCounts(lessons, dates),
    [lessons, dates],
  )
  const selectedKey = toDateKey(selectedDate)

  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto overscroll-x-contain border-b border-border px-2 py-1.5">
      {dates.map((date) => {
        const key = toDateKey(date)
        const isSelected = key === selectedKey
        const count = countsByDate.get(key) ?? 0
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectDate(date)}
            className={cn(
              'flex min-w-[2.75rem] shrink-0 flex-col items-center rounded-md px-1.5 py-1 text-center transition-colors',
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/40 text-foreground',
            )}
          >
            <span className="text-[9px] font-medium opacity-80 whitespace-nowrap">
              {format(date, 'EEE', { locale: ko })}
            </span>
            <span className="text-xs font-bold tabular-nums">{format(date, 'd')}</span>
            {count > 0 ? (
              <span className="text-[8px] tabular-nums opacity-80">{count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
})
