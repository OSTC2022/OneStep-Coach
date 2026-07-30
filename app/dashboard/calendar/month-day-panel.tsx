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
import { toast } from 'sonner'
import { isOptimisticLessonId } from '@/lib/calendar-optimistic-lesson'
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
  /** 빠른 등록 직후 수정 시 서버 ID로 치환 */
  onPrepareLessonEdit?: (lesson: Lesson) => Promise<Lesson | null>
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
  onPrepareLessonEdit,
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

  async function startInlineEdit(lesson: Lesson) {
    skipClickRef.current = true
    let target = lesson
    if (isOptimisticLessonId(lesson.id) && onPrepareLessonEdit) {
      const persisted = await onPrepareLessonEdit(lesson)
      if (!persisted) {
        toast.error('일정 저장 중입니다. 잠시 후 다시 시도해주세요.')
        return
      }
      target = persisted
    }
    setInlineEditId(target.id)
    setInlineEditText(getLessonCalendarDisplayLine(target))
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
      <div className="shrink-0 border-b border-border px-2.5 py-1 md:px-4 md:py-2">
        <p className="truncate text-xs font-semibold leading-tight md:text-sm">
          <span>{dateLabel}</span>
          <span className="font-normal text-muted-foreground">
            {' · '}
            {dayLessons.length > 0 ? `${dayLessons.length}개` : '일정 없음'}
            {onLessonLineUpdate && dayLessons.length > 0 && (
              <span className="hidden md:inline">
                {' · '}더블클릭으로 이름·시간 수정
              </span>
            )}
          </span>
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {dayLessons.length === 0 ? (
          <p className="px-2.5 py-4 text-center text-xs text-muted-foreground md:px-4 md:py-8 md:text-sm">
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
                      'flex w-full items-center gap-1.5 px-2.5 py-1 text-left transition-colors hover:bg-muted/40 md:items-stretch md:gap-3 md:px-4 md:py-3',
                      lesson.attendance_status === 'cancelled' && 'opacity-60',
                      isMultiSelected && 'bg-primary/15 ring-2 ring-inset ring-primary/50',
                    )}
                  >
                    <span
                      className="h-3.5 w-0.5 shrink-0 self-center rounded-full md:mt-0.5 md:h-auto md:w-1 md:self-stretch"
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
                          className="h-7 text-xs md:h-8 md:text-sm"
                        />
                      ) : (
                        <button
                          type="button"
                          className="block w-full truncate text-left text-xs font-medium leading-snug md:text-sm"
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
                            void startInlineEdit(lesson)
                          }}
                        >
                          <span
                            className={cn(
                              lesson.attendance_status === 'cancelled' && 'line-through',
                            )}
                          >
                            {displayLine}
                          </span>
                          {instructorName !== '—' && (
                            <span className="font-normal text-muted-foreground md:hidden">
                              {' · '}
                              {instructorName}
                            </span>
                          )}
                        </button>
                      )}
                      {instructorName !== '—' && !isEditing && (
                        <span className="mt-0.5 hidden text-xs text-muted-foreground md:block">
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
