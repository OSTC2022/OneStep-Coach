import 'server-only'

import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { mergeCalendarLessonsForRange, normalizeCalendarLessonsForDisplay } from '@/lib/calendar-recurrence/expand-lessons'
import type { RecurrenceCapableLesson } from '@/lib/calendar-recurrence/types'
import {
  LESSON_CALENDAR_SELECT,
  LESSON_CALENDAR_SELECT_LEGACY,
  LESSON_CALENDAR_SELECT_NO_DRINK,
} from '@/lib/supabase-selects'
import type { Lesson } from '@/lib/types'
import { enrichLessonRecurrenceFields } from '@/lib/lesson-recurrence-legacy'
import { resolveLessonTitle, isLessonCalendarVisible, isLessonStatusPageVisible } from '@/lib/calendar-utils'
import { isLessonIdentifiable } from '@/lib/calendar-recurrence/expand-lessons'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { logLessonViewFetch } from '@/lib/lesson-data-sync'

function isMissingRecurrenceV2Column(error: { message?: string; code?: string } | null) {
  if (!error) return false
  const message = error.message?.toLowerCase() ?? ''
  if (message.includes('drink_preference')) return false
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    message.includes('event_type') ||
    message.includes('recurrence') ||
    message.includes('recurring_master_id')
  )
}

function isMissingDrinkPreferenceColumn(error: { message?: string; code?: string } | null) {
  if (!error) return false
  return (error.message?.toLowerCase() ?? '').includes('drink_preference')
}

function normalizeCalendarLesson(lesson: Lesson): Lesson {
  const enriched = enrichLessonRecurrenceFields(lesson)
  const title = resolveLessonTitle(enriched)
  if (title && !enriched.title) {
    return { ...enriched, title }
  }
  return enriched
}

async function purgeUnnamedRecurringMasters() {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('lessons')
    .select('id, member_id, title, content, event_type')
    .eq('event_type', 'recurring_master')

  if (error || !data?.length) return

  const deleteIds = data
    .filter((row) => !row.member_id && !resolveLessonTitle(row))
    .map((row) => row.id)

  if (!deleteIds.length) return

  const chunkSize = 100
  for (let i = 0; i < deleteIds.length; i += chunkSize) {
    const chunk = deleteIds.slice(i, i + chunkSize)
    const { error: deleteError } = await supabase.from('lessons').delete().in('id', chunk)
    if (deleteError) {
      console.error('purgeUnnamedRecurringMasters:', deleteError.message)
      return
    }
  }
}

async function purgeCancelledRecurrenceExceptions() {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('lessons')
    .select('id, google_recurring_event_id')
    .eq('event_type', 'exception')
    .or('event_status.eq.cancelled,attendance_status.eq.cancelled')

  if (error || !data?.length) return

  const deleteIds = data
    .filter((row) => !row.google_recurring_event_id)
    .map((row) => row.id)
  const chunkSize = 100
  for (let i = 0; i < deleteIds.length; i += chunkSize) {
    const chunk = deleteIds.slice(i, i + chunkSize)
    const { error: deleteError } = await supabase.from('lessons').delete().in('id', chunk)
    if (deleteError) {
      console.error('purgeCancelledRecurrenceExceptions:', deleteError.message)
      return
    }
  }
}

const MAINTENANCE_COOLDOWN_MS = 30 * 60 * 1000
let lastMaintenanceAt = 0
let maintenanceInFlight = false

/** 읽기 요청을 막지 않도록 백그라운드에서만 주기적 정리 (수업현황 조회는 생략) */
function scheduleCalendarLessonMaintenance(options?: { forStatusPage?: boolean }) {
  if (options?.forStatusPage) return

  const now = Date.now()
  if (maintenanceInFlight || now - lastMaintenanceAt < MAINTENANCE_COOLDOWN_MS) return

  maintenanceInFlight = true
  lastMaintenanceAt = now
  void (async () => {
    try {
      await purgeUnnamedRecurringMasters()
      await purgeCancelledRecurrenceExceptions()
    } finally {
      maintenanceInFlight = false
    }
  })()
}

export async function fetchExpandedCalendarLessons(
  dateFrom: string,
  dateTo: string,
  limit = 800,
  options?: { forStatusPage?: boolean },
): Promise<{ lessons: Lesson[]; supportsExpansion: boolean }> {
  scheduleCalendarLessonMaintenance(options)

  const supabase = await createStaffDataClient()

  let select = LESSON_CALENDAR_SELECT

  const buildStoredQuery = (selectClause: string) =>
    supabase
      .from('lessons')
      .select(selectClause)
      .gte('lesson_date', dateFrom)
      .lte('lesson_date', dateTo)
      .or('event_type.neq.recurring_master,event_type.is.null')
      .order('lesson_date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: false })
      .limit(limit)

  const buildMastersQuery = (selectClause: string) =>
    supabase
      .from('lessons')
      .select(selectClause)
      .eq('event_type', 'recurring_master')
      .lte('lesson_date', dateTo)
      .limit(200)

  const buildExceptionsQuery = (selectClause: string) =>
    supabase
      .from('lessons')
      .select(selectClause)
      .eq('event_type', 'exception')
      .gte('lesson_date', dateFrom)
      .lte('lesson_date', dateTo)
      .limit(200)

  // 순차 3회 → 병렬 1라운드로 응답 시간 단축
  let [storedResult, mastersResult, exceptionsResult] = await Promise.all([
    buildStoredQuery(select),
    buildMastersQuery(select),
    buildExceptionsQuery(select),
  ])

  if (storedResult.error && isMissingDrinkPreferenceColumn(storedResult.error)) {
    select = LESSON_CALENDAR_SELECT_NO_DRINK
    ;[storedResult, mastersResult, exceptionsResult] = await Promise.all([
      buildStoredQuery(select),
      buildMastersQuery(select),
      buildExceptionsQuery(select),
    ])
  }

  if (storedResult.error && isMissingRecurrenceV2Column(storedResult.error)) {
    select = LESSON_CALENDAR_SELECT_LEGACY
    storedResult = await buildStoredQuery(select)
    if (!storedResult.error) {
      const isVisible = options?.forStatusPage
        ? isLessonStatusPageVisible
        : isLessonCalendarVisible
      return {
        lessons: normalizeCalendarLessonsForDisplay(
          ((storedResult.data ?? []) as Lesson[])
            .filter((row) => isLessonIdentifiable(row) && isVisible(row))
            .map(normalizeCalendarLesson),
          options,
        ),
        supportsExpansion: false,
      }
    }
  }

  if (storedResult.error) {
    console.error('fetchExpandedCalendarLessons stored:', storedResult.error.message)
    return { lessons: [], supportsExpansion: false }
  }

  if (mastersResult.error && isMissingRecurrenceV2Column(mastersResult.error)) {
    return {
      lessons: ((storedResult.data ?? []) as Lesson[]).map(normalizeCalendarLesson),
      supportsExpansion: false,
    }
  }

  if (mastersResult.error) {
    console.error('fetchExpandedCalendarLessons masters:', mastersResult.error.message)
  }
  if (exceptionsResult.error) {
    console.error(
      'fetchExpandedCalendarLessons exceptions:',
      exceptionsResult.error.message,
    )
  }

  const merged = mergeCalendarLessonsForRange(
    (storedResult.data ?? []) as RecurrenceCapableLesson[],
    (mastersResult.error ? [] : (mastersResult.data ?? [])) as RecurrenceCapableLesson[],
    (exceptionsResult.error
      ? []
      : (exceptionsResult.data ?? [])) as RecurrenceCapableLesson[],
    dateFrom,
    dateTo,
    options,
  ).map(normalizeCalendarLesson)

  const resultLessons = merged.slice(0, limit)
  logLessonViewFetch(options?.forStatusPage ? 'lesson-status' : 'calendar', {
    dateFrom,
    dateTo,
    count: resultLessons.length,
    sample: resultLessons.slice(0, 8).map((lesson) => ({
      id: lesson.id,
      instructor_id: lesson.instructor_id,
      google_event_id: lesson.google_event_id,
    })),
  })

  return {
    lessons: resultLessons,
    supportsExpansion: !mastersResult.error,
  }
}
