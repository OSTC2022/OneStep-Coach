import 'server-only'

import { addDays, format, parseISO } from 'date-fns'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  truncateRecurrenceUntil,
} from '@/lib/calendar-recurrence/expand-lessons'
import { patternToRRuleLines } from '@/lib/calendar-recurrence/types'
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
  return {
    event_type: 'exception',
    event_status: 'confirmed',
    attendance_status: 'present',
    recurring_master_id: master.id,
    original_start_time: occurrenceOriginalIso(master, occurrenceDate),
    lesson_date: occurrenceDate,
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
) {
  return {
    lesson_date: occurrenceDate,
    member_id: master.member_id,
    title: master.title,
    start_time: master.start_time,
  }
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
  const updatedLessons: Lesson[] = []
  const deletedIds: string[] = []

  if (scope === 'single') {
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
    const payload = buildMasterPayloadFromRow(row, updates, row.lesson_date, row.recurrence)
    const { data, error: updateError } = await supabase
      .from('lessons')
      .update(payload)
      .eq('id', masterId)
      .select(MASTER_SELECT)
      .single()
    if (updateError) return { error: updateError.message }
    if (data) updatedLessons.push(data as Lesson)

    const slotMatchTarget = buildSlotMatchTargetFromMaster(row, occurrenceDate)
    await syncAndPurgeStoredLessonsForRecurringSlot(
      supabase,
      slotMatchTarget,
      'all',
      occurrenceDate,
      {
        instructor_id: resolveInstructorIdUpdate(updates, row.instructor_id),
        lesson_type: resolveLessonTypeUpdate(updates, row.lesson_type),
        recurrence_pattern: row.recurrence_pattern ?? undefined,
        recurrence_group_id: row.recurrence_group_id,
      },
      {
        keepIds: [masterId],
        recurrenceGroupId: row.recurrence_group_id,
      },
    ).then(({ deletedIds: purged }) => {
      deletedIds.push(...purged)
    })

    revalidateCalendarPaths()
    return { data: updatedLessons, deletedIds }
  }

  // future — split series: old master ends before anchor, new master from anchor
  const pattern = parseLessonRecurrencePattern(row.recurrence_pattern)
  const truncatedRecurrence = truncateRecurrenceUntil(
    row.recurrence,
    dayBefore(occurrenceDate),
  )

  const { error: truncateError } = await supabase
    .from('lessons')
    .update({ recurrence: truncatedRecurrence })
    .eq('id', masterId)
  if (truncateError) return { error: truncateError.message }

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
      recurrence_group_id: row.recurrence_group_id ?? row.id,
    })
    .select(MASTER_SELECT)
    .single()

  if (insertError) return { error: insertError.message }

  await supabase
    .from('lessons')
    .delete()
    .eq('recurring_master_id', masterId)
    .gte('lesson_date', occurrenceDate)

  const slotMatchTarget = buildSlotMatchTargetFromMaster(row, occurrenceDate)
  await syncAndPurgeStoredLessonsForRecurringSlot(
    supabase,
    slotMatchTarget,
    'future',
    occurrenceDate,
    {
      instructor_id: resolveInstructorIdUpdate(updates, row.instructor_id),
      lesson_type: resolveLessonTypeUpdate(updates, row.lesson_type),
      recurrence_pattern: row.recurrence_pattern ?? undefined,
      recurrence_group_id: row.recurrence_group_id,
    },
    {
      keepIds: [masterId, newMaster?.id].filter(Boolean) as string[],
      recurrenceGroupId: row.recurrence_group_id,
    },
  ).then(({ deletedIds: purged }) => {
    deletedIds.push(...purged)
  })

  if (newMaster) updatedLessons.push(newMaster as Lesson)
  revalidateCalendarPaths()
  return { data: updatedLessons, deletedIds }
}
