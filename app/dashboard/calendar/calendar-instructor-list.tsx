'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { List, Loader2, Trash2, X } from 'lucide-react'
import { useCalendarSelection } from '@/components/dashboard/calendar-selection-context'
import { Button } from '@/components/ui/button'
import {
  filterLessonsForView,
  getLessonCalendarDisplayLine,
  getViewTitle,
  sortLessonsBySchedule,
  type CalendarView,
} from '@/lib/calendar-utils'
import {
  getInstructorCalendarColor,
  AUTO_INSTRUCTOR_BORDER_COLOR,
  resolveLessonDisplayColor,
  hexToRgba,
} from '@/lib/instructor-colors'
import { AUTO_INSTRUCTOR_ID } from '@/lib/member-utils'
import { cn } from '@/lib/utils'
import type { Instructor, Lesson } from '@/lib/types'

const AUTO_INSTRUCTOR_LABEL = '자율배정'
const LIST_LONG_PRESS_MS = 500

type InstructorFilterOption = {
  id: string
  name: string
  color: string
}

function getLessonInstructorFilterId(lesson: Lesson): string {
  return lesson.instructor_id ?? AUTO_INSTRUCTOR_ID
}

function getLessonInstructorColor(lesson: Lesson): string {
  return resolveLessonDisplayColor(lesson, lesson.instructor ? [lesson.instructor] : [])
}

function buildInstructorFilterOptions(instructors: Instructor[]): InstructorFilterOption[] {
  return [
    {
      id: AUTO_INSTRUCTOR_ID,
      name: AUTO_INSTRUCTOR_LABEL,
      color: AUTO_INSTRUCTOR_BORDER_COLOR,
    },
    ...instructors.map((instructor) => ({
      id: instructor.id,
      name: instructor.name,
      color: getInstructorCalendarColor(instructor),
    })),
  ]
}

interface CalendarInstructorListProps {
  instructors: Instructor[]
  lessons: Lesson[]
  currentDate: Date
  view: CalendarView
  highlightedLessonIds?: string[]
  onLoadMonthPool?: () => void
  onSelectLesson?: (lesson: Lesson) => void
  onEditLesson?: (lesson: Lesson) => void
  className?: string
}

export function CalendarInstructorList({
  instructors,
  lessons,
  currentDate,
  view,
  highlightedLessonIds,
  onLoadMonthPool,
  onSelectLesson,
  onEditLesson,
  className,
}: CalendarInstructorListProps) {
  const {
    count: selectionCount,
    toggle: toggleLessonSelection,
    isSelected: isLessonSelected,
    runDeleteSelected,
    isDeleting,
  } = useCalendarSelection()
  const [open, setOpen] = useState(false)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)
  const [activeInstructorIds, setActiveInstructorIds] = useState<Set<string>>(
    () =>
      new Set([
        AUTO_INSTRUCTOR_ID,
        ...instructors.map((instructor) => instructor.id),
      ]),
  )
  const containerRef = useRef<HTMLDivElement>(null)

  const filterOptions = useMemo(
    () => buildInstructorFilterOptions(instructors),
    [instructors],
  )

  useEffect(() => {
    setActiveInstructorIds((prev) => {
      const next = new Set(prev)
      if (!next.has(AUTO_INSTRUCTOR_ID)) next.add(AUTO_INSTRUCTOR_ID)
      for (const instructor of instructors) {
        if (!next.has(instructor.id)) next.add(instructor.id)
      }
      return next
    })
  }, [instructors])

  const listLessons = useMemo(() => {
    const inRange = filterLessonsForView(lessons, currentDate, view)
    return sortLessonsBySchedule(inRange).filter((lesson) =>
      activeInstructorIds.has(getLessonInstructorFilterId(lesson)),
    )
  }, [lessons, currentDate, view, activeInstructorIds])

  const listTitle = useMemo(() => {
    if (view === 'month') {
      return `${format(currentDate, 'M월', { locale: ko })} 수업 목록`
    }
    return `${getViewTitle(currentDate, view)} 수업 목록`
  }, [currentDate, view])

  const emptyListMessage = useMemo(() => {
    if (view === 'day') return '이 날짜에 선택한 강사의 수업이 없습니다.'
    if (view === 'week') return '이번 주에 선택한 강사의 수업이 없습니다.'
    return `${format(currentDate, 'M월', { locale: ko })}에 선택한 강사의 수업이 없습니다.`
  }, [currentDate, view])
  const highlightedSet = useMemo(
    () => new Set(highlightedLessonIds ?? []),
    [highlightedLessonIds],
  )

  useEffect(() => {
    if (!open || !highlightedLessonIds?.length) return
    const targetId = highlightedLessonIds[0]
    const timer = window.setTimeout(() => {
      const el = containerRef.current?.querySelector(
        `[data-lesson-id="${targetId}"]`,
      ) as HTMLElement | null
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 80)
    return () => window.clearTimeout(timer)
  }, [open, highlightedLessonIds, listLessons])

  const onLoadMonthPoolRef = useRef(onLoadMonthPool)
  onLoadMonthPoolRef.current = onLoadMonthPool

  useEffect(() => {
    if (!open) return

    onLoadMonthPoolRef.current?.()

    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return
      const target = e.target as HTMLElement
      if (
        target.closest('[data-calendar-toolbar]') ||
        target.closest('[role="dialog"]') ||
        target.closest('[data-slot="dialog-content"]')
      ) {
        return
      }
      setOpen(false)
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function toggleInstructor(instructorId: string) {
    setActiveInstructorIds((prev) => {
      const next = new Set(prev)
      if (next.has(instructorId)) next.delete(instructorId)
      else next.add(instructorId)
      return next
    })
  }

  function closePanel() {
    setOpen(false)
  }

  function clearLongPress() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function startLongPress(lesson: Lesson) {
    clearLongPress()
    longPressTriggeredRef.current = false
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      longPressTriggeredRef.current = true
      onEditLesson?.(lesson)
    }, LIST_LONG_PRESS_MS)
  }

  function handleLessonEdit(lesson: Lesson) {
    clearLongPress()
    onEditLesson?.(lesson)
  }

  useEffect(() => () => clearLongPress(), [])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Button
        type="button"
        variant={open ? 'secondary' : 'outline'}
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen((value) => !value)}
        title={`${listTitle} 보기`}
      >
        <List className="h-4 w-4" />
        <span className="hidden sm:inline">목록</span>
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[min(calc(100vw-2rem),42rem)] overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div>
              <p className="text-sm font-medium">{listTitle}</p>
              <p className="text-xs text-muted-foreground">
                강사 색 on/off · Alt+클릭 선택 · 클릭 이동 · 우클릭/길게 누르기 수정
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {selectionCount > 0 && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  disabled={isDeleting}
                  onClick={() => runDeleteSelected()}
                  title={`선택 ${selectionCount}개 삭제`}
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {selectionCount}개 삭제
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={closePanel}
                title="닫기 (Esc)"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex max-h-[min(24rem,60vh)] min-h-48">
            <aside className="w-36 shrink-0 overflow-y-auto border-r border-border bg-muted/20 sm:w-40">
              <ul className="py-1">
                {filterOptions.map((option) => {
                  const isActive = activeInstructorIds.has(option.id)

                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/50',
                          !isActive && 'opacity-60',
                        )}
                        onClick={() => toggleInstructor(option.id)}
                        title={`${option.name} ${isActive ? '숨기기' : '표시'}`}
                      >
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-2 ring-offset-1 ring-offset-popover transition-all',
                            isActive ? 'ring-white/25' : 'ring-border',
                          )}
                          style={
                            isActive
                              ? { backgroundColor: option.color }
                              : {
                                  backgroundColor: 'transparent',
                                  boxShadow: `inset 0 0 0 2px ${option.color}`,
                                }
                          }
                        />
                        <span
                          className="min-w-0 flex-1 truncate text-xs font-medium"
                          style={{ color: isActive ? option.color : undefined }}
                        >
                          {option.name}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </aside>

            <div className="min-w-0 flex-1 overflow-y-auto">
              {activeInstructorIds.size === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  표시할 강사를 선택해주세요.
                </p>
              ) : listLessons.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {emptyListMessage}
                </p>
              ) : (
                <ul className="divide-y divide-border py-1">
                  {listLessons.map((lesson) => {
                    const color = getLessonInstructorColor(lesson)
                    const isHighlighted = highlightedSet.has(lesson.id)
                    const isMultiSelected = isLessonSelected(lesson.id)
                    const dateLabel = format(
                      new Date(`${lesson.lesson_date}T12:00:00`),
                      'M/d (EEE)',
                      { locale: ko },
                    )
                    const time = lesson.start_time?.slice(0, 5) ?? '시간 미정'

                    return (
                      <li key={lesson.id}>
                        <button
                          type="button"
                          data-lesson-id={lesson.id}
                          className={cn(
                            'mx-1 flex w-[calc(100%-0.5rem)] items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent/50',
                            isHighlighted || isMultiSelected
                              ? 'ring-2 ring-offset-1 ring-offset-popover'
                              : 'border-transparent',
                          )}
                          style={
                            isHighlighted || isMultiSelected
                              ? {
                                  borderColor: color,
                                  backgroundColor: hexToRgba(color, 0.16),
                                  boxShadow: isMultiSelected
                                    ? `0 0 0 2px #fff, 0 0 12px ${hexToRgba(color, 0.85)}`
                                    : `0 0 0 1px ${hexToRgba(color, 0.45)}`,
                                }
                              : undefined
                          }
                          onClick={(e) => {
                            if (longPressTriggeredRef.current) {
                              longPressTriggeredRef.current = false
                              return
                            }
                            if (e.altKey) {
                              e.preventDefault()
                              toggleLessonSelection(lesson.id)
                              return
                            }
                            onSelectLesson?.(lesson)
                            closePanel()
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleLessonEdit(lesson)
                          }}
                          onPointerDown={(e) => {
                            if (e.button !== 0 || e.altKey) return
                            startLongPress(lesson)
                          }}
                          onPointerUp={clearLongPress}
                          onPointerLeave={clearLongPress}
                          onPointerCancel={clearLongPress}
                          title="Alt+클릭: 선택 · 클릭: 이동 · 우클릭/길게 누르기: 수정"
                        >
                          <span
                            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/20"
                            style={{ backgroundColor: color }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {getLessonCalendarDisplayLine(lesson)}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {dateLabel} · {time}
                              {` · ${lesson.instructor?.name ?? AUTO_INSTRUCTOR_LABEL}`}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          {listLessons.length > 0 && (
            <div
              className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground"
              style={{
                backgroundColor: hexToRgba(
                  filterOptions.find((option) => activeInstructorIds.has(option.id))
                    ?.color ?? AUTO_INSTRUCTOR_BORDER_COLOR,
                  0.06,
                ),
              }}
            >
              {listLessons.length}건 · {activeInstructorIds.size}개 표시 중
              {selectionCount > 0 ? ` · ${selectionCount}개 선택` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
