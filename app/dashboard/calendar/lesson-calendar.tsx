'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getLessonsForRange, createLesson, updateLesson } from '@/lib/actions/lessons'
import { normalizePrimaryInstructorId } from '@/lib/member-utils'
import { parseMemoQuickAdd } from '@/lib/memo-quick-add'
import type { MemoQuickAddPayload } from './month-memo-input'
import {
  getRangeForView,
  getViewTitle,
  getWeekDates,
  getDefaultLessonCalendarLabel,
  isSameLessonSlot,
  minutesToTimeString,
  navigateDate,
  parseTimeToMinutes,
  type CalendarMemberSearchItem,
  type CalendarMemberSearchResult,
  type CalendarView,
  type LessonDraft,
  type LessonEditAnchor,
} from '@/lib/calendar-utils'
import type { Instructor, Lesson } from '@/lib/types'
import { InstructorColorLabel } from '@/components/instructors/instructor-color-label'
import { CalendarSearch } from './calendar-search'
import { CalendarInstructorList } from './calendar-instructor-list'
import { addWeeks } from 'date-fns'
import { MonthView } from './month-view'
import { DayWeekView } from './day-week-view'
import { LessonCreateDialog } from './lesson-create-dialog'
import {
  isEditableTarget,
  matchCalendarShortcut,
} from '@/lib/calendar-shortcuts'

interface MemberOption extends CalendarMemberSearchItem {}

interface CalendarHighlight {
  memberId: string
  lessonIds: string[]
}

interface LessonCalendarProps {
  initialLessons: Lesson[]
  instructors: Instructor[]
  members: MemberOption[]
  defaultInstructorId?: string | null
}

export function LessonCalendar({
  initialLessons,
  instructors,
  members,
  defaultInstructorId = null,
}: LessonCalendarProps) {
  const [view, setView] = useState<CalendarView>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [lessons, setLessons] = useState(initialLessons)
  const [instructorFilter, setInstructorFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState<LessonDraft | null>(null)
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [editAnchor, setEditAnchor] = useState<LessonEditAnchor | null>(null)
  const [searchPoolLessons, setSearchPoolLessons] = useState<Lesson[]>([])
  const [searchPoolYear, setSearchPoolYear] = useState<number | null>(null)
  const [highlight, setHighlight] = useState<CalendarHighlight | null>(null)
  const [agendaSelectedDate, setAgendaSelectedDate] = useState(() => new Date())
  const [isPending, startTransition] = useTransition()
  const calendarRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!highlight) return
    const timer = window.setTimeout(() => setHighlight(null), 10000)
    return () => window.clearTimeout(timer)
  }, [highlight])

  const filteredLessons = useMemo(() => {
    if (instructorFilter === 'all') return lessons
    return lessons.filter((l) => l.instructor_id === instructorFilter)
  }, [lessons, instructorFilter])

  const searchLessons = useMemo(() => {
    const map = new Map<string, Lesson>()
    for (const lesson of searchPoolLessons) {
      map.set(lesson.id, lesson)
    }
    for (const lesson of lessons) {
      map.set(lesson.id, lesson)
    }
    return Array.from(map.values())
  }, [searchPoolLessons, lessons])

  const loadSearchPool = useCallback(() => {
    const year = currentDate.getFullYear()
    if (searchPoolYear === year) return

    startTransition(async () => {
      const data = await getLessonsForRange(`${year}-01-01`, `${year}-12-31`)
      setSearchPoolLessons(data)
      setSearchPoolYear(year)
    })
  }, [currentDate, searchPoolYear])

  const loadRange = useCallback(
    (date: Date, nextView: CalendarView) => {
      const { dateFrom, dateTo } = getRangeForView(date, nextView)
      startTransition(async () => {
        const data = await getLessonsForRange(dateFrom, dateTo)
        setLessons(data)
      })
    },
    [],
  )

  function handleViewChange(nextView: CalendarView) {
    setView(nextView)
    if (nextView === 'day') {
      setCurrentDate(agendaSelectedDate)
      loadRange(agendaSelectedDate, nextView)
      return
    }
    setAgendaSelectedDate(currentDate)
    loadRange(currentDate, nextView)
  }

  function handleNavigate(direction: -1 | 1) {
    const next = navigateDate(currentDate, view, direction)
    setCurrentDate(next)
    if (view === 'week') {
      setAgendaSelectedDate((prev) => addWeeks(prev, direction))
    } else {
      setAgendaSelectedDate(next)
    }
    loadRange(next, view)
  }

  function goToToday() {
    const today = new Date()
    setCurrentDate(today)
    setAgendaSelectedDate(today)
    loadRange(today, view)
  }

  const handleViewChangeRef = useRef(handleViewChange)
  const goToTodayRef = useRef(goToToday)
  const goToTodayHandledAtRef = useRef(0)
  handleViewChangeRef.current = handleViewChange
  goToTodayRef.current = goToToday

  function triggerGoToToday() {
    const now = Date.now()
    if (now - goToTodayHandledAtRef.current < 80) return
    goToTodayHandledAtRef.current = now
    goToTodayRef.current()
  }

  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      if (createOpen || editOpen) return
      if (isEditableTarget(e.target)) return

      const action = matchCalendarShortcut(e)
      if (!action) return

      e.preventDefault()
      e.stopPropagation()
      if (action === 'today') {
        triggerGoToToday()
      } else {
        handleViewChangeRef.current(action)
      }
    }

    document.addEventListener('keydown', handleShortcut, { capture: true })
    document.addEventListener('keyup', handleShortcut, { capture: true })
    return () => {
      document.removeEventListener('keydown', handleShortcut, { capture: true })
      document.removeEventListener('keyup', handleShortcut, { capture: true })
    }
  }, [createOpen, editOpen])

  function openCreateDialog(d: LessonDraft) {
    setEditingLesson(null)
    setDraft(d)
    setCreateOpen(true)
  }

  function openEditDialog(lesson: Lesson, anchor?: LessonEditAnchor) {
    setDraft(null)
    setEditingLesson(lesson)
    setEditAnchor(anchor ?? null)
    setEditOpen(true)
  }

  function handleSearchSelectMember(result: CalendarMemberSearchResult) {
    const lesson = result.targetLesson
    if (!lesson) return
    navigateToLesson(lesson)
  }

  function handleListEditLesson(lesson: Lesson) {
    navigateToLesson(lesson)
    openEditDialog(lesson)
  }

  function handleListSelectLesson(lesson: Lesson) {
    navigateToLesson(lesson)
  }

  function navigateToLesson(lesson: Lesson) {
    const lessonDate = new Date(`${lesson.lesson_date}T12:00:00`)
    const nextView: CalendarView = view === 'month' ? 'week' : view

    setInstructorFilter('all')
    setCurrentDate(lessonDate)
    setView(nextView)
    setAgendaSelectedDate(lessonDate)
    setHighlight({
      memberId: lesson.member_id || lesson.member?.id || '',
      lessonIds: [lesson.id],
    })

    startTransition(async () => {
      const { dateFrom, dateTo } = getRangeForView(lessonDate, nextView)
      const data = await getLessonsForRange(dateFrom, dateTo)
      setLessons(data)

      if (data.some((item) => item.id === lesson.id)) {
        setHighlight((prev) =>
          prev
            ? {
                ...prev,
                lessonIds: [lesson.id],
              }
            : prev,
        )
      }
    })
  }

  function handleLessonDeleted(lessonId: string) {
    setLessons((prev) => prev.filter((l) => l.id !== lessonId))
  }

  function handleLessonSaved(lesson: Lesson) {
    setLessons((prev) => {
      const exists = prev.some((l) => l.id === lesson.id)
      if (exists) {
        return prev.map((l) => (l.id === lesson.id ? lesson : l))
      }
      return [...prev, lesson]
    })
  }

  async function handleMemoSubmit(payload: MemoQuickAddPayload) {
    const result = await createLesson({
      lesson_date: payload.date,
      member_id: payload.memberId,
      title: payload.title,
      start_time: payload.startTime,
      end_time: payload.endTime,
      instructor_id: normalizePrimaryInstructorId(defaultInstructorId) || undefined,
      lesson_type: '개인레슨',
    })

    if (result.error) {
      return { error: result.error }
    }

    if (result.data) {
      handleLessonSaved(result.data)
    }

    if (result.warning) {
      toast.warning('DB 마이그레이션 필요', { description: result.warning })
    }

    return {}
  }

  async function handleLessonMove(
    lessonId: string,
    update: { date: string; startTime: string; endTime: string },
  ) {
    const target = lessons.find((l) => l.id === lessonId)
    if (!target) return

    const result = await updateLesson(target.id, {
      lesson_date: update.date,
      start_time: update.startTime,
      end_time: update.endTime,
    })

    if (result.error) {
      toast.error('수업 일정 변경 실패', { description: result.error })
      return
    }

    if (result.data) {
      setLessons((prev) =>
        prev.map((l) => (l.id === target.id ? result.data! : l)),
      )
    }

    toast.success('수업 일정이 변경되었습니다.')
  }

  async function handleLessonLineUpdate(lesson: Lesson, line: string) {
    const trimmed = line.trim()
    const memberId = lesson.member_id
    const autoLabel = getDefaultLessonCalendarLabel(lesson.member ?? null)
    const parsed = parseMemoQuickAdd(trimmed)
    const labelPart = parsed.memberQuery.trim()

    if (!memberId && !labelPart) {
      toast.error('이름을 입력해주세요.')
      return
    }

    const title =
      memberId && (!labelPart || labelPart === autoLabel) ? null : labelPart || null

    if (!memberId && !title) {
      toast.error('이름을 입력해주세요.')
      return
    }

    let startTime = lesson.start_time?.slice(0, 5) ?? undefined
    let endTime = lesson.end_time?.slice(0, 5) ?? undefined

    if (parsed.startTime) {
      const oldStart = parseTimeToMinutes(lesson.start_time)
      const oldEnd = lesson.end_time
        ? parseTimeToMinutes(lesson.end_time)
        : oldStart + 60
      const duration = Math.max(15, oldEnd - oldStart)
      const newStartMin = parseTimeToMinutes(parsed.startTime)
      startTime = parsed.startTime
      endTime = minutesToTimeString(newStartMin + duration)
    }

    const result = await updateLesson(lesson.id, {
      member_id: memberId,
      title,
      start_time: startTime,
      end_time: endTime,
    })

    if (result.error) {
      toast.error('일정 저장 실패', { description: result.error })
      return
    }

    if (result.data) handleLessonSaved(result.data)
    if (result.warning) {
      toast.warning('DB 마이그레이션 필요', { description: result.warning })
    }
  }

  const title = getViewTitle(currentDate, view)
  const weekDates = getWeekDates(currentDate)
  const dayDates = [currentDate]

  const editingSameSlotLessons = useMemo(() => {
    if (!editingLesson) return []
    return filteredLessons.filter(
      (l) => l.id !== editingLesson.id && isSameLessonSlot(l, editingLesson),
    )
  }, [editingLesson, filteredLessons])

  return (
    <div
      ref={calendarRootRef}
      tabIndex={-1}
      className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4 pt-2 outline-none md:px-6"
      onPointerDown={(e) => {
        if (isEditableTarget(e.target)) return
        calendarRootRef.current?.focus({ preventScroll: true })
      }}
    >
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarInstructorList
            instructors={instructors}
            lessons={searchLessons}
            currentDate={currentDate}
            highlightedLessonIds={highlight?.lessonIds}
            onLoadMonthPool={loadSearchPool}
            onSelectLesson={handleListSelectLesson}
            onEditLesson={handleListEditLesson}
            className="shrink-0"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleNavigate(-1)}
            disabled={isPending}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            disabled={isPending}
            title="오늘 (Ctrl+Space, Ctrl+Shift+Space)"
          >
            오늘
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleNavigate(1)}
            disabled={isPending}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="ml-1 flex items-center gap-2 text-base font-semibold sm:text-lg">
            {title}
            {isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Select value={instructorFilter} onValueChange={setInstructorFilter}>
            <SelectTrigger className="w-[130px]">
              {instructorFilter !== 'all' ? (
                (() => {
                  const selected = instructors.find((i) => i.id === instructorFilter)
                  return selected ? (
                    <InstructorColorLabel name={selected.name} instructor={selected} compact />
                  ) : (
                    <SelectValue placeholder="강사" />
                  )
                })()
              ) : (
                <SelectValue placeholder="강사" />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 강사</SelectItem>
              {instructors.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  <InstructorColorLabel name={i.name} instructor={i} compact />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tabs
            value={view}
            onValueChange={(v) => handleViewChange(v as CalendarView)}
          >
            <TabsList title="Ctrl+1 일 · Ctrl+2 주 · Ctrl+3 월 · Ctrl+Space(또는 Ctrl+Shift+Space) 오늘">
              <TabsTrigger value="day" title="Ctrl+1">
                일
              </TabsTrigger>
              <TabsTrigger value="week" title="Ctrl+2">
                주
              </TabsTrigger>
              <TabsTrigger value="month" title="Ctrl+3">
                월
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <CalendarSearch
            members={members}
            lessons={searchLessons}
            currentDate={currentDate}
            onLoadSearchPool={loadSearchPool}
            onSelectMember={handleSearchSelectMember}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {view === 'month' && (
          <MonthView
            currentDate={currentDate}
            selectedDate={agendaSelectedDate}
            onSelectDate={setAgendaSelectedDate}
            lessons={filteredLessons}
            members={members}
            onMemoSubmit={handleMemoSubmit}
            onLessonEdit={openEditDialog}
            onLessonLineUpdate={handleLessonLineUpdate}
          />
        )}

        {view === 'week' && (
          <DayWeekView
            dates={weekDates}
            selectedDate={agendaSelectedDate}
            onSelectDate={setAgendaSelectedDate}
            lessons={filteredLessons}
            members={members}
            onDragCreate={openCreateDialog}
            onLessonMove={handleLessonMove}
            onLessonEdit={openEditDialog}
            onLessonLineUpdate={handleLessonLineUpdate}
            onMemoSubmit={handleMemoSubmit}
            highlightedLessonIds={highlight?.lessonIds}
          />
        )}

        {view === 'day' && (
          <DayWeekView
            dates={dayDates}
            selectedDate={agendaSelectedDate}
            onSelectDate={setAgendaSelectedDate}
            lessons={filteredLessons}
            members={members}
            onDragCreate={openCreateDialog}
            onLessonMove={handleLessonMove}
            onLessonEdit={openEditDialog}
            onLessonLineUpdate={handleLessonLineUpdate}
            onMemoSubmit={handleMemoSubmit}
            compactHeader
            highlightedLessonIds={highlight?.lessonIds}
          />
        )}
      </div>

      <LessonCreateDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) {
            setEditingLesson(null)
            setEditAnchor(null)
          }
        }}
        variant="popup"
        anchor={editAnchor}
        sameSlotLessons={editingSameSlotLessons}
        lesson={editingLesson}
        members={members}
        instructors={instructors}
        defaultInstructorId={defaultInstructorId}
        onSaved={handleLessonSaved}
        onDeleted={handleLessonDeleted}
      />

      <LessonCreateDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setDraft(null)
        }}
        draft={draft}
        members={members}
        instructors={instructors}
        defaultInstructorId={defaultInstructorId}
        onSaved={handleLessonSaved}
        onDeleted={handleLessonDeleted}
      />
    </div>
  )
}
