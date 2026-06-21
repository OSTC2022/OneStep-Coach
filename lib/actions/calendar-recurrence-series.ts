import 'server-only'

import { addDays, format, parseISO } from 'date-fns'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import {
  addExdateToRecurrence,
  truncateRecurrenceUntil,
} from '@/lib/calendar-recurrence/expand-lessons'
import {
  buildVirtualLessonId,
  parseVirtualLessonId,
  patternToRRuleLines,
  type RecurrenceCapableLesson,
} from '@/lib/calendar-recurrence/types'
import { parseLessonRecurrencePattern } from '@/lib/lesson-recurrence'
import { parseGoogleOriginalStartIso } from '@/lib/calendar-recurrence/google-sync-mapper'
import type { LessonSeriesScope } from '@/lib/actions/lessons'
import { requireRole } from '@/lib/actions/auth'
import {
  scheduleGoogleLessonDeletes,
  scheduleGoogleLessonPush,
  touchAppModifiedAt,
} from '@/lib/google-calendar/push-scheduler'

const MASTER_SELECT =
  'id, lesson_date, start_time, end_time, member_id, title, instructor_id, lesson_type, recurrence, recurrence_pattern, recurrence_group_id, event_type, event_status, google_event_id, google_calendar_id, google_account_id, session_deducted'

async function bulkDeleteByIds(
  supabase: ReturnType<typeof createServiceRoleClient>,
  ids: string[],
) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return

  const chunkSize = 100
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const { error } = await supabase.from('lessons').delete().in('id', chunk)
    if (error) throw new Error(error.message)
  }
}

async function deleteStoredOccurrenceRows(
  supabase: ReturnType<typeof createServiceRoleClient>,
  master: RecurrenceCapableLesson,
  occurrenceDate: string,
): Promise<string[]> {
  const deleteIds = new Set<string>()

  const { data: exceptionRows } = await supabase
    .from('lessons')
    .select('id')
    .eq('recurring_master_id', master.id)
    .eq('lesson_date', occurrenceDate)

  for (const row of exceptionRows ?? []) {
    deleteIds.add(row.id)
  }

  if (master.recurrence_group_id) {
    const { data: groupRows } = await supabase
      .from('lessons')
      .select('id, event_type')
      .eq('recurrence_group_id', master.recurrence_group_id)
      .eq('lesson_date', occurrenceDate)
      .neq('event_type', 'recurring_master')

    for (const row of groupRows ?? []) {
      deleteIds.add(row.id)
    }
  }

  if (master.member_id) {
    const startKey = (master.start_time ?? '').slice(0, 5)
    const { data: slotRows } = await supabase
      .from('lessons')
      .select('id, start_time, event_type')
      .eq('member_id', master.member_id)
      .eq('lesson_date', occurrenceDate)

    for (const row of slotRows ?? []) {
      if (row.event_type === 'recurring_master') continue
      if ((row.start_time ?? '').slice(0, 5) !== startKey) continue
      deleteIds.add(row.id)
    }
  }

  deleteIds.delete(master.id)

  const ids = [...deleteIds]
  if (ids.length) await bulkDeleteByIds(supabase, ids)
  return ids
}

function revalidateCalendarPaths() {
  revalidatePath('/dashboard/lessons')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/lesson-status')
}

function dayBefore(dateKey: string) {
  return format(addDays(parseISO(dateKey), -1), 'yyyy-MM-dd')
}

export async function deleteRecurringMasterSeries(
  masterId: string,
  scope: LessonSeriesScope,
  occurrenceDate: string,
): Promise<{ deletedIds?: string[]; error?: string }> {
  await requireRole(['admin', 'instructor'])
  const supabase = createServiceRoleClient()

  const { data: master, error } = await supabase
    .from('lessons')
    .select(MASTER_SELECT)
    .eq('id', masterId)
    .maybeSingle()

  if (error || !master) {
    return { error: '반복 일정을 찾을 수 없습니다.' }
  }

  const row = master as RecurrenceCapableLesson
  const deletedIds: string[] = []

  if (scope === 'all') {
    const { data: exceptions } = await supabase
      .from('lessons')
      .select('id')
      .eq('recurring_master_id', masterId)

    const ids = [masterId, ...(exceptions ?? []).map((item) => item.id)]
    const { error: deleteError } = await supabase.from('lessons').delete().in('id', ids)
    if (deleteError) return { error: deleteError.message }
    scheduleGoogleLessonDeletes([
      {
        id: row.id,
        google_event_id: (row as { google_event_id?: string | null }).google_event_id ?? null,
        google_calendar_id:
          (row as { google_calendar_id?: string | null }).google_calendar_id ?? null,
        google_account_id:
          (row as { google_account_id?: string | null }).google_account_id ?? null,
        event_type: row.event_type,
        session_deducted: (row as { session_deducted?: boolean }).session_deducted,
      },
    ])
    revalidateCalendarPaths()
    return { deletedIds: ids }
  }

  if (scope === 'single') {
    const storedDeleteIds = await deleteStoredOccurrenceRows(supabase, row, occurrenceDate)
    deletedIds.push(...storedDeleteIds)

    await supabase
      .from('lessons')
      .update({
        recurrence: addExdateToRecurrence(row.recurrence, occurrenceDate, row.start_time),
        app_modified_at: touchAppModifiedAt(),
      })
      .eq('id', masterId)

    scheduleGoogleLessonPush(masterId)

    revalidateCalendarPaths()
    return {
      deletedIds: [buildVirtualLessonId(masterId, occurrenceDate), ...deletedIds],
    }
  }

  // future — remove this occurrence and all following
  const untilDate = dayBefore(occurrenceDate)

  let recurrenceLines = [...(row.recurrence ?? [])]
  if (!recurrenceLines.some((line) => line.startsWith('RRULE:'))) {
    const pattern = row.recurrence_pattern
    if (pattern && pattern !== 'none') {
      recurrenceLines = patternToRRuleLines(
        parseLessonRecurrencePattern(pattern),
        row.lesson_date,
      )
    }
  }

  const nextRecurrence = truncateRecurrenceUntil(recurrenceLines, untilDate)
  const { error: truncateError } = await supabase
    .from('lessons')
    .update({
      recurrence: nextRecurrence,
      app_modified_at: touchAppModifiedAt(),
    })
    .eq('id', masterId)

  if (truncateError) return { error: truncateError.message }

  scheduleGoogleLessonPush(masterId)

  deletedIds.push(buildVirtualLessonId(masterId, occurrenceDate))

  const { data: futureExceptions } = await supabase
    .from('lessons')
    .select('id')
    .eq('recurring_master_id', masterId)
    .gte('lesson_date', occurrenceDate)

  if (futureExceptions?.length) {
    const ids = futureExceptions.map((item) => item.id)
    await bulkDeleteByIds(supabase, ids)
    deletedIds.push(...ids)
  }

  if (row.recurrence_group_id) {
    const { data: groupRows } = await supabase
      .from('lessons')
      .select('id')
      .eq('recurrence_group_id', row.recurrence_group_id)
      .gte('lesson_date', occurrenceDate)
      .neq('event_type', 'recurring_master')

    const groupIds = (groupRows ?? [])
      .map((item) => item.id)
      .filter((id) => id !== masterId)
    if (groupIds.length) {
      await bulkDeleteByIds(supabase, groupIds)
      deletedIds.push(...groupIds)
    }
  }

  if (row.member_id) {
    const startKey = (row.start_time ?? '').slice(0, 5)
    const { data: slotRows } = await supabase
      .from('lessons')
      .select('id, start_time, event_type')
      .eq('member_id', row.member_id)
      .gte('lesson_date', occurrenceDate)

    const slotDeleteIds: string[] = []
    for (const slotRow of slotRows ?? []) {
      if (slotRow.id === masterId) continue
      if (slotRow.event_type === 'recurring_master') continue
      if ((slotRow.start_time ?? '').slice(0, 5) !== startKey) continue
      slotDeleteIds.push(slotRow.id)
    }
    if (slotDeleteIds.length) {
      await bulkDeleteByIds(supabase, slotDeleteIds)
      deletedIds.push(...slotDeleteIds)
    }
  }

  revalidateCalendarPaths()
  return { deletedIds: [...new Set(deletedIds)] }
}

export async function resolveRecurringDeleteTarget(
  lessonId: string,
  anchorDate: string,
): Promise<{
  masterId: string
  occurrenceDate: string
  isVirtual: boolean
} | null> {
  const virtual = parseVirtualLessonId(lessonId)
  if (virtual) {
    return {
      masterId: virtual.masterId,
      occurrenceDate: virtual.occurrenceDate,
      isVirtual: true,
    }
  }

  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('lessons')
    .select('id, event_type, lesson_date, recurring_master_id, recurrence_group_id')
    .eq('id', lessonId)
    .maybeSingle()

  if (!data) return null
  if (data.event_type === 'recurring_master') {
    return {
      masterId: data.id,
      occurrenceDate: anchorDate || data.lesson_date,
      isVirtual: false,
    }
  }
  if (data.event_type === 'exception' && data.recurring_master_id) {
    const { data: master } = await supabase
      .from('lessons')
      .select('id')
      .eq('id', data.recurring_master_id)
      .eq('event_type', 'recurring_master')
      .maybeSingle()

    if (master) {
      return {
        masterId: data.recurring_master_id,
        occurrenceDate: anchorDate || data.lesson_date,
        isVirtual: false,
      }
    }
  }

  if (data.recurrence_group_id) {
    const { data: master } = await supabase
      .from('lessons')
      .select('id, lesson_date')
      .eq('recurrence_group_id', data.recurrence_group_id)
      .eq('event_type', 'recurring_master')
      .maybeSingle()

    if (master && master.id !== data.id) {
      return {
        masterId: master.id,
        occurrenceDate: anchorDate || data.lesson_date,
        isVirtual: false,
      }
    }
  }

  return null
}

export { parseGoogleOriginalStartIso }
