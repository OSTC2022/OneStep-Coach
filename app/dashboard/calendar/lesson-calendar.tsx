'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  createLesson,
  deleteLesson,
  getLessonsForMonth,
  getLessonsForRange,
  updateLesson,
} from '@/lib/actions/lessons'
import { useCalendarSelection } from '@/components/dashboard/calendar-selection-context'
import { useCalendarLessonHistory } from '@/lib/calendar-lesson-history'
import { enrichLessonWithInstructorCatalog } from '@/lib/instructor-colors'
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
import {
  isEditableTarget,
  matchCalendarShortcut,
  matchCalendarUndoRedo,
} from '@/lib/calendar-shortcuts'
import {
  logCalendarFetch,
  withCalendarFetchTimeout,
} from '@/lib/calendar-client-fetch'

function mergeLessonsById(...lists: Lesson[][]): Lesson[] {
  const map = new Map<string, Lesson>()
  for (const list of lists) {
    for (const lesson of list) {
      map.set(lesson.id, lesson)
    }
  }
  return Array.from(map.values())
}

import { DayWeekView } from './day-week-view'
import { MonthView } from './month-view'

const LessonCreateDialog = dynamic(
  () =>
    import('./lesson-create-dialog').then((m) => ({
      default: m.LessonCreateDialog,
    })),
  { ssr: false },
)

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
  const lessonHistory = useCalendarLessonHistory(setLessons)
  const [instructorFilter, setInstructorFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState<LessonDraft | null>(null)
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [editDraftInstructorId, setEditDraftInstructorId] = useState<string | null>(null)
  const [editAnchor, setEditAnchor] = useState<LessonEditAnchor | null>(null)
  const [searchPoolLessons, setSearchPoolLessons] = useState<Lesson[]>([])
  const [searchPoolKey, setSearchPoolKey] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<CalendarHighlight | null>(null)
  const [agendaSelectedDate, setAgendaSelectedDate] = useState(() => new Date())
  const [isFetching, setIsFetching] = useState(false)
  const rangeCacheRef = useRef(new Map<string, Lesson[]>())
  const rangeFetchSeqRef = useRef(0)
  const rangeFetchInFlightKeyRef = useRef<string | null>(null)
  const isFetchingRef = useRef(false)
  const monthPoolInFlightRef = useRef(false)
  const calendarRootRef = useRef<HTMLDivElement>(null)
  const {
    selectedIds: selectedLessonIds,
    count: selectionCount,
    toggle: toggleLessonSelection,
    clear: clearLessonSelection,
    isSelected: isLessonSelected,
    registerDeleteSelected,
    registerLessonSaved,
    setLessonFormOpen,
    setIsDeleting,
  } = useCalendarSelection()

  useEffect(() => {
    if (!highlight) return
    const timer = window.setTimeout(() => setHighlight(null), 10000)
    return () => window.clearTimeout(timer)
  }, [highlight])

  useEffect(() => {
    setLessonFormOpen(createOpen || editOpen)
    return () => setLessonFormOpen(false)
  }, [createOpen, editOpen, setLessonFormOpen])

  useEffect(() => {
    if (!editOpen) setEditDraftInstructorId(null)
  }, [editOpen])

  const searchLessons = useMemo(
    () => mergeLessonsById(searchPoolLessons, lessons),
    [searchPoolLessons, lessons],
  )

  const lessonsWithEditPreview = useMemo(() => {
    if (!editOpen || !editingLesson?.id || editDraftInstructorId == null) {
      return searchLessons
    }

    const normalizedId = normalizePrimaryInstructorId(editDraftInstructorId)

    return searchLessons.map((item) => {
      if (item.id !== editingLesson.id) return item
      return enrichLessonWithInstructorCatalog(
        { ...item, instructor_id: normalizedId },
        instructors,
      )
    })
  }, [searchLessons, editOpen, editingLesson, editDraftInstructorId, instructors])

  const filteredLessons = useMemo(() => {
    if (instructorFilter === 'all') return lessonsWithEditPreview
    return lessonsWithEditPreview.filter((l) => l.instructor_id === instructorFilter)
  }, [lessonsWithEditPreview, instructorFilter])

  const rangeCacheKey = useCallback((date: Date, nextView: CalendarView) => {
    const { dateFrom, dateTo } = getRangeForView(date, nextView)
    return `${dateFrom}|${dateTo}`
  }, [])

  useEffect(() => {
    rangeCacheRef.current.set(rangeCacheKey(currentDate, view), initialLessons)
  }, [initialLessons, currentDate, view, rangeCacheKey])

  useEffect(() => {
    if (isFetching) return
    rangeCacheRef.current.set(rangeCacheKey(currentDate, view), lessons)
  }, [lessons, currentDate, view, isFetching, rangeCacheKey])

  useEffect(() => {
    setLessons((prev) => {
      const byId = new Map(prev.map((l) => [l.id, l]))
      let changed = false
      for (const lesson of initialLessons) {
        if (!byId.has(lesson.id)) {
          byId.set(lesson.id, lesson)
          changed = true
        }
      }
      return changed ? Array.from(byId.values()) : prev
    })
    setSearchPoolLessons((prev) => {
      const byId = new Map(prev.map((l) => [l.id, l]))
      let changed = false
      for (const lesson of initialLessons) {
        if (!byId.has(lesson.id)) {
          byId.set(lesson.id, lesson)
          changed = true
        }
      }
      return changed ? Array.from(byId.values()) : prev
    })
  }, [initialLessons])

  const syncMonthPool = useCallback(
    (date: Date, data: Lesson[]) => {
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`
      setSearchPoolKey(key)
      setSearchPoolLessons((prev) => mergeLessonsById(prev, data))
      setLessons((prev) => mergeLessonsById(prev, data))
    },
    [],
  )

  const loadSearchPool = useCallback(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    const key = `${year}-${month}`
    if (searchPoolKey === key) return
    if (monthPoolInFlightRef.current) return

    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    monthPoolInFlightRef.current = true
    logCalendarFetch('start', {
      rangeStart: dateFrom,
      rangeEnd: dateTo,
      coachId: instructorFilter,
      pool: 'month',
    })

    void withCalendarFetchTimeout(getLessonsForMonth(year, month))
      .then((data) => {
        logCalendarFetch('success', data.length)
        syncMonthPool(currentDate, data)
        if (view === 'month') {
          rangeCacheRef.current.set(rangeCacheKey(currentDate, view), data)
        }
      })
      .catch((error) => {
        console.error(error)
        logCalendarFetch('error', error)
        toast.error('월간 검색 일정을 불러오지 못했습니다.')
      })
      .finally(() => {
        monthPoolInFlightRef.current = false
        logCalendarFetch('end')
      })
  }, [
    currentDate,
    searchPoolKey,
    syncMonthPool,
    view,
    rangeCacheKey,
    instructorFilter,
  ])

  const loadRange = useCallback(
    (date: Date, nextView: CalendarView, options?: { force?: boolean }) => {
      const cacheKey = rangeCacheKey(date, nextView)
      const cached = rangeCacheRef.current.get(cacheKey)
      if (cached && !options?.force) {
        setLessons(cached)
        if (nextView === 'month') {
          syncMonthPool(date, cached)
        }
        return
      }

      if (
        isFetchingRef.current &&
        rangeFetchInFlightKeyRef.current === cacheKey &&
        !options?.force
      ) {
        return
      }

      const { dateFrom, dateTo } = getRangeForView(date, nextView)
      const seq = ++rangeFetchSeqRef.current
      rangeFetchInFlightKeyRef.current = cacheKey
      isFetchingRef.current = true
      setIsFetching(true)

      logCalendarFetch('start', {
        rangeStart: dateFrom,
        rangeEnd: dateTo,
        coachId: instructorFilter,
        view: nextView,
      })

      const fetchLessons =
        nextView === 'month'
          ? getLessonsForMonth(date.getFullYear(), date.getMonth() + 1)
          : getLessonsForRange(dateFrom, dateTo)

      void withCalendarFetchTimeout(fetchLessons)
        .then((data) => {
          if (seq !== rangeFetchSeqRef.current) return
          logCalendarFetch('success', data.length)
          rangeCacheRef.current.set(cacheKey, data)
          setLessons(data)
          if (nextView === 'month') {
            syncMonthPool(date, data)
          }
          lessonHistory.clear()
        })
        .catch((error) => {
          if (seq !== rangeFetchSeqRef.current) return
          console.error(error)
          logCalendarFetch('error', error)
          toast.error('일정을 불러오지 못했습니다.')
        })
        .finally(() => {
          if (seq === rangeFetchSeqRef.current) {
            rangeFetchInFlightKeyRef.current = null
            isFetchingRef.current = false
            setIsFetching(false)
            logCalendarFetch('end')
          }
        })
    },
    [lessonHistory, rangeCacheKey, syncMonthPool, instructorFilter],
  )

  function handleViewChange(nextView: CalendarView) {
    if (nextView === view) return
    setView(nextView)
    if (nextView === 'day') {
      setCurrentDate(agendaSelectedDate)
      loadRange(agendaSelectedDate, nextView)
      return
    }
    setAgendaSelectedDate(currentDate)
    if (nextView === 'month') {
      setSearchPoolKey(null)
    }
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
    if (view === 'month') {
      setSearchPoolKey(null)
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

  function openCreateDialog(d: LessonDraft) {
    clearLessonSelection()
    setEditingLesson(null)
    setDraft(d)
    setCreateOpen(true)
  }

  function openEditDialog(lesson: Lesson, anchor?: LessonEditAnchor) {
    clearLessonSelection()
    setDraft(null)
    setEditingLesson(lesson)
    setEditAnchor(anchor ?? null)
    setEditOpen(true)
  }

  function handleLessonActivate(
    lesson: Lesson,
    anchor?: LessonEditAnchor,
    options?: { altKey?: boolean },
  ) {
    if (options?.altKey) {
      toggleLessonSelection(lesson.id)
      return
    }
    openEditDialog(lesson, anchor)
  }

  const handleDeleteSelectedLessons = useCallback(async () => {
    if (selectionCount === 0) return

    const targets = searchLessons.filter((lesson) =>
      selectedLessonIds.has(lesson.id),
    )
    if (targets.length === 0) {
      clearLessonSelection()
      return
    }

    if (
      !window.confirm(
        `선택한 ${targets.length}개 수업을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
      )
    ) {
      return
    }

    setIsDeleting(true)
    const results = await Promise.all(
      targets.map((lesson) => deleteLesson(lesson.id)),
    )
    setIsDeleting(false)

    const failed = results.filter((result) => result.error)
    const removed = targets.filter((_, index) => !results[index].error)

    if (removed.length > 0) {
      const removedIds = new Set(removed.map((lesson) => lesson.id))
      setLessons((prev) => prev.filter((lesson) => !removedIds.has(lesson.id)))
      setSearchPoolLessons((prev) =>
        prev.filter((lesson) => !removedIds.has(lesson.id)),
      )
      lessonHistory.pushLessonBulkDelete(removed)
    }

    clearLessonSelection()
    setEditOpen(false)
    setEditingLesson(null)
    setEditAnchor(null)

    if (failed.length > 0) {
      toast.error('일부 수업 삭제 실패', {
        description: failed[0].error ?? `${failed.length}건 실패`,
      })
    }
    if (removed.length > 0) {
      toast.success(`${removed.length}개 수업을 삭제했습니다.`)
    }
  }, [
    selectionCount,
    selectedLessonIds,
    searchLessons,
    clearLessonSelection,
    setIsDeleting,
    lessonHistory,
  ])

  const deleteSelectedRef = useRef(handleDeleteSelectedLessons)
  deleteSelectedRef.current = handleDeleteSelectedLessons

  useEffect(() => {
    registerDeleteSelected(() => {
      void deleteSelectedRef.current()
    })
    return () => registerDeleteSelected(null)
  }, [registerDeleteSelected, handleDeleteSelectedLessons])

  const undoRef = useRef(lessonHistory.undo)
  undoRef.current = lessonHistory.undo
  const redoRef = useRef(lessonHistory.redo)
  redoRef.current = lessonHistory.redo

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (createOpen || editOpen) return
      if (isEditableTarget(e.target)) return

      if (e.key === 'Escape' && selectionCount > 0) {
        e.preventDefault()
        clearLessonSelection()
        return
      }

      const undoRedo = matchCalendarUndoRedo(e)
      if (undoRedo === 'undo' && lessonHistory.canUndo && !e.repeat) {
        e.preventDefault()
        void undoRef.current()
        return
      }
      if (undoRedo === 'redo' && lessonHistory.canRedo && !e.repeat) {
        e.preventDefault()
        void redoRef.current()
        return
      }

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

    function handleKeyUp(e: KeyboardEvent) {
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

    document.addEventListener('keydown', handleKeyDown, { capture: true })
    document.addEventListener('keyup', handleKeyUp, { capture: true })
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
      document.removeEventListener('keyup', handleKeyUp, { capture: true })
    }
  }, [
    createOpen,
    editOpen,
    selectionCount,
    clearLessonSelection,
    lessonHistory.canUndo,
    lessonHistory.canRedo,
  ])

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

    loadRange(lessonDate, nextView, { force: true })
  }

  function handleLessonDeleted(lessonIds: string[]) {
    const idSet = new Set(lessonIds)
    const removed = [...lessons, ...searchPoolLessons].filter((lesson) =>
      idSet.has(lesson.id),
    )
    const uniqueRemoved = Array.from(
      new Map(removed.map((lesson) => [lesson.id, lesson])).values(),
    )

    setLessons((prev) => prev.filter((l) => !idSet.has(l.id)))
    setSearchPoolLessons((prev) => prev.filter((l) => !idSet.has(l.id)))
    for (const lesson of uniqueRemoved) {
      lessonHistory.pushLessonDelete(lesson)
    }

    rangeCacheRef.current.delete(rangeCacheKey(currentDate, view))
    loadRange(currentDate, view, { force: true })
  }

  const handleLessonSaved = useCallback(
    (lesson: Lesson) => {
      rangeFetchSeqRef.current += 1
      const enriched = enrichLessonWithInstructorCatalog(lesson, instructors)

      setLessons((prev) => {
        const before = prev.find((item) => item.id === enriched.id)
        const exists = Boolean(before)

        if (before) {
          lessonHistory.pushLessonUpdate(before, enriched)
        } else {
          lessonHistory.pushLessonCreate(enriched)
        }

        const next = exists
          ? prev.map((l) => (l.id === enriched.id ? enriched : l))
          : [...prev, enriched]
        rangeCacheRef.current.set(rangeCacheKey(currentDate, view), next)
        return next
      })
      setSearchPoolLessons((prev) => {
        const exists = prev.some((item) => item.id === enriched.id)
        if (exists) {
          return prev.map((l) => (l.id === enriched.id ? enriched : l))
        }
        return [...prev, enriched]
      })
    },
    [lessonHistory, currentDate, view, rangeCacheKey, instructors],
  )

  const lessonSavedRef = useRef(handleLessonSaved)
  lessonSavedRef.current = handleLessonSaved

  useEffect(() => {
    registerLessonSaved((lesson) => lessonSavedRef.current(lesson))
    return () => registerLessonSaved(null)
  }, [registerLessonSaved])

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
      const after = enrichLessonWithInstructorCatalog(result.data, instructors)
      lessonHistory.pushLessonUpdate(target, after)
      setLessons((prev) =>
        prev.map((l) => (l.id === target.id ? after : l)),
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
      <div
        className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        data-calendar-toolbar
      >
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
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            title="오늘 (Ctrl+Space, Ctrl+Shift+Space)"
          >
            오늘
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleNavigate(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="ml-1 flex items-center gap-2 text-base font-semibold sm:text-lg">
            {title}
            {isFetching && (
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

          {selectionCount > 0 && (
            <span className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">
              {selectionCount}개 선택 · 휴지통으로 삭제 · Esc 해제
            </span>
          )}
          {(lessonHistory.canUndo || lessonHistory.canRedo) && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {lessonHistory.canUndo
                ? `Ctrl+Z (${lessonHistory.undoCount}단계)`
                : ''}
              {lessonHistory.canUndo && lessonHistory.canRedo ? ' · ' : ''}
              {lessonHistory.canRedo
                ? `Ctrl+Y (${lessonHistory.redoCount}단계)`
                : ''}
            </span>
          )}
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
            onLessonActivate={handleLessonActivate}
            onLessonLineUpdate={handleLessonLineUpdate}
            isLessonSelected={isLessonSelected}
            onClearLessonSelection={clearLessonSelection}
          />
        )}

        {view === 'week' && (
          <DayWeekView
            dates={weekDates}
            selectedDate={agendaSelectedDate}
            onSelectDate={setAgendaSelectedDate}
            lessons={filteredLessons}
            instructors={instructors}
            members={members}
            onDragCreate={openCreateDialog}
            onLessonMove={handleLessonMove}
            onLessonActivate={handleLessonActivate}
            onLessonLineUpdate={handleLessonLineUpdate}
            onMemoSubmit={handleMemoSubmit}
            highlightedLessonIds={highlight?.lessonIds}
            selectedLessonIds={selectedLessonIds}
            isLessonSelected={isLessonSelected}
            onClearLessonSelection={clearLessonSelection}
          />
        )}

        {view === 'day' && (
          <DayWeekView
            dates={dayDates}
            selectedDate={agendaSelectedDate}
            onSelectDate={setAgendaSelectedDate}
            lessons={filteredLessons}
            instructors={instructors}
            members={members}
            onDragCreate={openCreateDialog}
            onLessonMove={handleLessonMove}
            onLessonActivate={handleLessonActivate}
            onLessonLineUpdate={handleLessonLineUpdate}
            onMemoSubmit={handleMemoSubmit}
            compactHeader
            highlightedLessonIds={highlight?.lessonIds}
            selectedLessonIds={selectedLessonIds}
            isLessonSelected={isLessonSelected}
            onClearLessonSelection={clearLessonSelection}
          />
        )}
      </div>

      {(editOpen || createOpen) && (
        <>
          {editOpen && (
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
              onEditDraftChange={({ instructorId }) =>
                setEditDraftInstructorId(instructorId)
              }
            />
          )}

          {createOpen && (
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
          )}
        </>
      )}
    </div>
  )
}
