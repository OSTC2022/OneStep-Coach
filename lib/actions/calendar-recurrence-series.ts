import 'server-only'

import { addDays, format, parseISO } from 'date-fns'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  addExdateToRecurrence,
  truncateRecurrenceUntil,
} from '@/lib/calendar-recurrence/expand-lessons'
import {
  buildVirtualLessonId,
  parseVirtualLessonId,
  type RecurrenceCapableLesson,
} from '@/lib/calendar-recurrence/types'
import { parseGoogleOriginalStartIso } from '@/lib/calendar-recurrence/google-sync-mapper'
import type { LessonSeriesScope } from '@/lib/actions/lessons'
import { requireRole } from '@/lib/actions/auth'

const MASTER_SELECT =
  'id, lesson_date, start_time, end_time, member_id, title, instructor_id, lesson_type, recurrence, recurrence_pattern, recurrence_group_id, event_type, event_status'

async function bulkDeleteByIds(
  supabase: ReturnType<typeof createAdminClient>,
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
  supabase: ReturnType<typeof createAdminClient>,
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
  const supabase = createAdminClient()

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
      })
      .eq('id', masterId)

    revalidateCalendarPaths()
    return {
      deletedIds: [buildVirtualLessonId(masterId, occurrenceDate), ...deletedIds],
    }
  }

  // future — remove this occurrence and all following
  const untilDate = dayBefore(occurrenceDate)
  await supabase
    .from('lessons')
    .update({
      recurrence: truncateRecurrenceUntil(row.recurrence, untilDate),
    })
    .eq('id', masterId)

  const { data: futureExceptions } = await supabase
    .from('lessons')
    .select('id')
    .eq('recurring_master_id', masterId)
    .gte('lesson_date', occurrenceDate)

  if (futureExceptions?.length) {
    const ids = futureExceptions.map((item) => item.id)
    await supabase.from('lessons').delete().in('id', ids)
    deletedIds.push(...ids)
  }

  revalidateCalendarPaths()
  return { deletedIds }
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

  const supabase = createAdminClient()
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
