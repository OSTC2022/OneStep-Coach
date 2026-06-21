'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Redo2, RefreshCw, Undo2 } from 'lucide-react'
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
  updateLesson,
  updateLessonSeries,
} from '@/lib/actions/lessons'
import { useCalendarSelection } from '@/components/dashboard/calendar-selection-context'
import { useCalendarLessonHistory } from '@/lib/calendar-lesson-history'
import { enrichLessonWithInstructorCatalog } from '@/lib/instructor-colors'
import { normalizePrimaryInstructorId } from '@/lib/member-utils'
import { parseMemoQuickAdd } from '@/lib/memo-quick-add'
import type { MemoQuickAddPayload } from './month-memo-input'
import {
  getViewTitle,
  getWeekDates,
  getDefaultLessonCalendarLabel,
  isSameLessonSlot,
  isLessonScheduleEnded,
  resolveLessonDurationMinutes,
  shiftEndTimeByDuration,
  minutesToTimeString,
  navigateDate,
  parseTimeToMinutes,
  enrichLessonWithMemberCatalog,
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
  fetchCalendarLessons,
  filterLessonsByCoach,
  getCachedLessons,
  prefetchAdjacentCalendarRanges,
  resolveRangeKey,
  seedCalendarCache,
  setCachedLessons,
} from '@/lib/calendar-data-store'
import { pullGoogleCalendarChanges, isGoogleCalendarPollingEnabled } from '@/lib/actions/google-calendar-sync'
import {
  logCalendarFetch,
  withCalendarFetchTimeout,
} from '@/lib/calendar-client-fetch'
import { normalizeCalendarLessonsForDisplay } from '@/lib/calendar-recurrence/expand-lessons'
import {
  isPersistedRecurringLesson,
  parseVirtualLessonId,
} from '@/lib/calendar-recurrence/types'

/** 캘린더 페이지가 열려 있는 동안 Google → 앱 증분 동기화 (Vercel Cron 대신) */
const GOOGLE_SYNC_POLL_MS = 60_000

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

function isFetchAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    error.name === 'AbortError'
  )
}

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
  const [view, setView] = useState<CalendarView>('month')
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
  const [loadState, setLoadState] = useState({
    initialLoading: false,
    backgroundLoading: false,
    refreshing: false,
    error: null as string | null,
    hasRangeCache: true,
  })
  const monthPoolInFlightRef = useRef(false)
  const calendarRootRef = useRef<HTMLDivElement>(null)
  const hasSeededCacheRef = useRef(false)
  const googleInboundSyncedRef = useRef(false)
  const googlePollInFlightRef = useRef(false)
  const googlePollEnabledRef = useRef(false)
  const lessonsRef = useRef(lessons)
  lessonsRef.current = lessons
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
    () =>
      normalizeCalendarLessonsForDisplay(
        mergeLessonsById(searchPoolLessons, lessons)
          .filter((item) => item.event_type !== 'recurring_master')
          .map((item) => enrichLessonWithMemberCatalog(item, members)),
      ),
    [searchPoolLessons, lessons, members],
  )

  const lessonsWithEditPreview = useMemo(() => {
    if (!editOpen || !editingLesson?.id || editDraftInstructorId == null) {
      return searchLessons
    }

    const normalizedId = normalizePrimaryInstructorId(editDraftInstructorId)

    return searchLessons.map((item) => {
      if (item.id !== editingLesson.id) return item
      return enrichLessonWithInstructorCatalog(
        enrichLessonWithMemberCatalog(
          { ...item, instructor_id: normalizedId },
          members,
        ),
        instructors,
      )
    })
  }, [searchLessons, editOpen, editingLesson, editDraftInstructorId, instructors, members])

  const filteredLessons = useMemo(
    () => filterLessonsByCoach(lessonsWithEditPreview, instructorFilter),
    [lessonsWithEditPreview, instructorFilter],
  )

  const syncMonthPool = useCallback(
    (date: Date, data: Lesson[]) => {
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`
      setSearchPoolKey(key)
      setSearchPoolLessons((prev) => mergeLessonsById(prev, data))
      setLessons((prev) => mergeLessonsById(prev, data))
      const { cacheKey } = resolveRangeKey(date, 'month', 'all')
      setCachedLessons(cacheKey, data)
    },
    [],
  )

  const applyCachedRange = useCallback((date: Date, nextView: CalendarView) => {
    const { cacheKey } = resolveRangeKey(date, nextView, 'all')
    const cached = getCachedLessons(cacheKey)
    if (cached) {
      setLessons(cached)
      setLoadState((prev) => ({ ...prev, hasRangeCache: true, error: null }))
      return true
    }
    // Keep showing previous lessons while the new range loads (avoid blank calendar).
    setLoadState((prev) => ({ ...prev, hasRangeCache: false }))
    return false
  }, [])

  const syncRange = useCallback(
    async (
      date: Date,
      nextView: CalendarView,
      options?: { force?: boolean; refreshing?: boolean },
    ) => {
      const { cacheKey } = resolveRangeKey(date, nextView, 'all')
      const hadCache = getCachedLessons(cacheKey) != null

      setLoadState((prev) => ({
        ...prev,
        hasRangeCache: hadCache,
        backgroundLoading: hadCache && !options?.refreshing,
        refreshing: Boolean(options?.refreshing),
        initialLoading: !hadCache && !options?.refreshing,
        error: null,
      }))

      const shouldReplacePool = Boolean(options?.force || options?.refreshing)
      const lessonsBeforeFetch = lessonsRef.current

      const fetchOnce = () =>
        fetchCalendarLessons({
          date,
          view: nextView,
          coachId: 'all',
          mode: options?.refreshing
            ? 'refresh'
            : hadCache
              ? 'background'
              : 'initial',
          force: options?.force,
        })

      try {
        let data: Lesson[]
        try {
          data = await fetchOnce()
        } catch (firstError) {
          if (isFetchAbort(firstError)) {
            setLoadState((prev) => ({
              ...prev,
              initialLoading: false,
              backgroundLoading: false,
              refreshing: false,
            }))
            return
          }
          await new Promise((resolve) => window.setTimeout(resolve, 300))
          data = await fetchOnce()
        }

        setLessons(data)
        setCachedLessons(cacheKey, data)

        if (shouldReplacePool) {
          setSearchPoolLessons(data)
          if (nextView === 'month') {
            setSearchPoolKey(`${date.getFullYear()}-${date.getMonth() + 1}`)
          }
        } else if (nextView === 'month') {
          syncMonthPool(date, data)
        }

        if (!options?.refreshing) {
          lessonHistory.clear()
        }
        setLoadState({
          initialLoading: false,
          backgroundLoading: false,
          refreshing: false,
          error: null,
          hasRangeCache: true,
        })
      } catch (error) {
        if (isFetchAbort(error)) {
          setLoadState((prev) => ({
            ...prev,
            initialLoading: false,
            backgroundLoading: false,
            refreshing: false,
          }))
          return
        }

        const message =
          error instanceof Error ? error.message : '일정 로드 실패'
        const cachedAfterFailure = getCachedLessons(cacheKey)
        if (cachedAfterFailure) {
          setLessons(cachedAfterFailure)
        } else if (lessonsBeforeFetch.length > 0) {
          setLessons(lessonsBeforeFetch)
        }

        setLoadState((prev) => ({
          ...prev,
          initialLoading: false,
          backgroundLoading: false,
          refreshing: false,
          error: message,
          hasRangeCache:
            cachedAfterFailure != null || lessonsBeforeFetch.length > 0,
        }))
        const hasFallback =
          cachedAfterFailure != null || lessonsBeforeFetch.length > 0
        if (!hasFallback) {
          toast.error('일정을 불러오지 못했습니다.', {
            description: message.includes('timeout')
              ? '15초 이상 응답이 없습니다. 다시 시도해 주세요.'
              : '새로고침 버튼으로 다시 시도해 주세요.',
          })
        }
      }

      prefetchAdjacentCalendarRanges(date, nextView, 'all')
    },
    [lessonHistory, syncMonthPool],
  )

  const navigateRange = useCallback(
    (
      date: Date,
      nextView: CalendarView,
      options?: { force?: boolean; refreshing?: boolean },
    ) => {
      applyCachedRange(date, nextView)
      void syncRange(date, nextView, options)
    },
    [applyCachedRange, syncRange],
  )

  useEffect(() => {
    if (hasSeededCacheRef.current) return
    hasSeededCacheRef.current = true
    seedCalendarCache(currentDate, view, initialLessons, 'all')

    const { dateFrom, dateTo, cacheKey } = resolveRangeKey(
      currentDate,
      'month',
      'all',
    )
    if (!getCachedLessons(cacheKey)) {
      const monthSubset = initialLessons.filter(
        (lesson) =>
          lesson.lesson_date >= dateFrom && lesson.lesson_date <= dateTo,
      )
      if (monthSubset.length > 0) {
        setCachedLessons(cacheKey, monthSubset)
      }
    }

    prefetchAdjacentCalendarRanges(currentDate, view, 'all')
    void fetchCalendarLessons({
      date: currentDate,
      view: 'month',
      coachId: 'all',
      mode: 'prefetch',
    }).catch(() => {})
  }, [currentDate, view, initialLessons])

  const refreshWithGoogleSync = useCallback(
    async (options?: { force?: boolean; refreshing?: boolean }) => {
      const pull = await pullGoogleCalendarChanges()
      if (options?.force || (pull.synced && pull.changed > 0)) {
        await syncRange(currentDate, view, {
          force: true,
          refreshing: options?.refreshing ?? pull.changed > 0,
        })
      }
    },
    [currentDate, syncRange, view],
  )

  useEffect(() => {
    let cancelled = false
    void isGoogleCalendarPollingEnabled().then((enabled) => {
      if (!cancelled) googlePollEnabledRef.current = enabled
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (googleInboundSyncedRef.current) return
    if (!googlePollEnabledRef.current) {
      void isGoogleCalendarPollingEnabled().then((enabled) => {
        googlePollEnabledRef.current = enabled
        if (!enabled || googleInboundSyncedRef.current) return
        googleInboundSyncedRef.current = true
        void refreshWithGoogleSync({ force: true, refreshing: true })
      })
      return
    }
    googleInboundSyncedRef.current = true
    void refreshWithGoogleSync({ force: true, refreshing: true })
  }, [refreshWithGoogleSync])

  useEffect(() => {
    if (typeof document === 'undefined') return

    let intervalId: number | null = null
    let cancelled = false

    const startPolling = (enabled: boolean) => {
      if (cancelled || !enabled) return

      const tick = () => {
        if (document.hidden || googlePollInFlightRef.current || !googlePollEnabledRef.current) {
          return
        }
        googlePollInFlightRef.current = true
        void pullGoogleCalendarChanges()
          .then((result) => {
            if (!result.synced || result.changed <= 0) return
            return syncRange(currentDate, view, { force: true, refreshing: true })
          })
          .finally(() => {
            googlePollInFlightRef.current = false
          })
      }

      tick()
      intervalId = window.setInterval(tick, GOOGLE_SYNC_POLL_MS)
    }

    void isGoogleCalendarPollingEnabled().then((enabled) => {
      googlePollEnabledRef.current = enabled
      startPolling(enabled)
    })

    const onVisibility = () => {
      if (!document.hidden && googlePollEnabledRef.current) {
        void pullGoogleCalendarChanges()
          .then((result) => {
            if (!result.synced || result.changed <= 0) return
            return syncRange(currentDate, view, { force: true, refreshing: true })
          })
      }
    }
    const onFocus = onVisibility
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      if (intervalId !== null) window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [currentDate, syncRange, view])

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
    instructorFilter,
  ])

  async function handleRefresh() {
    if (loadState.refreshing) return
    await refreshWithGoogleSync({ force: true, refreshing: true })
  }

  function handleViewChange(nextView: CalendarView) {
    if (nextView === view) return
    setView(nextView)
    if (nextView === 'day') {
      setCurrentDate(agendaSelectedDate)
      applyCachedRange(agendaSelectedDate, nextView)
      void syncRange(agendaSelectedDate, nextView)
      return
    }
    setAgendaSelectedDate(currentDate)
    if (nextView === 'month') {
      setSearchPoolKey(null)
    }
    applyCachedRange(currentDate, nextView)
    void syncRange(currentDate, nextView)
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
    applyCachedRange(next, view)
    void syncRange(next, view)
  }

  function goToToday() {
    const today = new Date()
    setCurrentDate(today)
    setAgendaSelectedDate(today)
    applyCachedRange(today, view)
    void syncRange(today, view)
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

    applyCachedRange(lessonDate, nextView)
    void syncRange(lessonDate, nextView, { force: true, refreshing: true })
  }

  function handleLessonDeleted(lessonIds: string[]) {
    const idSet = new Set(lessonIds)
    const virtualOccurrences = new Map<string, Set<string>>()

    for (const id of lessonIds) {
      const virtual = parseVirtualLessonId(id)
      if (!virtual) continue
      const dates = virtualOccurrences.get(virtual.masterId) ?? new Set<string>()
      dates.add(virtual.occurrenceDate)
      virtualOccurrences.set(virtual.masterId, dates)
    }

    const shouldRemove = (lesson: Lesson) => {
      if (idSet.has(lesson.id)) return true

      for (const [masterId, dates] of virtualOccurrences) {
        const virtual = parseVirtualLessonId(lesson.id)
        if (virtual?.masterId === masterId && dates.has(virtual.occurrenceDate)) {
          return true
        }
        if (lesson.recurring_master_id === masterId && dates.has(lesson.lesson_date)) {
          return true
        }
      }

      return false
    }

    const removed = [...lessons, ...searchPoolLessons].filter(shouldRemove)
    const uniqueRemoved = Array.from(
      new Map(removed.map((lesson) => [lesson.id, lesson])).values(),
    )

    setLessons((prev) => {
      const next = prev.filter((lesson) => !shouldRemove(lesson))
      const { cacheKey } = resolveRangeKey(currentDate, view, 'all')
      setCachedLessons(cacheKey, next)
      return next
    })
    setSearchPoolLessons((prev) => prev.filter((lesson) => !shouldRemove(lesson)))
    for (const lesson of uniqueRemoved) {
      lessonHistory.pushLessonDelete(lesson)
    }

    void syncRange(currentDate, view, { force: true, refreshing: true })
  }

  const handleLessonSaved = useCallback(
    (lesson: Lesson) => {
      const needsRecurrenceRefresh =
        lesson.event_type === 'recurring_master' ||
        parseVirtualLessonId(lesson.id) != null ||
        isPersistedRecurringLesson(lesson) ||
        Boolean(lesson.recurrence_pattern && lesson.recurrence_pattern !== 'none')

      if (needsRecurrenceRefresh) {
        void syncRange(currentDate, view, { force: true, refreshing: true })
        return
      }

      const enriched = enrichLessonWithInstructorCatalog(lesson, instructors)
      const before = lessonsRef.current.find((item) => item.id === enriched.id)

      if (before && before.lesson_date !== enriched.lesson_date) {
        setAgendaSelectedDate(
          new Date(`${enriched.lesson_date}T12:00:00`),
        )
      }

      setLessons((prev) => {
        const prevBefore = prev.find((item) => item.id === enriched.id)
        const exists = Boolean(prevBefore)

        if (prevBefore) {
          lessonHistory.pushLessonUpdate(prevBefore, enriched)
        } else {
          lessonHistory.pushLessonCreate(enriched)
        }

        const next = exists
          ? prev.map((l) => (l.id === enriched.id ? enriched : l))
          : [...prev, enriched]
        const { cacheKey } = resolveRangeKey(currentDate, view, 'all')
        setCachedLessons(cacheKey, next)
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
    [lessonHistory, currentDate, view, instructors, syncRange],
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

    const updates = {
      lesson_date: update.date,
      start_time: update.startTime,
      end_time: update.endTime,
    }

    const virtual = parseVirtualLessonId(target.id)
    const usesSeriesUpdate =
      virtual != null ||
      Boolean(target.recurring_master_id) ||
      isPersistedRecurringLesson(target)

    if (usesSeriesUpdate) {
      const result = await updateLessonSeries(
        target.id,
        updates,
        'single',
        virtual?.occurrenceDate ?? target.lesson_date,
      )

      if (result.error) {
        toast.error('수업 일정 변경 실패', { description: result.error })
        return
      }

      lessonHistory.pushLessonUpdate(target, { ...target, ...updates })
      void syncRange(currentDate, view, { force: true, refreshing: true })
      toast.message('수업 일정 이동', {
        description: '상단 실행 취소(↩)로 되돌릴 수 있습니다.',
      })
      return
    }

    const result = await updateLesson(target.id, updates)

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

    toast.message('수업 일정 이동', {
      description: '상단 실행 취소(↩)로 되돌릴 수 있습니다.',
    })
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
      startTime = parsed.startTime
      if (!isLessonScheduleEnded(lesson.lesson_date, lesson.end_time)) {
        const duration = resolveLessonDurationMinutes(
          lesson.start_time,
          lesson.end_time,
        )
        const shiftedEnd = shiftEndTimeByDuration(parsed.startTime, duration)
        if (shiftedEnd) {
          endTime = shiftedEnd
        }
      }
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
  const rangeLoading =
    loadState.initialLoading ||
    loadState.backgroundLoading ||
    loadState.refreshing
  const showToolbarSpinner =
    loadState.backgroundLoading || loadState.refreshing
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
      data-calendar-scope
      tabIndex={-1}
      className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-2 pb-4 pt-2 outline-none"
      onPointerDown={(e) => {
        if (isEditableTarget(e.target)) return
        calendarRootRef.current?.focus({ preventScroll: true })
      }}
    >
      <div
        className="flex shrink-0 flex-col gap-1 overflow-x-clip"
        data-calendar-toolbar
      >
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <CalendarInstructorList
              instructors={instructors}
              lessons={searchLessons}
              currentDate={currentDate}
              view={view}
              highlightedLessonIds={highlight?.lessonIds}
              onLoadMonthPool={loadSearchPool}
              onSelectLesson={handleListSelectLesson}
              onEditLesson={handleListEditLesson}
              className="shrink-0"
            />
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleNavigate(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5"
                onClick={goToToday}
                title="오늘 (Ctrl+Space, Ctrl+Shift+Space)"
              >
                오늘
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleNavigate(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleRefresh}
                disabled={loadState.refreshing}
                title="일정 새로고침"
                aria-label="일정 새로고침"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loadState.refreshing ? 'animate-spin' : ''}`}
                />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={!lessonHistory.canUndo}
                onClick={() => void lessonHistory.undo()}
                title={
                  lessonHistory.canUndo
                    ? `실행 취소 (${lessonHistory.undoCount}단계 · Ctrl+Z)`
                    : '실행 취소'
                }
                aria-label={
                  lessonHistory.canUndo
                    ? `실행 취소 ${lessonHistory.undoCount}단계`
                    : '실행 취소'
                }
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={!lessonHistory.canRedo}
                onClick={() => void lessonHistory.redo()}
                title={
                  lessonHistory.canRedo
                    ? `다시 실행 (${lessonHistory.redoCount}단계 · Ctrl+Y)`
                    : '다시 실행'
                }
                aria-label={
                  lessonHistory.canRedo
                    ? `다시 실행 ${lessonHistory.redoCount}단계`
                    : '다시 실행'
                }
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
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
          {lessonHistory.canUndo ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              실행 취소 {lessonHistory.undoCount}단계
            </span>
          ) : null}
          </div>
        </div>
        <h2 className="min-w-0 truncate whitespace-nowrap text-sm font-semibold">
          {title}
          {showToolbarSpinner && (
            <Loader2 className="ml-1.5 inline h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </h2>
      </div>

      <div
        data-calendar-panel
        className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
      >
        {loadState.error && (
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span className="min-w-0 truncate">
              일정을 불러오지 못했습니다.{' '}
              {loadState.error.includes('timeout')
                ? '응답 시간이 초과되었습니다.'
                : '네트워크 또는 서버 오류일 수 있습니다.'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={loadState.refreshing}
              onClick={handleRefresh}
            >
              다시 시도
            </Button>
          </div>
        )}

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
            rangeLoading={rangeLoading}
            hasRangeCache={loadState.hasRangeCache}
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
            rangeLoading={rangeLoading}
            hasRangeCache={loadState.hasRangeCache}
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
