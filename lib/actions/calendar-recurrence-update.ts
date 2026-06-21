import 'server-only'

import { addDays, format, parseISO } from 'date-fns'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import {
  addExdateToRecurrence,
  truncateRecurrenceUntil,
} from '@/lib/calendar-recurrence/expand-lessons'
import { buildVirtualLessonId, patternToRRuleLines } from '@/lib/calendar-recurrence/types'
import type { RecurrenceCapableLesson } from '@/lib/calendar-recurrence/types'
import { parseLessonRecurrencePattern } from '@/lib/lesson-recurrence'
import type { LessonFormData, LessonSeriesScope } from '@/lib/actions/lessons'
import type { Lesson } from '@/lib/types'
import { toStoredLessonType } from '@/lib/lesson-types'
import {
  syncAndPurgeStoredLessonsForRecurringSlot,
} from '@/lib/calendar-recurrence/purge-slot-stored-lessons'
import {
  resolveInstructorIdUpdate,
  resolveLessonTypeUpdate,
} from '@/lib/calendar-recurrence/resolve-field-update'

const MASTER_SELECT =
  'id, lesson_date, start_time, end_time, member_id, title, instructor_id, lesson_type, recurrence, recurrence_pattern, recurrence_group_id, event_type, event_status, session_deducted, google_event_id, google_sync_status'

function revalidateCalendarPaths() {
  revalidatePath('/dashboard/lessons')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/lesson-status')
}

function occurrenceOriginalIso(master: RecurrenceCapableLesson, date: string) {
  const hhmm = (master.start_time ?? '09:00').slice(0, 5)
  return new Date(`${date}T${hhmm}:00+09:00`).toISOString()
}

function dayBefore(dateKey: string) {
  return format(addDays(parseISO(dateKey), -1), 'yyyy-MM-dd')
}

function buildExceptionPayload(
  master: RecurrenceCapableLesson,
  occurrenceDate: string,
  updates: Partial<LessonFormData>,
): Record<string, unknown> {
  const lessonDate = updates.lesson_date ?? occurrenceDate
  return {
    event_type: 'exception',
    event_status: 'confirmed',
    attendance_status: 'present',
    recurring_master_id: master.id,
    original_start_time: occurrenceOriginalIso(master, occurrenceDate),
    lesson_date: lessonDate,
    member_id: updates.member_id ?? master.member_id,
    title: updates.title ?? master.title,
    instructor_id: resolveInstructorIdUpdate(updates, master.instructor_id),
    start_time: updates.start_time ?? master.start_time,
    end_time: updates.end_time ?? master.end_time,
    lesson_type: resolveLessonTypeUpdate(updates, master.lesson_type),
    recurrence_group_id: master.recurrence_group_id,
    recurrence_pattern: master.recurrence_pattern,
    session_deducted: false,
  }
}

function buildMasterPayloadFromRow(
  master: RecurrenceCapableLesson,
  updates: Partial<LessonFormData>,
  lessonDate: string,
  recurrence: string[] | null | undefined,
): Record<string, unknown> {
  return {
    event_type: 'recurring_master',
    event_status: 'confirmed',
    lesson_date: lessonDate,
    member_id: updates.member_id ?? master.member_id,
    title: updates.title ?? master.title,
    instructor_id: resolveInstructorIdUpdate(updates, master.instructor_id),
    start_time: updates.start_time ?? master.start_time,
    end_time: updates.end_time ?? master.end_time,
    lesson_type: resolveLessonTypeUpdate(updates, master.lesson_type),
    recurrence_group_id: master.recurrence_group_id ?? master.id,
    recurrence_pattern: master.recurrence_pattern,
    recurrence,
    session_deducted: false,
  }
}

function buildSlotMatchTargetFromMaster(
  master: RecurrenceCapableLesson,
  occurrenceDate: string,
  updates?: Partial<LessonFormData>,
) {
  return {
    lesson_date: occurrenceDate,
    member_id: updates?.member_id ?? master.member_id,
    title: updates?.title ?? master.title,
    start_time: updates?.start_time ?? master.start_time,
  }
}

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

function ensureMasterRecurrenceLines(row: RecurrenceCapableLesson): string[] {
  let lines = [...(row.recurrence ?? [])]
  if (!lines.some((line) => line.startsWith('RRULE:'))) {
    const pattern = row.recurrence_pattern
    if (pattern && pattern !== 'none') {
      lines = patternToRRuleLines(
        parseLessonRecurrencePattern(pattern),
        row.lesson_date,
      )
    }
  }
  return lines
}

async function purgeGroupStoredRowsFromDate(
  supabase: ReturnType<typeof createServiceRoleClient>,
  recurrenceGroupId: string | null | undefined,
  fromDate: string,
  keepIds: string[],
): Promise<string[]> {
  if (!recurrenceGroupId) return []

  const keep = new Set(keepIds)
  const { data: groupRows } = await supabase
    .from('lessons')
    .select('id')
    .eq('recurrence_group_id', recurrenceGroupId)
    .gte('lesson_date', fromDate)
    .neq('event_type', 'recurring_master')

  const ids = (groupRows ?? [])
    .map((item) => item.id)
    .filter((id) => !keep.has(id))

  if (ids.length) await bulkDeleteByIds(supabase, ids)
  return ids
}

async function purgeMemberSlotRowsFromDate(
  supabase: ReturnType<typeof createServiceRoleClient>,
  row: RecurrenceCapableLesson,
  fromDate: string,
  keepIds: string[],
): Promise<string[]> {
  if (!row.member_id) return []

  const keep = new Set(keepIds)
  const startKey = (row.start_time ?? '').slice(0, 5)
  const { data: slotRows } = await supabase
    .from('lessons')
    .select('id, start_time, event_type')
    .eq('member_id', row.member_id)
    .gte('lesson_date', fromDate)

  const ids: string[] = []
  for (const slotRow of slotRows ?? []) {
    if (keep.has(slotRow.id)) continue
    if (slotRow.event_type === 'recurring_master') continue
    if ((slotRow.start_time ?? '').slice(0, 5) !== startKey) continue
    ids.push(slotRow.id)
  }

  if (ids.length) await bulkDeleteByIds(supabase, ids)
  return ids
}

async function purgeExtraRecurringMastersFromDate(
  supabase: ReturnType<typeof createServiceRoleClient>,
  recurrenceGroupId: string | null | undefined,
  fromDate: string,
  keepIds: string[],
): Promise<string[]> {
  if (!recurrenceGroupId) return []

  const keep = new Set(keepIds)
  const { data: masters } = await supabase
    .from('lessons')
    .select('id')
    .eq('recurrence_group_id', recurrenceGroupId)
    .eq('event_type', 'recurring_master')
    .gte('lesson_date', fromDate)

  const ids = (masters ?? [])
    .map((item) => item.id)
    .filter((id) => !keep.has(id))

  if (ids.length) await bulkDeleteByIds(supabase, ids)
  return ids
}

async function syncAndPurgeRecurringSlot(
  supabase: ReturnType<typeof createServiceRoleClient>,
  slotMatchTarget: ReturnType<typeof buildSlotMatchTargetFromMaster>,
  scope: LessonSeriesScope,
  anchorDate: string,
  row: RecurrenceCapableLesson,
  updates: Partial<LessonFormData>,
  keepIds: string[],
): Promise<string[]> {
  const { deletedIds } = await syncAndPurgeStoredLessonsForRecurringSlot(
    supabase,
    slotMatchTarget,
    scope,
    anchorDate,
    {
      instructor_id: resolveInstructorIdUpdate(updates, row.instructor_id),
      lesson_type: resolveLessonTypeUpdate(updates, row.lesson_type),
      recurrence_pattern: row.recurrence_pattern ?? undefined,
      recurrence_group_id: row.recurrence_group_id,
    },
    {
      keepIds,
      recurrenceGroupId: row.recurrence_group_id,
    },
  )
  return deletedIds
}

function buildSlotTargetFromMaster(
  master: RecurrenceCapableLesson,
  occurrenceDate: string,
  updates: Partial<LessonFormData>,
) {
  return {
    lesson_date: occurrenceDate,
    member_id: updates.member_id ?? master.member_id,
    title: updates.title ?? master.title,
    instructor_id: resolveInstructorIdUpdate(updates, master.instructor_id),
    start_time: updates.start_time ?? master.start_time,
    end_time: updates.end_time ?? master.end_time,
  }
}

export async function updateRecurringMasterSeries(
  masterId: string,
  scope: LessonSeriesScope,
  occurrenceDate: string,
  updates: Partial<LessonFormData>,
): Promise<{ data?: Lesson[]; deletedIds?: string[]; error?: string }> {
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
  const updatedLessons: Lesson[] = []
  const deletedIds: string[] = []

  if (scope === 'single') {
    const newDate = updates.lesson_date ?? occurrenceDate

    if (newDate !== occurrenceDate) {
      const nextRecurrence = addExdateToRecurrence(
        row.recurrence,
        occurrenceDate,
        row.start_time,
      )
      const { error: exdateError } = await supabase
        .from('lessons')
        .update({ recurrence: nextRecurrence })
        .eq('id', masterId)
      if (exdateError) return { error: exdateError.message }

      const slotMatchTarget = buildSlotMatchTargetFromMaster(row, occurrenceDate)
      await syncAndPurgeStoredLessonsForRecurringSlot(
        supabase,
        slotMatchTarget,
        'single',
        occurrenceDate,
        {
          instructor_id: resolveInstructorIdUpdate(updates, row.instructor_id),
          lesson_type: resolveLessonTypeUpdate(updates, row.lesson_type),
          recurrence_pattern: row.recurrence_pattern ?? undefined,
          recurrence_group_id: row.recurrence_group_id,
        },
        { recurrenceGroupId: row.recurrence_group_id },
      ).then(({ deletedIds: purged }) => {
        deletedIds.push(...purged)
      })

      const payload = buildExceptionPayload(row, occurrenceDate, updates)
      const { data, error: insertError } = await supabase
        .from('lessons')
        .insert({ ...payload, lesson_type: payload.lesson_type ?? '개인레슨' })
        .select(MASTER_SELECT)
        .single()
      if (insertError) return { error: insertError.message }
      if (data) updatedLessons.push(data as Lesson)

      revalidateCalendarPaths()
      return { data: updatedLessons, deletedIds }
    }

    const slotMatchTarget = buildSlotMatchTargetFromMaster(row, occurrenceDate)
    await syncAndPurgeStoredLessonsForRecurringSlot(
      supabase,
      slotMatchTarget,
      'single',
      occurrenceDate,
      {
        instructor_id: resolveInstructorIdUpdate(updates, row.instructor_id),
        lesson_type: resolveLessonTypeUpdate(updates, row.lesson_type),
        recurrence_pattern: row.recurrence_pattern ?? undefined,
        recurrence_group_id: row.recurrence_group_id,
      },
      { recurrenceGroupId: row.recurrence_group_id },
    ).then(({ deletedIds: purged }) => {
      deletedIds.push(...purged)
    })

    const payload = buildExceptionPayload(row, occurrenceDate, updates)
    const { data: existing } = await supabase
      .from('lessons')
      .select('id')
      .eq('recurring_master_id', masterId)
      .eq('lesson_date', occurrenceDate)
      .maybeSingle()

    if (existing?.id) {
      const { data, error: updateError } = await supabase
        .from('lessons')
        .update(payload)
        .eq('id', existing.id)
        .select(MASTER_SELECT)
        .single()
      if (updateError) return { error: updateError.message }
      if (data) updatedLessons.push(data as Lesson)
    } else {
      const { data, error: insertError } = await supabase
        .from('lessons')
        .insert({ ...payload, lesson_type: payload.lesson_type ?? '개인레슨' })
        .select(MASTER_SELECT)
        .single()
      if (insertError) return { error: insertError.message }
      if (data) updatedLessons.push(data as Lesson)
    }

    revalidateCalendarPaths()
    return { data: updatedLessons, deletedIds }
  }

  if (scope === 'all') {
    const oldSlotMatchTarget = buildSlotMatchTargetFromMaster(row, occurrenceDate)
    await syncAndPurgeRecurringSlot(
      supabase,
      oldSlotMatchTarget,
      'all',
      occurrenceDate,
      row,
      updates,
      [masterId],
    ).then((purged) => {
      deletedIds.push(...purged)
    })

    const payload = buildMasterPayloadFromRow(row, updates, row.lesson_date, row.recurrence)
    const { data, error: updateError } = await supabase
      .from('lessons')
      .update(payload)
      .eq('id', masterId)
      .select(MASTER_SELECT)
      .single()
    if (updateError) return { error: updateError.message }
    if (data) updatedLessons.push(data as Lesson)

    const newSlotMatchTarget = buildSlotMatchTargetFromMaster(row, occurrenceDate, updates)
    await syncAndPurgeRecurringSlot(
      supabase,
      newSlotMatchTarget,
      'all',
      occurrenceDate,
      row,
      updates,
      [masterId],
    ).then((purged) => {
      deletedIds.push(...purged)
    })

    const groupId = row.recurrence_group_id ?? row.id
    const groupPurged = await purgeGroupStoredRowsFromDate(
      supabase,
      groupId,
      row.lesson_date,
      [masterId],
    )
    deletedIds.push(...groupPurged)

    revalidateCalendarPaths()
    return { data: updatedLessons, deletedIds: [...new Set(deletedIds)] }
  }

  // future — split series: old master ends before anchor, new master from anchor
  const pattern = parseLessonRecurrencePattern(row.recurrence_pattern)
  const recurrenceLines = ensureMasterRecurrenceLines(row)
  const truncatedRecurrence = truncateRecurrenceUntil(
    recurrenceLines,
    dayBefore(occurrenceDate),
  )

  const { error: truncateError } = await supabase
    .from('lessons')
    .update({ recurrence: truncatedRecurrence })
    .eq('id', masterId)
  if (truncateError) return { error: truncateError.message }

  deletedIds.push(buildVirtualLessonId(masterId, occurrenceDate))

  await supabase
    .from('lessons')
    .delete()
    .eq('recurring_master_id', masterId)
    .gte('lesson_date', occurrenceDate)

  const groupId = row.recurrence_group_id ?? row.id
  const keepMasterIds = [masterId]

  deletedIds.push(
    ...(await purgeGroupStoredRowsFromDate(
      supabase,
      groupId,
      occurrenceDate,
      keepMasterIds,
    )),
  )

  deletedIds.push(
    ...(await purgeMemberSlotRowsFromDate(
      supabase,
      row,
      occurrenceDate,
      keepMasterIds,
    )),
  )

  const oldSlotMatchTarget = buildSlotMatchTargetFromMaster(row, occurrenceDate)
  deletedIds.push(
    ...(await syncAndPurgeRecurringSlot(
      supabase,
      oldSlotMatchTarget,
      'future',
      occurrenceDate,
      row,
      updates,
      keepMasterIds,
    )),
  )

  const freshRecurrence = patternToRRuleLines(pattern, occurrenceDate)
  const newMasterPayload = buildMasterPayloadFromRow(
    row,
    updates,
    occurrenceDate,
    freshRecurrence,
  )

  const { data: newMaster, error: insertError } = await supabase
    .from('lessons')
    .insert({
      ...newMasterPayload,
      lesson_type: newMasterPayload.lesson_type ?? '개인레슨',
      recurrence_group_id: groupId,
    })
    .select(MASTER_SELECT)
    .single()

  if (insertError) return { error: insertError.message }

  const newMasterId = newMaster?.id
  if (newMasterId) keepMasterIds.push(newMasterId)

  deletedIds.push(
    ...(await purgeExtraRecurringMastersFromDate(
      supabase,
      groupId,
      occurrenceDate,
      keepMasterIds,
    )),
  )

  const newSlotMatchTarget = buildSlotMatchTargetFromMaster(row, occurrenceDate, updates)
  deletedIds.push(
    ...(await syncAndPurgeRecurringSlot(
      supabase,
      newSlotMatchTarget,
      'future',
      occurrenceDate,
      row,
      updates,
      keepMasterIds,
    )),
  )

  deletedIds.push(
    ...(await purgeMemberSlotRowsFromDate(
      supabase,
      {
        ...row,
        member_id: updates.member_id ?? row.member_id,
        start_time: updates.start_time ?? row.start_time,
      },
      occurrenceDate,
      keepMasterIds,
    )),
  )

  if (newMaster) updatedLessons.push(newMaster as Lesson)
  revalidateCalendarPaths()
  return { data: updatedLessons, deletedIds: [...new Set(deletedIds)] }
}
