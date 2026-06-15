'use client'

import { memo, useMemo } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getLessonCalendarDisplayParts,
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

function LessonAgendaItem({
  lesson,
  isHighlighted,
  onLessonActivate,
}: {
  lesson: Lesson
  isHighlighted: boolean
  onLessonActivate?: CalendarMobileWeekProps['onLessonActivate']
}) {
  const color = getInstructorCalendarColor(lesson.instructor)
  const display = getLessonCalendarDisplayParts(lesson)
  const athleteLabel = display.meta
    ? `${display.name}(${display.meta})`
    : display.name
  const instructorName = lesson.instructor?.name ?? '—'
  const timeLabel = lesson.start_time?.slice(0, 5) ?? '--:--'

  return (
    <li>
      <button
        type="button"
        onClick={() => onLessonActivate?.(lesson)}
        className={cn(
          'w-full rounded-lg border px-3 py-2.5 text-left transition-colors active:bg-muted/50',
          isHighlighted && 'ring-2 ring-primary',
        )}
        style={{ borderColor: color }}
      >
        <p className="text-sm font-bold tabular-nums text-primary">{timeLabel}</p>
        <p className="mt-1 text-sm font-semibold leading-snug">{athleteLabel}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">담당: {instructorName}</p>
      </button>
    </li>
  )
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
  const isMultiDay = dates.length > 1
  const totalLessons = useMemo(
    () =>
      dates.reduce(
        (sum, date) => sum + (lessonsByDate.get(toDateKey(date))?.length ?? 0),
        0,
      ),
    [dates, lessonsByDate],
  )

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      {isMultiDay ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto overscroll-x-contain border-b border-border px-2 py-2">
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
                  'flex min-w-[3rem] shrink-0 flex-col items-center rounded-lg px-2 py-1.5 text-center transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/40 text-foreground',
                )}
              >
                <span className="text-[10px] font-medium opacity-80 whitespace-nowrap">
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
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {rangeLoading && !hasCache ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            일정 불러오는 중…
          </div>
        ) : isMultiDay ? (
          totalLessons === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              등록된 수업이 없습니다.
            </p>
          ) : (
            <div className="space-y-4">
              {dates.map((date) => {
                const key = toDateKey(date)
                const dayLessons = lessonsByDate.get(key) ?? []
                if (dayLessons.length === 0) return null
                return (
                  <section key={key}>
                    <h3 className="mb-2 text-xs font-semibold text-primary">
                      {format(date, 'M월 d일 (EEE)', { locale: ko })}
                    </h3>
                    <ul className="space-y-2">
                      {dayLessons.map((lesson) => (
                        <LessonAgendaItem
                          key={lesson.id}
                          lesson={lesson}
                          isHighlighted={highlightedSet.has(lesson.id)}
                          onLessonActivate={onLessonActivate}
                        />
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          )
        ) : (
          <ul className="space-y-2">
            {(lessonsByDate.get(selectedKey) ?? []).length === 0 ? (
              <li className="py-10 text-center text-sm text-muted-foreground">
                이 날짜에 등록된 수업이 없습니다.
              </li>
            ) : (
              (lessonsByDate.get(selectedKey) ?? []).map((lesson) => (
                <LessonAgendaItem
                  key={lesson.id}
                  lesson={lesson}
                  isHighlighted={highlightedSet.has(lesson.id)}
                  onLessonActivate={onLessonActivate}
                />
              ))
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
