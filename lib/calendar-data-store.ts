import { getLessonsForMonth, getLessonsForRange } from '@/lib/actions/lessons'
import {
  getRangeForView,
  navigateDate,
  type CalendarView,
} from '@/lib/calendar-utils'
import {
  logCalendarFetch,
  withCalendarFetchTimeout,
} from '@/lib/calendar-client-fetch'
import type { Lesson } from '@/lib/types'

export type CalendarCoachId = string

export type CalendarFetchMode = 'initial' | 'background' | 'refresh' | 'prefetch'

export function buildCalendarCacheKey(
  view: CalendarView,
  rangeStart: string,
  rangeEnd: string,
  coachId: CalendarCoachId,
) {
  return `calendar:${view}:${rangeStart}:${rangeEnd}:${coachId}`
}

export function resolveRangeKey(
  date: Date,
  view: CalendarView,
  coachId: CalendarCoachId = 'all',
) {
  const { dateFrom, dateTo } = getRangeForView(date, view)
  return {
    dateFrom,
    dateTo,
    cacheKey: buildCalendarCacheKey(view, dateFrom, dateTo, coachId),
  }
}

const memoryCache = new Map<string, Lesson[]>()
const inFlightRequests = new Map<string, Promise<Lesson[]>>()
const abortByKey = new Map<string, AbortController>()
let activeFetchKey: string | null = null
let fetchGeneration = 0

function fetchLessonsForView(date: Date, view: CalendarView): Promise<Lesson[]> {
  if (view === 'month') {
    return getLessonsForMonth(date.getFullYear(), date.getMonth() + 1)
  }
  const { dateFrom, dateTo } = getRangeForView(date, view)
  return getLessonsForRange(dateFrom, dateTo)
}

export function getCachedLessons(key: string): Lesson[] | undefined {
  return memoryCache.get(key)
}

export function setCachedLessons(key: string, lessons: Lesson[]) {
  memoryCache.set(key, lessons)
}

export function seedCalendarCache(
  date: Date,
  view: CalendarView,
  lessons: Lesson[],
  coachId: CalendarCoachId = 'all',
) {
  const { cacheKey } = resolveRangeKey(date, view, coachId)
  memoryCache.set(cacheKey, lessons)
}

function cancelActiveExcept(keepKey: string) {
  for (const [key, controller] of abortByKey.entries()) {
    if (key !== keepKey) {
      controller.abort()
      abortByKey.delete(key)
      inFlightRequests.delete(key)
    }
  }
}

export type CalendarFetchOptions = {
  date: Date
  view: CalendarView
  coachId?: CalendarCoachId
  mode?: CalendarFetchMode
  force?: boolean
}

export function invalidateCalendarCacheKey(cacheKey: string) {
  memoryCache.delete(cacheKey)
  abortByKey.get(cacheKey)?.abort()
  abortByKey.delete(cacheKey)
  inFlightRequests.delete(cacheKey)
  if (activeFetchKey === cacheKey) activeFetchKey = null
}

/** @deprecated Prefer invalidateCalendarCacheKey — full clear causes empty calendar on fetch failure */
export function invalidateAllCalendarCache() {
  memoryCache.clear()
  for (const controller of abortByKey.values()) {
    controller.abort()
  }
  abortByKey.clear()
  inFlightRequests.clear()
  activeFetchKey = null
}

export async function fetchCalendarLessons(
  options: CalendarFetchOptions,
): Promise<Lesson[]> {
  const coachId = options.coachId ?? 'all'
  const { dateFrom, dateTo, cacheKey } = resolveRangeKey(
    options.date,
    options.view,
    coachId,
  )
  const mode = options.mode ?? 'initial'

  if (options.force) {
    memoryCache.delete(cacheKey)
    const inflight = inFlightRequests.get(cacheKey)
    if (inflight) {
      abortByKey.get(cacheKey)?.abort()
      inFlightRequests.delete(cacheKey)
      abortByKey.delete(cacheKey)
    }
  }

  if (!options.force && memoryCache.has(cacheKey) && mode === 'prefetch') {
    return memoryCache.get(cacheKey)!
  }

  if (!options.force) {
    const inflight = inFlightRequests.get(cacheKey)
    if (inflight) return inflight
  }

  if (mode !== 'prefetch') {
    cancelActiveExcept(cacheKey)
    activeFetchKey = cacheKey
  }

  const generation = ++fetchGeneration
  const abortController = new AbortController()
  abortByKey.set(cacheKey, abortController)

  logCalendarFetch('start', {
    rangeStart: dateFrom,
    rangeEnd: dateTo,
    coachId,
    view: options.view,
    mode,
  })

  const promise = withCalendarFetchTimeout(
    fetchLessonsForView(options.date, options.view),
  )
    .then((data) => {
      if (abortController.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      memoryCache.set(cacheKey, data)
      logCalendarFetch('success', data.length)
      return data
    })
    .catch((error) => {
      if (error?.name === 'AbortError') throw error
      logCalendarFetch('error', error)
      throw error
    })
    .finally(() => {
      inFlightRequests.delete(cacheKey)
      abortByKey.delete(cacheKey)
      if (activeFetchKey === cacheKey) activeFetchKey = null
      if (generation === fetchGeneration && mode !== 'prefetch') {
        logCalendarFetch('end')
      }
    })

  inFlightRequests.set(cacheKey, promise)
  return promise
}

export function prefetchAdjacentCalendarRanges(
  date: Date,
  view: CalendarView,
  coachId: CalendarCoachId = 'all',
) {
  if (view === 'day') return

  const prev = navigateDate(date, view, -1)
  const next = navigateDate(date, view, 1)

  for (const target of [prev, next]) {
    const { cacheKey } = resolveRangeKey(target, view, coachId)
    if (memoryCache.has(cacheKey) || inFlightRequests.has(cacheKey)) continue
    void fetchCalendarLessons({
      date: target,
      view,
      coachId,
      mode: 'prefetch',
    }).catch(() => {})
  }
}

export function filterLessonsByCoach(
  lessons: Lesson[],
  coachId: CalendarCoachId,
): Lesson[] {
  if (coachId === 'all') return lessons
  return lessons.filter((lesson) => lesson.instructor_id === coachId)
}
