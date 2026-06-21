import 'server-only'

import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { mergeCalendarLessonsForRange, normalizeCalendarLessonsForDisplay } from '@/lib/calendar-recurrence/expand-lessons'
import type { RecurrenceCapableLesson } from '@/lib/calendar-recurrence/types'
import {
  LESSON_CALENDAR_SELECT,
  LESSON_CALENDAR_SELECT_LEGACY,
} from '@/lib/supabase-selects'
import type { Lesson } from '@/lib/types'
import { enrichLessonRecurrenceFields } from '@/lib/lesson-recurrence-legacy'
import { resolveLessonTitle, isLessonCalendarVisible, isLessonStatusPageVisible } from '@/lib/calendar-utils'
import { isLessonIdentifiable } from '@/lib/calendar-recurrence/expand-lessons'
import { createServiceRoleClient } from '@/lib/supabase/admin'

function isMissingRecurrenceV2Column(error: { message?: string; code?: string } | null) {
  if (!error) return false
  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    message.includes('event_type') ||
    message.includes('recurrence') ||
    message.includes('recurring_master_id')
  )
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

export async function fetchExpandedCalendarLessons(
  dateFrom: string,
  dateTo: string,
  limit = 300,
  options?: { forStatusPage?: boolean },
): Promise<{ lessons: Lesson[]; supportsExpansion: boolean }> {
  await purgeUnnamedRecurringMasters()
  if (!options?.forStatusPage) {
    await purgeCancelledRecurrenceExceptions()
  }

  const supabase = await createStaffDataClient()

  let select = LESSON_CALENDAR_SELECT

  let storedQuery = supabase
    .from('lessons')
    .select(select)
    .gte('lesson_date', dateFrom)
    .lte('lesson_date', dateTo)
    .or('event_type.neq.recurring_master,event_type.is.null')
    .order('lesson_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })
    .limit(limit)

  let { data: stored, error: storedError } = await storedQuery

  if (storedError && isMissingRecurrenceV2Column(storedError)) {
    select = LESSON_CALENDAR_SELECT_LEGACY
    const retry = await supabase
      .from('lessons')
      .select(select)
      .gte('lesson_date', dateFrom)
      .lte('lesson_date', dateTo)
      .order('lesson_date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: false })
      .limit(limit)
    stored = retry.data
    storedError = retry.error
    if (!storedError) {
      const isVisible = options?.forStatusPage
        ? isLessonStatusPageVisible
        : isLessonCalendarVisible
      return {
        lessons: normalizeCalendarLessonsForDisplay(
          ((stored ?? []) as Lesson[])
            .filter((row) => isLessonIdentifiable(row) && isVisible(row))
            .map(normalizeCalendarLesson),
          options,
        ),
        supportsExpansion: false,
      }
    }
  }

  if (storedError) {
    console.error('fetchExpandedCalendarLessons stored:', storedError.message)
    return { lessons: [], supportsExpansion: false }
  }

  const mastersResult = await supabase
    .from('lessons')
    .select(select)
    .eq('event_type', 'recurring_master')
    .lte('lesson_date', dateTo)
    .limit(200)

  if (mastersResult.error && isMissingRecurrenceV2Column(mastersResult.error)) {
    return {
      lessons: ((stored ?? []) as Lesson[]).map(normalizeCalendarLesson),
      supportsExpansion: false,
    }
  }

  const exceptionsResult = await supabase
    .from('lessons')
    .select(select)
    .eq('event_type', 'exception')
    .gte('lesson_date', dateFrom)
    .lte('lesson_date', dateTo)
    .limit(200)

  const merged = mergeCalendarLessonsForRange(
    (stored ?? []) as RecurrenceCapableLesson[],
    (mastersResult.data ?? []) as RecurrenceCapableLesson[],
    (exceptionsResult.data ?? []) as RecurrenceCapableLesson[],
    dateFrom,
    dateTo,
    options,
  ).map(normalizeCalendarLesson)

  return {
    lessons: merged.slice(0, limit),
    supportsExpansion: true,
  }
}
