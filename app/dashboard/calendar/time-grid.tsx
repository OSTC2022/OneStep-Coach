'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Loader2, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  getInstructorCalendarColor,
  getLessonCalendarBlockStyle,
  getLessonCalendarBlockTextStyle,
  resolveLessonDisplayColor,
  resolveLessonInstructor,
  hexToRgba,
  type InstructorColorSource,
} from '@/lib/instructor-colors'
import { getRecurrenceDisplayLabel } from '@/lib/calendar-recurrence/types'
import { getDateColorClass, isKoreanHoliday } from '@/lib/korean-holidays'
import {
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  DEFAULT_HOUR_HEIGHT,
  HOUR_HEIGHT_ZOOM_STEP,
  MAX_HOUR_HEIGHT,
  MIN_HOUR_HEIGHT,
  computeLessonColumnLayouts,
  getEventStyle,
  getGridHeight,
  getLessonBlockHorizontalStyle,
  getLessonCalendarDisplayParts,
  getLessonCalendarLabel,
  getLessonDurationMinutes,
  isSameDay,
  minutesToHeight,
  minutesToTimeString,
  minutesToTop,
  parseTimeToMinutes,
  snapDragTop,
  toDateKey,
  yToDragMinutes,
  type LessonDraft,
  type LessonEditAnchor,
} from '@/lib/calendar-utils'
import type { Instructor, Lesson } from '@/lib/types'

interface TimeGridProps {
  dates: Date[]
  lessons: Lesson[]
  instructors?: Instructor[]
  selectedDate?: Date
  onSelectDate?: (date: Date) => void
  onDragCreate: (draft: LessonDraft) => void
  onLessonMove?: (
    lessonId: string,
    update: { date: string; startTime: string; endTime: string },
  ) => void
  onLessonEdit?: (lesson: Lesson, anchor?: LessonEditAnchor) => void
  onLessonActivate?: (
    lesson: Lesson,
    anchor?: LessonEditAnchor,
    options?: { altKey?: boolean },
  ) => void
  isLessonSelected?: (lessonId: string) => boolean
  onClearLessonSelection?: () => void
  compactHeader?: boolean
  className?: string
  highlightedLessonIds?: string[]
  selectedLessonIds?: ReadonlySet<string>
  rangeLoading?: boolean
  hasRangeCache?: boolean
  /** 컨테이너 높이에 맞춰 시간축·블록을 함께 축소·확대 */
  fitHourHeight?: boolean
  /** 접힌 상태 — 요일·날짜 헤더만 표시 */
  collapsed?: boolean
}

const HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR },
  (_, i) => CALENDAR_START_HOUR + i,
)

const TIME_GUTTER_WIDTH_PX = 48
const WEEK_DAY_COLUMN_WIDTH_PX = 72

function getDayColumnClass(multiDay: boolean) {
  if (!multiDay) return 'min-w-0 flex-1'
  return 'min-w-0 max-md:w-[72px] max-md:shrink-0 max-md:flex-none md:min-w-0'
}

function getWeekRowClass(multiDay: boolean) {
  if (!multiDay) return 'flex w-full min-w-full'
  return cn(
    'w-full min-w-full max-md:flex md:grid',
  )
}

function getWeekRowStyle(
  multiDay: boolean,
  dayCount: number,
): React.CSSProperties | undefined {
  if (!multiDay) return undefined
  return {
    gridTemplateColumns: `3rem repeat(${dayCount}, minmax(0, 1fr))`,
  }
}

function touchDistance(touches: TouchList) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

function getColumnGridStyle(hourHeight: number): React.CSSProperties {
  const half = hourHeight / 2
  return {
    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${half - 1}px, rgba(45,55,72,0.28) ${half - 1}px, rgba(45,55,72,0.28) ${half}px, transparent ${half}px, transparent ${hourHeight - 1}px, rgba(45,55,72,0.55) ${hourHeight - 1}px, rgba(45,55,72,0.55) ${hourHeight}px)`,
    backgroundSize: `100% ${hourHeight}px`,
  }
}

type MoveDrag = {
  lessons: Lesson[]
  lesson: Lesson
  durationMin: number
  grabOffsetY: number
  anchor: LessonEditAnchor
}

type LessonPress = {
  lessons: Lesson[]
  lesson: Lesson
  col: number
  grabOffsetY: number
  startX: number
  startY: number
  originTop: number
  anchor: LessonEditAnchor
}

type MovePreview = {
  col: number
  top: number
}

type ResizeDrag = {
  lessons: Lesson[]
  lesson: Lesson
  col: number
  edge: 'start' | 'end'
  anchorStartMin: number
  anchorEndMin: number
}

const MIN_LESSON_MINUTES = 15
const DEFAULT_CREATE_DURATION_MIN = 60
const CLICK_SNAP_MINUTES = 30
const CALENDAR_START_MINUTES = CALENDAR_START_HOUR * 60
const CALENDAR_END_MINUTES = CALENDAR_END_HOUR * 60
const DRAG_THRESHOLD = 6
const CREATE_DRAG_THRESHOLD = 8
/** 길게 누른 뒤에만 수업 블록 이동 시작 */
const LESSON_LONG_PRESS_MS = 450
/** 길게 누르기 전에 이 거리 이상 움직이면 스크롤로 간주하고 취소 */
const LESSON_SCROLL_CANCEL_PX = 14
/** 길게 누른 뒤 드래그 시작 최소 이동(px) */
const LESSON_DRAG_THRESHOLD = 10

type PendingCreate = {
  col: number
  startMin: number
  endMin: number
}

type PendingAdjust = {
  col: number
  mode: 'move' | 'resize-start' | 'resize-end'
  grabOffsetY: number
  anchorStartMin: number
  anchorEndMin: number
}

function yToRawMinutes(y: number, hourHeight: number) {
  const raw = CALENDAR_START_HOUR * 60 + (y / hourHeight) * 60
  return Math.max(
    CALENDAR_START_MINUTES,
    Math.min(CALENDAR_END_MINUTES, raw),
  )
}

/** 클릭한 Y 위치 기준, 30분 격자에 맞춘 시작 시각 */
function snapToClickStart(minutes: number): number {
  const start = Math.floor(minutes / CLICK_SNAP_MINUTES) * CLICK_SNAP_MINUTES
  return Math.max(
    CALENDAR_START_MINUTES,
    Math.min(CALENDAR_END_MINUTES - DEFAULT_CREATE_DURATION_MIN, start),
  )
}

function getClickCreateSlotFromY(y: number, hourHeight: number) {
  const startMin = snapToClickStart(yToRawMinutes(y, hourHeight))
  return {
    startMin,
    endMin: Math.min(startMin + DEFAULT_CREATE_DURATION_MIN, CALENDAR_END_MINUTES),
  }
}

function isVerticallyScrollable(el: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(el)
  return (
    (overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflowY === 'overlay') &&
    el.scrollHeight > el.clientHeight + 1
  )
}

function findScrollableAncestor(
  start: HTMLElement | null,
  exclude?: HTMLElement,
): HTMLElement | null {
  let node = start
  while (node) {
    if (node !== exclude && isVerticallyScrollable(node)) {
      return node
    }
    node = node.parentElement
  }
  return null
}

function applyVerticalScroll(el: HTMLElement, deltaY: number): boolean {
  if (deltaY === 0) return false
  const maxScroll = el.scrollHeight - el.clientHeight
  if (maxScroll <= 0) return false
  const next = Math.min(maxScroll, Math.max(0, el.scrollTop + deltaY))
  if (next === el.scrollTop) return false
  el.scrollTop = next
  return true
}

const SLOT_INSET_PX = 4
const SLOT_GAP_PX = 2

type LessonLabelLayout = 'horizontal' | 'vertical'

function getLessonLabelLayout({
  columnCount,
  blockHeight,
  hourHeight,
}: {
  columnCount: number
  blockHeight: number
  hourHeight: number
}): LessonLabelLayout {
  if (columnCount > 1) return 'vertical'
  if (blockHeight < 52) return 'vertical'
  if (hourHeight <= 42) return 'vertical'
  return 'horizontal'
}

function getLessonLabelFontSizes(
  layout: LessonLabelLayout,
  blockHeight: number,
  name: string,
  meta: string,
  hasResizeHandles: boolean,
  showTime: boolean,
) {
  const handleInset = hasResizeHandles ? 12 : 0
  const contentHeight = Math.max(18, blockHeight - handleInset - 6)

  if (layout === 'vertical') {
    const maxChars = Math.max(name.length, meta.length, 2)
    const size = Math.min(11, Math.max(8, (contentHeight / maxChars) * 0.92))
    return {
      name: size,
      meta: Math.max(8, size - 0.5),
      time: Math.max(8, size - 1),
    }
  }

  const lineCount = 1 + (meta ? 1 : 0) + (showTime ? 1 : 0)
  const size = Math.min(13, Math.max(9, (contentHeight / lineCount) * 0.42))
  return {
    name: size,
    meta: Math.max(9, size - 0.5),
    time: Math.max(8, size - 1),
  }
}

function LessonBlockContent({
  lesson,
  start,
  end,
  columnCount,
  blockHeight,
  hourHeight,
  hasResizeHandles,
  instructors,
}: {
  lesson: Lesson
  start: string
  end: string
  columnCount: number
  blockHeight: number
  hourHeight: number
  hasResizeHandles: boolean
  instructors?: InstructorColorSource[]
}) {
  const { name, meta } = getLessonCalendarDisplayParts(lesson)
  const fullLabel = getLessonCalendarLabel(lesson)
  const layout = getLessonLabelLayout({ columnCount, blockHeight, hourHeight })
  const showTime = Boolean(start) && layout === 'horizontal' && blockHeight >= 56 && !meta
  const textStyle = getLessonCalendarBlockTextStyle(lesson, instructors)
  const sizes = getLessonLabelFontSizes(
    layout,
    blockHeight,
    name,
    meta,
    hasResizeHandles,
    showTime,
  )

  if (layout === 'vertical') {
    return (
      <div className="pointer-events-none flex h-full min-h-0 max-h-full w-full select-none items-center justify-center gap-0.5 px-1 py-0.5">
        <span
          className="max-h-full shrink-0 font-bold leading-none [text-orientation:mixed] [writing-mode:vertical-rl]"
          style={{ fontSize: sizes.name, ...textStyle }}
          title={fullLabel}
        >
          {name}
        </span>
        {meta && (
          <span
            className="max-h-full shrink-0 font-semibold leading-none [text-orientation:mixed] [writing-mode:vertical-rl]"
            style={{ fontSize: sizes.meta, ...textStyle }}
            title={fullLabel}
          >
            {meta}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="pointer-events-none flex h-full min-h-0 max-h-full w-full select-none flex-col items-center justify-center gap-0.5 px-1.5 py-1 text-center">
      <p
        className="max-w-full font-bold leading-snug"
        style={{ fontSize: sizes.name, ...textStyle }}
        title={fullLabel}
      >
        {name}
      </p>
      {meta && (
        <p
          className="max-w-full font-semibold leading-snug"
          style={{ fontSize: sizes.meta, ...textStyle }}
          title={fullLabel}
        >
          {meta}
        </p>
      )}
      {showTime && (
        <p
          className="max-w-full font-medium tabular-nums leading-snug opacity-90"
          style={{ fontSize: sizes.time, ...textStyle }}
        >
          {start}{end ? ` – ${end}` : ''}
        </p>
      )}
    </div>
  )
}

const MemoLessonBlockContent = memo(LessonBlockContent)

export function TimeGrid({
  dates,
  lessons,
  instructors = [],
  selectedDate,
  onSelectDate,
  onDragCreate,
  onLessonMove,
  onLessonEdit,
  onLessonActivate,
  isLessonSelected,
  onClearLessonSelection,
  compactHeader = false,
  className,
  highlightedLessonIds,
  selectedLessonIds,
  rangeLoading = false,
  hasRangeCache = true,
  fitHourHeight = false,
  collapsed = false,
}: TimeGridProps) {
  const activateLesson = onLessonActivate ?? onLessonEdit
  const scrollRef = useRef<HTMLDivElement>(null)
  const dayHeaderRef = useRef<HTMLDivElement>(null)
  const highlightedSet = useMemo(
    () => new Set(highlightedLessonIds ?? []),
    [highlightedLessonIds],
  )
  useEffect(() => {
    if (!highlightedLessonIds?.length) return
    const targetId = highlightedLessonIds[0]
    const timer = window.setTimeout(() => {
      const el = scrollRef.current?.querySelector(
        `[data-lesson-id="${targetId}"]`,
      ) as HTMLElement | null
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [highlightedLessonIds])

  const lessonsByDateKey = useMemo(() => {
    const map = new Map<string, Lesson[]>()
    for (const lesson of lessons) {
      const key = lesson.lesson_date
      const group = map.get(key) ?? []
      group.push(lesson)
      map.set(key, group)
    }
    for (const group of map.values()) {
      group.sort((a, b) =>
        (a.start_time ?? '').localeCompare(b.start_time ?? ''),
      )
    }
    return map
  }, [lessons])

  const columnLayoutsByDateKey = useMemo(() => {
    const map = new Map<
      string,
      ReturnType<typeof computeLessonColumnLayouts>
    >()
    for (const date of dates) {
      const key = toDateKey(date)
      map.set(
        key,
        computeLessonColumnLayouts(lessonsByDateKey.get(key) ?? []),
      )
    }
    return map
  }, [dates, lessonsByDateKey])

  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT)
  const hourHeightRef = useRef(hourHeight)
  hourHeightRef.current = hourHeight
  const gridHeight = getGridHeight(hourHeight)

  useEffect(() => {
    if (!fitHourHeight) return
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    function fitToContainer() {
      const headerHeight = dayHeaderRef.current?.offsetHeight ?? 48
      const available = scrollEl.clientHeight - headerHeight
      const hourCount = CALENDAR_END_HOUR - CALENDAR_START_HOUR
      if (available <= 0 || hourCount <= 0) return
      const fitted = available / hourCount
      setHourHeight(
        Math.max(MIN_HOUR_HEIGHT, Math.min(MAX_HOUR_HEIGHT, fitted)),
      )
    }

    const observer = new ResizeObserver(fitToContainer)
    observer.observe(scrollEl)
    fitToContainer()
    return () => observer.disconnect()
  }, [fitHourHeight, dates.length, compactHeader])
  const isMultiDay = dates.length > 1
  const gridMinWidth = isMultiDay
    ? TIME_GUTTER_WIDTH_PX + dates.length * WEEK_DAY_COLUMN_WIDTH_PX
    : undefined
  const dayColumnClass = getDayColumnClass(isMultiDay)
  const weekRowClass = getWeekRowClass(isMultiDay)
  const weekRowStyle = getWeekRowStyle(isMultiDay, dates.length)
  const zoomPercent = Math.round((hourHeight / DEFAULT_HOUR_HEIGHT) * 100)

  const zoomIn = useCallback(() => {
    setHourHeight((prev) =>
      Math.min(MAX_HOUR_HEIGHT, prev + HOUR_HEIGHT_ZOOM_STEP),
    )
  }, [])

  const zoomOut = useCallback(() => {
    setHourHeight((prev) =>
      Math.max(MIN_HOUR_HEIGHT, prev - HOUR_HEIGHT_ZOOM_STEP),
    )
  }, [])
  const columnGridStyle = useMemo(
    () => getColumnGridStyle(hourHeight),
    [hourHeight],
  )
  const minLessonHeight = Math.max(36, hourHeight * 0.45)
  const dragRafRef = useRef<number | null>(null)
  const columnRefs = useRef<(HTMLDivElement | null)[]>([])
  const dragCaptureRef = useRef<{ pointerId: number } | null>(null)
  const dragPointerIdRef = useRef<number | null>(null)
  const dragScrollTopRef = useRef(0)
  const lessonDragStartedRef = useRef(false)
  const altSelectClickRef = useRef(false)
  const pendingAdjustStartedRef = useRef(false)
  const pendingSkipClickRef = useRef(false)
  const pendingSkipClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const [drag, setDrag] = useState<{
    col: number
    startY: number
    currentY: number
  } | null>(null)
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null)
  const [pendingAdjust, setPendingAdjust] = useState<PendingAdjust | null>(null)
  const [lessonPress, setLessonPress] = useState<LessonPress | null>(null)
  const [moveDrag, setMoveDrag] = useState<MoveDrag | null>(null)
  const [movePreview, setMovePreview] = useState<MovePreview | null>(null)
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag | null>(null)
  const [resizePreview, setResizePreview] = useState<{
    startMin: number
    endMin: number
  } | null>(null)
  const [longPressLessonId, setLongPressLessonId] = useState<string | null>(null)
  const longPressReadyRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function armPendingClickGuard() {
    pendingSkipClickRef.current = true
    if (pendingSkipClickTimerRef.current) {
      clearTimeout(pendingSkipClickTimerRef.current)
    }
    pendingSkipClickTimerRef.current = window.setTimeout(() => {
      pendingSkipClickRef.current = false
      pendingSkipClickTimerRef.current = null
    }, 500)
  }

  useEffect(() => {
    return () => {
      if (pendingSkipClickTimerRef.current) {
        clearTimeout(pendingSkipClickTimerRef.current)
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function handleWheel(e: WheelEvent) {
      if (fitHourHeight) return

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setHourHeight((prev) => {
          const delta = e.deltaY < 0 ? HOUR_HEIGHT_ZOOM_STEP : -HOUR_HEIGHT_ZOOM_STEP
          return Math.max(MIN_HOUR_HEIGHT, Math.min(MAX_HOUR_HEIGHT, prev + delta))
        })
        return
      }

      if (collapsed) return

      const target = e.target
      if (
        target instanceof HTMLElement &&
        target.closest('[data-resize-handle], [data-pending-resize]')
      ) {
        return
      }

      const deltaY = e.deltaY
      if (deltaY === 0) return

      const scrollTargets = [
        el,
        findScrollableAncestor(el.parentElement, el),
      ].filter((node): node is HTMLElement => node != null)

      for (const scrollEl of scrollTargets) {
        if (applyVerticalScroll(scrollEl, deltaY)) {
          e.preventDefault()
          return
        }
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [fitHourHeight, collapsed])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let pinchStartDistance: number | null = null
    let pinchStartHeight = hourHeightRef.current
    let pinchRafId: number | null = null
    let pendingPinchHeight: number | null = null

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        pinchStartDistance = touchDistance(e.touches)
        pinchStartHeight = hourHeightRef.current
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (fitHourHeight) return
      if (e.touches.length !== 2 || pinchStartDistance == null) return
      e.preventDefault()
      const distance = touchDistance(e.touches)
      const scale = distance / pinchStartDistance
      pendingPinchHeight = Math.round(
        Math.max(
          MIN_HOUR_HEIGHT,
          Math.min(MAX_HOUR_HEIGHT, pinchStartHeight * scale),
        ),
      )
      if (pinchRafId != null) return
      pinchRafId = window.requestAnimationFrame(() => {
        pinchRafId = null
        if (pendingPinchHeight != null) {
          setHourHeight(pendingPinchHeight)
          pendingPinchHeight = null
        }
      })
    }

    function handleTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) {
        pinchStartDistance = null
      }
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd)
    el.addEventListener('touchcancel', handleTouchEnd)
    return () => {
      if (pinchRafId != null) window.cancelAnimationFrame(pinchRafId)
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
      el.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [fitHourHeight])

  function getMinutesFromY(y: number) {
    return yToDragMinutes(y, hourHeight)
  }

  function getMaxDragTop(durationMin: number) {
    const blockHeight = Math.max(
      minutesToHeight(durationMin, hourHeight, minLessonHeight),
      minLessonHeight,
    )
    return Math.max(0, gridHeight - blockHeight)
  }

  function findColumnAt(clientX: number) {
    return columnRefs.current.findIndex((colEl) => {
      if (!colEl) return false
      const rect = colEl.getBoundingClientRect()
      return clientX >= rect.left && clientX <= rect.right
    })
  }

  function getYInColumn(clientY: number, col: number) {
    const colEl = columnRefs.current[col]
    if (!colEl) return null
    return clientY - colEl.getBoundingClientRect().top
  }

  function getPreviewFromPointer(
    clientX: number,
    clientY: number,
    grabOffsetY: number,
    durationMin = 60,
  ) {
    const col = findColumnAt(clientX)
    if (col === -1) return null
    const y = getYInColumn(clientY, col)
    if (y == null) return null
    const maxTop = getMaxDragTop(durationMin)
    const rawTop = y - grabOffsetY
    const top = snapDragTop(rawTop, hourHeight, maxTop)
    return { col, top }
  }

  function commitLessonUpdate(
    lessonId: string,
    col: number,
    startMin: number,
    endMin: number,
  ) {
    if (!onLessonMove) return
    onLessonMove(lessonId, {
      date: toDateKey(dates[col]),
      startTime: minutesToTimeString(startMin),
      endTime: minutesToTimeString(endMin),
    })
  }

  function isLessonMoving(lesson: Lesson) {
    return moveDrag?.lesson.id === lesson.id
  }

  function isLessonResizing(lesson: Lesson) {
    return resizeDrag?.lesson.id === lesson.id
  }

  useEffect(() => {
    if (!moveDrag) return

    function handlePointerMove(e: PointerEvent) {
      const preview = getPreviewFromPointer(
        e.clientX,
        e.clientY,
        moveDrag.grabOffsetY,
        moveDrag.durationMin,
      )
      if (preview) setMovePreview(preview)
    }

    function handlePointerUp(e: PointerEvent) {
      const preview = getPreviewFromPointer(
        e.clientX,
        e.clientY,
        moveDrag.grabOffsetY,
        moveDrag.durationMin,
      )
      if (preview) {
        const startMin = getMinutesFromY(preview.top)
        const endMin = startMin + moveDrag.durationMin
        const orig = moveDrag.lesson
        const origCol = dates.findIndex((d) => toDateKey(d) === orig.lesson_date)
        const origStart = parseTimeToMinutes(orig.start_time)
        const moved = preview.col !== origCol || startMin !== origStart
        if (moved) {
          commitLessonUpdate(moveDrag.lesson.id, preview.col, startMin, endMin)
        } else {
          activateLesson?.(moveDrag.lesson, moveDrag.anchor)
        }
      }
      lessonDragStartedRef.current = false
      setMoveDrag(null)
      setMovePreview(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [moveDrag, dates, gridHeight, hourHeight, onLessonMove, activateLesson])

  useEffect(() => {
    if (!lessonPress) return

    longPressReadyRef.current = false
    setLongPressLessonId(null)
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressReadyRef.current = true
      setLongPressLessonId(lessonPress.lesson.id)
    }, LESSON_LONG_PRESS_MS)

    function clearLongPressTimer() {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }

    function handlePointerMove(e: PointerEvent) {
      const dist = Math.hypot(
        e.clientX - lessonPress.startX,
        e.clientY - lessonPress.startY,
      )

      if (!longPressReadyRef.current) {
        if (dist >= LESSON_SCROLL_CANCEL_PX) {
          clearLongPressTimer()
          longPressReadyRef.current = false
          setLongPressLessonId(null)
          setLessonPress(null)
        }
        return
      }

      if (lessonDragStartedRef.current) return
      if (dist < LESSON_DRAG_THRESHOLD) return
      if (!onLessonMove) return

      clearLongPressTimer()
      lessonDragStartedRef.current = true
      setLongPressLessonId(null)
      setMoveDrag({
        lessons: lessonPress.lessons,
        lesson: lessonPress.lesson,
        durationMin: getLessonDurationMinutes(lessonPress.lesson),
        grabOffsetY: lessonPress.grabOffsetY,
        anchor: lessonPress.anchor,
      })
      const preview = getPreviewFromPointer(
        e.clientX,
        e.clientY,
        lessonPress.grabOffsetY,
        getLessonDurationMinutes(lessonPress.lesson),
      )
      setMovePreview(
        preview ?? { col: lessonPress.col, top: lessonPress.originTop },
      )
      setLessonPress(null)
    }

    function handlePointerUp() {
      clearLongPressTimer()
      setLongPressLessonId(null)

      if (altSelectClickRef.current) {
        altSelectClickRef.current = false
        longPressReadyRef.current = false
        setLessonPress(null)
        return
      }
      if (lessonDragStartedRef.current) {
        longPressReadyRef.current = false
        return
      }

      if (!longPressReadyRef.current) {
        longPressReadyRef.current = false
        activateLesson?.(lessonPress.lesson, lessonPress.anchor)
        setLessonPress(null)
        return
      }

      longPressReadyRef.current = false
      activateLesson?.(lessonPress.lesson, lessonPress.anchor)
      setLessonPress(null)
    }

    function handlePointerCancel() {
      clearLongPressTimer()
      longPressReadyRef.current = false
      setLongPressLessonId(null)
      setLessonPress(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      clearLongPressTimer()
      longPressReadyRef.current = false
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [lessonPress, onLessonMove, activateLesson, gridHeight, hourHeight, dates])

  useEffect(() => {
    if (!resizeDrag) return

    function handlePointerMove(e: PointerEvent) {
      const y = getYInColumn(e.clientY, resizeDrag.col)
      if (y == null) return

      if (resizeDrag.edge === 'end') {
        const nextEnd = Math.min(
          CALENDAR_END_MINUTES,
          Math.max(resizeDrag.anchorStartMin + MIN_LESSON_MINUTES, getMinutesFromY(y)),
        )
        setResizePreview({
          startMin: resizeDrag.anchorStartMin,
          endMin: nextEnd,
        })
        return
      }

      const nextStart = Math.max(
        CALENDAR_START_MINUTES,
        Math.min(resizeDrag.anchorEndMin - MIN_LESSON_MINUTES, getMinutesFromY(y)),
      )
      setResizePreview({
        startMin: nextStart,
        endMin: resizeDrag.anchorEndMin,
      })
    }

    function handlePointerUp(e: PointerEvent) {
      const y = getYInColumn(e.clientY, resizeDrag.col)
      if (y != null) {
        if (resizeDrag.edge === 'end') {
          const endMin = Math.min(
            CALENDAR_END_MINUTES,
            Math.max(resizeDrag.anchorStartMin + MIN_LESSON_MINUTES, getMinutesFromY(y)),
          )
          commitLessonUpdate(
            resizeDrag.lesson.id,
            resizeDrag.col,
            resizeDrag.anchorStartMin,
            endMin,
          )
        } else {
          const startMin = Math.max(
            CALENDAR_START_MINUTES,
            Math.min(resizeDrag.anchorEndMin - MIN_LESSON_MINUTES, getMinutesFromY(y)),
          )
          commitLessonUpdate(
            resizeDrag.lesson.id,
            resizeDrag.col,
            startMin,
            resizeDrag.anchorEndMin,
          )
        }
      }
      setResizeDrag(null)
      setResizePreview(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [resizeDrag, dates, hourHeight, onLessonMove])

  useEffect(() => {
    if (!pendingCreate) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setPendingCreate(null)
      setPendingAdjust(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [pendingCreate])

  useEffect(() => {
    if (!pendingAdjust || !pendingCreate) return

    function handlePointerMove(e: PointerEvent) {
      pendingAdjustStartedRef.current = true
      const y = getYInColumn(e.clientY, pendingAdjust.col)
      if (y == null) return

      const duration = pendingAdjust.anchorEndMin - pendingAdjust.anchorStartMin

      if (pendingAdjust.mode === 'move') {
        const maxTop = getMaxDragTop(duration)
        const top = snapDragTop(
          y - pendingAdjust.grabOffsetY,
          hourHeight,
          maxTop,
        )
        let startMin = getMinutesFromY(top)
        let endMin = startMin + duration
        if (endMin > CALENDAR_END_MINUTES) {
          endMin = CALENDAR_END_MINUTES
          startMin = endMin - duration
        }
        if (startMin < CALENDAR_START_MINUTES) {
          startMin = CALENDAR_START_MINUTES
          endMin = startMin + duration
        }
        setPendingCreate({
          col: pendingAdjust.col,
          startMin,
          endMin,
        })
        return
      }

      if (pendingAdjust.mode === 'resize-end') {
        const nextEnd = Math.min(
          CALENDAR_END_MINUTES,
          Math.max(
            pendingAdjust.anchorStartMin + MIN_LESSON_MINUTES,
            getMinutesFromY(y),
          ),
        )
        setPendingCreate({
          col: pendingAdjust.col,
          startMin: pendingAdjust.anchorStartMin,
          endMin: nextEnd,
        })
        return
      }

      const nextStart = Math.max(
        CALENDAR_START_MINUTES,
        Math.min(
          pendingAdjust.anchorEndMin - MIN_LESSON_MINUTES,
          getMinutesFromY(y),
        ),
      )
      setPendingCreate({
        col: pendingAdjust.col,
        startMin: nextStart,
        endMin: pendingAdjust.anchorEndMin,
      })
    }

    function handlePointerUp() {
      setPendingAdjust(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [pendingAdjust, pendingCreate, gridHeight, hourHeight])

  function confirmPendingCreate() {
    if (!pendingCreate) return
    onDragCreate({
      date: toDateKey(dates[pendingCreate.col]),
      startTime: minutesToTimeString(pendingCreate.startMin),
      endTime: minutesToTimeString(pendingCreate.endMin),
    })
    setPendingCreate(null)
    setPendingAdjust(null)
  }

  function handlePointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    col: number,
  ) {
    if ((e.target as HTMLElement).closest('[data-lesson-event]')) return
    if (!e.altKey) onClearLessonSelection?.()
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    dragPointerIdRef.current = e.pointerId
    dragCaptureRef.current = null
    dragScrollTopRef.current = scrollRef.current?.scrollTop ?? 0
    setDrag({ col, startY: y, currentY: y })
  }

  function handlePointerMove(
    e: React.PointerEvent<HTMLDivElement>,
    col: number,
  ) {
    if (!drag || drag.col !== col) return
    if (dragPointerIdRef.current !== e.pointerId) return

    const rect = e.currentTarget.getBoundingClientRect()
    const currentY = e.clientY - rect.top
    const dist = Math.abs(currentY - drag.startY)
    const scrollDelta = Math.abs(
      (scrollRef.current?.scrollTop ?? 0) - dragScrollTopRef.current,
    )

    if (!dragCaptureRef.current) {
      if (scrollDelta > 0) {
        setDrag(null)
        dragPointerIdRef.current = null
        return
      }
      if (dist >= CREATE_DRAG_THRESHOLD) {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragCaptureRef.current = { pointerId: e.pointerId }
      } else {
        return
      }
    }

    if (dragRafRef.current != null) return
    dragRafRef.current = window.requestAnimationFrame(() => {
      dragRafRef.current = null
      setDrag((prev) =>
        prev && prev.col === col ? { ...prev, currentY } : prev,
      )
    })
  }

  function handlePointerUp(
    e: React.PointerEvent<HTMLDivElement>,
    col: number,
  ) {
    if (!drag || drag.col !== col) return
    if (dragPointerIdRef.current !== e.pointerId) return

    const dragDistance = Math.abs(drag.currentY - drag.startY)
    const wasCaptured = dragCaptureRef.current?.pointerId === e.pointerId
    if (wasCaptured) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragCaptureRef.current = null
    dragPointerIdRef.current = null
    setDrag(null)

    if (dragDistance < CREATE_DRAG_THRESHOLD) {
      const slot = getClickCreateSlotFromY(drag.startY, hourHeight)
      setPendingCreate({ col, ...slot })
      armPendingClickGuard()
      e.preventDefault()
      return
    }

    const startMin = getMinutesFromY(Math.min(drag.startY, drag.currentY))
    let endMin = getMinutesFromY(Math.max(drag.startY, drag.currentY))
    if (endMin <= startMin) {
      endMin = startMin + DEFAULT_CREATE_DURATION_MIN
    }
    endMin = Math.max(endMin, startMin + MIN_LESSON_MINUTES)
    endMin = Math.min(endMin, CALENDAR_END_MINUTES)
    setPendingCreate({ col, startMin, endMin })
    armPendingClickGuard()
    e.preventDefault()
  }

  function handlePendingPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    col: number,
  ) {
    if ((e.target as HTMLElement).closest('[data-pending-resize]')) return
    e.stopPropagation()
    if (!pendingCreate || pendingCreate.col !== col) return

    pendingAdjustStartedRef.current = false
    const rect = e.currentTarget.getBoundingClientRect()
    setPendingAdjust({
      col,
      mode: 'move',
      grabOffsetY: e.clientY - rect.top,
      anchorStartMin: pendingCreate.startMin,
      anchorEndMin: pendingCreate.endMin,
    })
  }

  function beginPendingResize(
    e: React.PointerEvent<HTMLDivElement>,
    col: number,
    edge: 'start' | 'end',
  ) {
    e.stopPropagation()
    e.preventDefault()
    if (!pendingCreate || pendingCreate.col !== col) return

    pendingAdjustStartedRef.current = false
    setPendingAdjust({
      col,
      mode: edge === 'start' ? 'resize-start' : 'resize-end',
      grabOffsetY: 0,
      anchorStartMin: pendingCreate.startMin,
      anchorEndMin: pendingCreate.endMin,
    })
  }

  function handlePendingConfirm(e: React.SyntheticEvent<HTMLDivElement>) {
    e.stopPropagation()
    e.preventDefault()
    if (pendingSkipClickRef.current) return
    if (pendingAdjustStartedRef.current) {
      pendingAdjustStartedRef.current = false
      return
    }
    confirmPendingCreate()
  }

  function handleLessonPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    lesson: Lesson,
    col: number,
  ) {
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return
    e.stopPropagation()
    if (!e.altKey) {
      setPendingCreate(null)
      setPendingAdjust(null)
    }
    if (!onLessonMove && !activateLesson) return

    const eventRect = e.currentTarget.getBoundingClientRect()
    const grabOffsetY = e.clientY - eventRect.top
    const { top } = getEventStyle(lesson, hourHeight)
    const anchor: LessonEditAnchor = {
      top: eventRect.top,
      left: eventRect.left,
      right: eventRect.right,
      bottom: eventRect.bottom,
    }
    if (e.altKey) {
      e.preventDefault()
      altSelectClickRef.current = true
      activateLesson?.(lesson, anchor, { altKey: true })
      return
    }

    altSelectClickRef.current = false
    setLessonPress({
      lessons: [lesson],
      lesson,
      col,
      grabOffsetY,
      startX: e.clientX,
      startY: e.clientY,
      originTop: top,
      anchor,
    })
  }

  function beginResize(
    e: React.PointerEvent<HTMLDivElement>,
    lesson: Lesson,
    col: number,
    edge: 'start' | 'end',
  ) {
    e.stopPropagation()
    e.preventDefault()
    if (!onLessonMove) return

    const startMin = parseTimeToMinutes(lesson.start_time)
    let endMin = lesson.end_time
      ? parseTimeToMinutes(lesson.end_time)
      : startMin + 60
    if (endMin <= startMin) endMin = startMin + MIN_LESSON_MINUTES

    setResizeDrag({
      lessons: [lesson],
      lesson,
      col,
      edge,
      anchorStartMin: startMin,
      anchorEndMin: endMin,
    })
    setResizePreview({ startMin, endMin })
  }

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowTop = minutesToTop(nowMinutes, hourHeight)

  const movePreviewHeight = moveDrag
    ? Math.max(minutesToHeight(moveDrag.durationMin, hourHeight, minLessonHeight), minLessonHeight)
    : minLessonHeight

  const showMovePreview =
    moveDrag &&
    movePreview &&
    (() => {
      const orig = moveDrag.lesson
      const origCol = dates.findIndex((d) => toDateKey(d) === orig.lesson_date)
      const origStart = parseTimeToMinutes(orig.start_time)
      const previewStart = getMinutesFromY(movePreview.top)
      return movePreview.col !== origCol || previewStart !== origStart
    })()

  const createDragDistance =
    drag != null ? Math.abs(drag.currentY - drag.startY) : 0

  const createPreviewTimes =
    drag && createDragDistance >= CREATE_DRAG_THRESHOLD
      ? (() => {
          const startMin = getMinutesFromY(Math.min(drag.startY, drag.currentY))
          let endMin = getMinutesFromY(Math.max(drag.startY, drag.currentY))
          if (endMin <= startMin) endMin = startMin + DEFAULT_CREATE_DURATION_MIN
          endMin = Math.max(endMin, startMin + MIN_LESSON_MINUTES)
          return {
            start: minutesToTimeString(startMin),
            end: minutesToTimeString(endMin),
          }
        })()
      : null

  const pendingBlock =
    pendingCreate != null
      ? {
          top: minutesToTop(pendingCreate.startMin, hourHeight),
          height: minutesToHeight(
            pendingCreate.endMin - pendingCreate.startMin,
            hourHeight,
            minLessonHeight,
          ),
          start: minutesToTimeString(pendingCreate.startMin),
          end: minutesToTimeString(pendingCreate.endMin),
        }
      : null

  return (
    <div className={cn('relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card', className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/20 px-2 py-1 md:hidden">
        {!collapsed ? (
          <>
            <p className="text-[10px] text-muted-foreground">핀치 또는 버튼으로 확대·축소</p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={zoomOut}
                disabled={hourHeight <= MIN_HOUR_HEIGHT}
                aria-label="줌 아웃"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="min-w-[2.75rem] text-center text-[10px] font-medium tabular-nums text-muted-foreground">
                {zoomPercent}%
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={zoomIn}
                disabled={hourHeight >= MAX_HOUR_HEIGHT}
                aria-label="줌 인"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        ) : (
          <p className="w-full py-0.5 text-center text-[10px] text-muted-foreground">
            시간표 펼치기로 전체 보기
          </p>
        )}
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'relative w-full min-w-0',
          collapsed
            ? 'shrink-0 overflow-hidden'
            : 'min-h-0 flex-1 overflow-auto overscroll-y-auto touch-pan-x touch-pan-y [-webkit-overflow-scrolling:touch]',
        )}
      >
        <div
          className={cn(
            'flex w-full min-w-full flex-col',
            isMultiDay && 'max-md:w-max max-md:min-w-[max(100%,var(--calendar-grid-min))]',
          )}
          style={
            gridMinWidth != null
              ? ({ ['--calendar-grid-min' as string]: `${gridMinWidth}px` } as React.CSSProperties)
              : undefined
          }
        >
          <div
            ref={dayHeaderRef}
            className={cn(
              'sticky top-0 z-20 w-full shrink-0 border-b border-border bg-card max-md:bg-card md:bg-card/95 md:backdrop-blur-sm',
              weekRowClass,
            )}
            style={weekRowStyle}
          >
            <div className="sticky left-0 z-30 w-12 shrink-0 border-r border-border bg-card max-md:bg-card md:bg-card/95" />
            {dates.map((date) => {
              const isToday = isSameDay(date, now)
              const isSelected = selectedDate ? isSameDay(date, selectedDate) : false
              const dateColor = getDateColorClass(date)
              const holiday = isKoreanHoliday(date)
              const canSelect = Boolean(onSelectDate)

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => onSelectDate?.(date)}
                  className={cn(
                    dayColumnClass,
                    'border-r border-border text-center last:border-r-0 transition-colors',
                    isMultiDay ? 'px-0.5 py-1' : 'py-2',
                    canSelect && 'cursor-pointer hover:bg-muted/40',
                    isToday && !isSelected && 'bg-primary/5',
                    isSelected && 'bg-primary/10 ring-2 ring-inset ring-primary/40',
                  )}
                >
                  {isMultiDay ? (
                    <span
                      className={cn(
                        'inline-flex items-center justify-center gap-0.5 leading-none',
                        isSelected &&
                          'rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground',
                        isToday &&
                          !isSelected &&
                          'rounded-full px-1 py-0.5 ring-1 ring-primary/40',
                      )}
                    >
                      <span
                        className={cn(
                          'text-xs font-semibold tabular-nums',
                          !isToday && !isSelected && dateColor,
                        )}
                      >
                        {format(date, 'd')}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-medium',
                          !isSelected && (dateColor || 'text-muted-foreground'),
                        )}
                      >
                        {format(date, 'EEE', { locale: ko })}
                      </span>
                    </span>
                  ) : (
                    <>
                      <p
                        className={cn(
                          'text-sm font-semibold tabular-nums',
                          !isToday && !isSelected && dateColor,
                          isToday &&
                            !isSelected &&
                            'inline-flex items-center justify-center rounded-full px-2 py-0.5 ring-1 ring-primary/40',
                          isSelected &&
                            'inline-flex items-center justify-center rounded-full bg-primary px-2 py-0.5 text-primary-foreground',
                          isToday &&
                            isSelected &&
                            'inline-flex items-center justify-center rounded-full bg-primary px-2 py-0.5 text-primary-foreground',
                        )}
                      >
                        {format(date, 'd')}({format(date, 'EEE', { locale: ko })})
                      </p>
                      {holiday && !isSelected && (
                        <p className="mt-0.5 text-[9px] font-medium text-red-500">공휴일</p>
                      )}
                    </>
                  )}
                </button>
              )
            })}
          </div>

          {!collapsed ? (
          <div className={weekRowClass} style={weekRowStyle}>
          <div
            className="sticky left-0 z-10 w-12 shrink-0 border-r border-border bg-card relative"
            style={{ height: gridHeight }}
          >
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
                style={{ top: (hour - CALENDAR_START_HOUR) * hourHeight }}
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {dates.map((date, col) => {
            const dateKey = toDateKey(date)
            const dayLayouts = columnLayoutsByDateKey.get(dateKey) ?? []
            const isToday = isSameDay(date, now)
            const isDragging = drag?.col === col
            const isMoveTarget = showMovePreview && movePreview?.col === col
            const showCreatePreview =
              isDragging &&
              drag != null &&
              createDragDistance >= CREATE_DRAG_THRESHOLD

            return (
              <div
                key={date.toISOString()}
                ref={(el) => {
                  columnRefs.current[col] = el
                }}
                className={cn(
                  dayColumnClass,
                  'relative touch-pan-y border-r border-border last:border-r-0',
                  isToday && 'bg-primary/[0.02]',
                )}
                style={{ height: gridHeight, ...columnGridStyle }}
                onPointerDown={(e) => handlePointerDown(e, col)}
                onPointerMove={(e) => handlePointerMove(e, col)}
                onPointerUp={(e) => handlePointerUp(e, col)}
              >
                {isToday &&
                  nowMinutes >= CALENDAR_START_HOUR * 60 &&
                  nowMinutes <= CALENDAR_END_HOUR * 60 && (
                    <div
                      className="absolute inset-x-0 z-20 pointer-events-none flex items-center"
                      style={{ top: nowTop }}
                    >
                      <div className="h-2 w-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                      <div className="flex-1 h-px bg-red-500" />
                    </div>
                  )}

                {showCreatePreview && drag && createPreviewTimes && (
                  <div
                    className="absolute inset-x-1 z-10 rounded-md border-2 border-dashed border-primary bg-primary/10 pointer-events-none px-1.5 py-1"
                    style={{
                      top: Math.min(drag.startY, drag.currentY),
                      height: Math.max(
                        Math.abs(drag.currentY - drag.startY),
                        24,
                      ),
                    }}
                  >
                    <p className="text-[10px] font-semibold text-white truncate tabular-nums drop-shadow-sm">
                      {createPreviewTimes.start} – {createPreviewTimes.end}
                    </p>
                  </div>
                )}

                {pendingCreate?.col === col && pendingBlock && (
                  <div
                    data-pending-create
                    className={cn(
                      'absolute inset-x-1 z-[12] flex min-w-0 touch-none flex-col overflow-hidden rounded-md border-2 border-primary bg-primary/15 shadow-sm',
                      pendingAdjust ? 'cursor-grabbing' : 'cursor-grab',
                    )}
                    style={{ top: pendingBlock.top, height: pendingBlock.height }}
                    title="드래그로 이동·위·아래로 시간 조절 · 한 번 더 탭하면 수업 등록"
                    onPointerDown={(e) => handlePendingPointerDown(e, col)}
                  >
                    <div
                      data-pending-resize
                      className="relative z-10 h-2 shrink-0 cursor-ns-resize touch-none"
                      onPointerDown={(e) => beginPendingResize(e, col, 'start')}
                    />
                    <button
                      type="button"
                      className="flex min-h-0 flex-1 w-full flex-col items-center justify-center px-1.5 py-0.5 touch-manipulation"
                      onClick={handlePendingConfirm}
                    >
                      <p className="text-[10px] font-semibold text-white tabular-nums drop-shadow-sm">
                        {pendingBlock.start} – {pendingBlock.end}
                      </p>
                      <p className="text-[9px] text-white/90 drop-shadow-sm">탭하여 등록</p>
                    </button>
                    <div
                      data-pending-resize
                      className="relative z-10 h-2 shrink-0 cursor-ns-resize touch-none"
                      onPointerDown={(e) => beginPendingResize(e, col, 'end')}
                    />
                  </div>
                )}

                {isMoveTarget && movePreview && (
                  <div
                    className="absolute inset-x-1 z-30 rounded-md border-2 border-dashed border-primary bg-primary/10 pointer-events-none"
                    style={{ top: movePreview.top, height: movePreviewHeight }}
                  />
                )}

                {dayLayouts.map(
                  ({ lesson, column, columnCount, startMin, endMin }) => {
                    const isMoving = isLessonMoving(lesson)
                    const isResizing = isLessonResizing(lesson)
                    const lessonStartMin =
                      isResizing && resizePreview ? resizePreview.startMin : startMin
                    const lessonEndMin =
                      isResizing && resizePreview ? resizePreview.endMin : endMin
                    const blockTop = minutesToTop(lessonStartMin, hourHeight)
                    const blockHeight = minutesToHeight(
                      lessonEndMin - lessonStartMin,
                      hourHeight,
                      minLessonHeight,
                    )
                    const lessonStart = minutesToTimeString(lessonStartMin)
                    const lessonEnd = minutesToTimeString(lessonEndMin)
                    const horizontal = getLessonBlockHorizontalStyle(
                      column,
                      columnCount,
                      SLOT_INSET_PX,
                      SLOT_GAP_PX,
                    )
                    const memberLabel = getLessonCalendarLabel(lesson)
                    const recurrenceLabel = getRecurrenceDisplayLabel(lesson.recurrence_pattern)
                    const timeLabel = `${lessonStart}${lessonEnd ? ` – ${lessonEnd}` : ''}`
                    const blockStyle = getLessonCalendarBlockStyle(lesson, instructors)
                    const isHighlighted = highlightedSet.has(lesson.id)
                    const isMultiSelected = selectedLessonIds
                      ? selectedLessonIds.has(lesson.id)
                      : Boolean(isLessonSelected?.(lesson.id))
                    const highlightColor = resolveLessonDisplayColor(lesson, instructors)
                    const isLongPressReady = longPressLessonId === lesson.id
                    return (
                      <div
                        key={lesson.id}
                        data-lesson-event
                        data-lesson-id={lesson.id}
                        className={cn(
                          'absolute z-[5] flex min-w-0 flex-col overflow-hidden rounded-md border',
                          lesson.attendance_status === 'cancelled' && 'line-through opacity-80',
                          isResizing && 'z-40 ring-2 ring-primary/70',
                          isMoving && 'z-40 touch-none opacity-60 ring-2 ring-primary/60',
                          isLongPressReady &&
                            'z-20 touch-none ring-2 ring-primary ring-offset-1 ring-offset-background',
                          !isMoving && !isLongPressReady && 'touch-pan-y',
                          isHighlighted && 'z-30',
                          isMultiSelected &&
                            'z-[25] ring-2 ring-white ring-offset-1 ring-offset-transparent',
                          onLessonMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                        )}
                        style={{
                          ...blockStyle,
                          top: blockTop,
                          height: blockHeight,
                          left: horizontal.left,
                          width: horizontal.width,
                          ...(isHighlighted
                            ? {
                                borderColor: '#ffffff',
                                borderWidth: 3,
                                boxShadow: `0 0 0 3px ${highlightColor}, 0 0 0 5px rgba(255,255,255,0.9), 0 0 20px ${hexToRgba(highlightColor, 0.7)}`,
                              }
                            : isMultiSelected
                              ? {
                                  boxShadow: `0 0 0 2px #fff, 0 0 12px ${hexToRgba(highlightColor, 0.85)}`,
                                }
                              : {}),
                        }}
                        title={`${memberLabel} · ${timeLabel} · ${lesson.lesson_type}${onLessonMove ? ' · 길게 누른 뒤 드래그로 이동 · 위·아래 드래그로 시간 조절' : ''}${activateLesson ? ' · 짧게 탭 수정 · Alt+클릭 선택' : ''}`}
                        onPointerDown={(e) => handleLessonPointerDown(e, lesson, col)}
                        onClick={(e) => {
                          if (!e.altKey) return
                          e.preventDefault()
                          e.stopPropagation()
                        }}
                      >
                        {recurrenceLabel ? (
                          <span className="pointer-events-none absolute left-0.5 top-0 z-20 rounded bg-black/60 px-1 py-px text-[8px] font-bold leading-none text-primary">
                            {recurrenceLabel}
                          </span>
                        ) : null}
                        {onLessonMove && (
                          <div
                            data-resize-handle
                            className="relative z-10 h-1.5 shrink-0 cursor-ns-resize touch-none"
                            onPointerDown={(e) => beginResize(e, lesson, col, 'start')}
                          />
                        )}
                        <div
                          className={cn(
                            'relative flex min-h-0 flex-1 items-center justify-center',
                            recurrenceLabel && 'pt-2.5',
                          )}
                        >
                          <MemoLessonBlockContent
                            lesson={lesson}
                            start={lessonStart}
                            end={lessonEnd}
                            columnCount={columnCount}
                            blockHeight={blockHeight}
                            hourHeight={hourHeight}
                            hasResizeHandles={Boolean(onLessonMove)}
                            instructors={instructors}
                          />
                        </div>
                        {onLessonMove && (
                          <div
                            data-resize-handle
                            className="relative z-10 h-1.5 shrink-0 cursor-ns-resize touch-none"
                            onPointerDown={(e) => beginResize(e, lesson, col, 'end')}
                          />
                        )}
                      </div>
                    )
                  },
                )}
              </div>
            )
          })}
          </div>
          ) : null}
        </div>
      </div>
      {rangeLoading && !hasRangeCache ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-card/85 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          일정 불러오는 중…
        </div>
      ) : null}
      {rangeLoading && hasRangeCache ? (
        <div className="pointer-events-none absolute right-3 top-12 z-20 flex items-center gap-1 rounded-full bg-card/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          갱신 중
        </div>
      ) : null}
    </div>
  )
}
