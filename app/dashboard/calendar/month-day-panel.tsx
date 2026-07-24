'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  getLessonCalendarDisplayLine,
  sortLessonsByTimeThenColor,
  toDateKey,
  type CalendarMemberSearchItem,
} from '@/lib/calendar-utils'
import { resolveLessonDisplayColor, resolveLessonInstructorName } from '@/lib/instructor-colors'
import type { Instructor, Lesson } from '@/lib/types'
import { Input } from '@/components/ui/input'
import {
  MonthMemoInput,
  type MemoQuickAddPayload,
} from './month-memo-input'

interface MonthDayPanelProps {
  selectedDate: Date
  lessons: Lesson[]
  instructors: Instructor[]
  members: CalendarMemberSearchItem[]
  onLessonEdit?: (lesson: Lesson) => void
  onLessonActivate?: (
    lesson: Lesson,
    options?: { altKey?: boolean },
  ) => void
  onLessonLineUpdate?: (lesson: Lesson, line: string) => Promise<void>
  onMemoSubmit: (payload: MemoQuickAddPayload) => Promise<{ error?: string } | void>
  isLessonSelected?: (lessonId: string) => boolean
}

export function MonthDayPanel({
  selectedDate,
  lessons,
  instructors,
  members,
  onLessonEdit,
  onLessonActivate,
  onLessonLineUpdate,
  onMemoSubmit,
  isLessonSelected,
}: MonthDayPanelProps) {
  const activateLesson = onLessonActivate ?? ((lesson) => onLessonEdit?.(lesson))
  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [inlineEditText, setInlineEditText] = useState('')
  const skipClickRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const dateKey = toDateKey(selectedDate)
  const dayLessons = useMemo(
    () =>
      sortLessonsByTimeThenColor(
        lessons.filter((lesson) => lesson.lesson_date === dateKey),
        instructors,
      ),
    [lessons, dateKey, instructors],
  )

  const dateLabel = format(selectedDate, 'M월 d일 EEEE', { locale: ko })

  useEffect(() => {
    setInlineEditId(null)
    setInlineEditText('')
  }, [selectedDate])

  useEffect(() => {
    if (inlineEditId) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [inlineEditId])

  function startInlineEdit(lesson: Lesson) {
    skipClickRef.current = true
    setInlineEditId(lesson.id)
    setInlineEditText(getLessonCalendarDisplayLine(lesson))
  }

  async function saveInlineEdit(lesson: Lesson) {
    const trimmed = inlineEditText.trim()
    const current = getLessonCalendarDisplayLine(lesson)
    setInlineEditId(null)

    if (trimmed === current) return
    if (!onLessonLineUpdate) return

    // 낙관적 반영 — 서버 완료를 기다리지 않음
    void onLessonLineUpdate(lesson, trimmed)
  }

  function cancelInlineEdit() {
    setInlineEditId(null)
    setInlineEditText('')
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-card">
      <div className="shrink-0 border-b border-border px-4 py-2">
        <p className="truncate text-sm font-semibold leading-tight">
          <span>{dateLabel}</span>
          <span className="font-normal text-muted-foreground">
            {' · '}
            {dayLessons.length > 0 ? `${dayLessons.length}개 일정` : '일정 없음'}
            {onLessonLineUpdate && dayLessons.length > 0 && ' · 더블클릭으로 이름·시간 수정'}
          </span>
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {dayLessons.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            이 날짜에 등록된 수업이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {dayLessons.map((lesson) => {
              const color = resolveLessonDisplayColor(lesson, instructors)
              const instructorName = resolveLessonInstructorName(lesson, instructors)
              const displayLine = getLessonCalendarDisplayLine(lesson)
              const isEditing = inlineEditId === lesson.id
              const isMultiSelected = isLessonSelected?.(lesson.id)

              return (
                <li key={lesson.id}>
                  <div
                    className={cn(
                      'flex w-full items-stretch gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40',
                      lesson.attendance_status === 'cancelled' && 'opacity-60',
                      isMultiSelected && 'bg-primary/15 ring-2 ring-inset ring-primary/50',
                    )}
                  >
                    <span
                      className="mt-0.5 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <Input
                          ref={inputRef}
                          value={inlineEditText}
                          onChange={(e) => setInlineEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                              e.preventDefault()
                              void saveInlineEdit(lesson)
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              cancelInlineEdit()
                            }
                          }}
                          onBlur={() => void saveInlineEdit(lesson)}
                          placeholder="16:00 이름(39축구)"
                          className="h-8 text-sm"
                        />
                      ) : (
                        <button
                          type="button"
                          className="block w-full truncate text-left text-sm font-medium"
                          onClick={(e) => {
                            if (e.altKey) {
                              e.preventDefault()
                              e.stopPropagation()
                              skipClickRef.current = true
                              activateLesson(lesson, { altKey: true })
                              return
                            }
                            window.setTimeout(() => {
                              if (skipClickRef.current) {
                                skipClickRef.current = false
                                return
                              }
                              activateLesson(lesson)
                            }, 220)
                          }}
                          onDoubleClick={(e) => {
                            e.preventDefault()
                            if (!onLessonLineUpdate) return
                            startInlineEdit(lesson)
                          }}
                        >
                          <span
                            className={cn(
                              lesson.attendance_status === 'cancelled' && 'line-through',
                            )}
                          >
                            {displayLine}
                          </span>
                        </button>
                      )}
                      {instructorName !== '—' && !isEditing && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {instructorName}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <MonthMemoInput
        selectedDate={selectedDate}
        members={members}
        onSubmit={onMemoSubmit}
      />
    </div>
  )
}
