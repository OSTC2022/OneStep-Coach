import 'server-only'

import { addDays, format, parseISO } from 'date-fns'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import {
  addExdateToRecurrence,
  truncateRecurrenceUntil,
} from '@/lib/calendar-recurrence/expand-lessons'
import { resolveRecurringDeleteTarget } from '@/lib/actions/calendar-recurrence-series'
import { parseVirtualLessonId, buildVirtualLessonId } from '@/lib/calendar-recurrence/types'
import type { RecurrenceCapableLesson } from '@/lib/calendar-recurrence/types'
import type { LessonFormData, LessonSeriesScope } from '@/lib/actions/lessons'
import type { Lesson } from '@/lib/types'
import { toStoredLessonType } from '@/lib/lesson-types'
import {
  filterLessonsByRecurringSlot,
  resolveLessonRecurrence,
} from '@/lib/lesson-recurrence-legacy'

const LESSON_SELECT =
  'id, lesson_date, start_time, end_time, member_id, title, instructor_id, lesson_type, recurrence, recurrence_pattern, recurrence_group_id, event_type, recurring_master_id, session_deducted'

const CLEAR_RECURRENCE = {
  recurrence_group_id: null,
  recurrence_pattern: 'none',
  recurrence: null,
  event_type: 'single',
  recurring_master_id: null,
  original_start_time: null,
} as const

type LegacySiblingRow = {
  id: string
  lesson_date: string
  member_id?: string | null
  instructor_id?: string | null
  start_time?: string | null
  end_time?: string | null
  title?: string | null
  event_type?: string | null
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

function buildSingleInsertPayload(
  source: RecurrenceCapableLesson,
  occurrenceDate: string,
  updates: Partial<LessonFormData>,
): Record<string, unknown> {
  return {
    ...CLEAR_RECURRENCE,
    event_status: 'confirmed',
    attendance_status: 'present',
    lesson_date: updates.lesson_date ?? occurrenceDate,
    member_id: updates.member_id ?? source.member_id,
    title: updates.title ?? source.title,
    instructor_id: updates.instructor_id ?? source.instructor_id,
    start_time: updates.start_time ?? source.start_time,
    end_time: updates.end_time ?? source.end_time,
    lesson_type: toStoredLessonType(updates.lesson_type ?? source.lesson_type ?? 'individual'),
    session_deducted: false,
  }
}

function buildSingleUpdatePayload(
  updates: Partial<LessonFormData>,
): Record<string, unknown> {
  return {
    ...CLEAR_RECURRENCE,
    ...updates,
    lesson_type: updates.lesson_type
      ? toStoredLessonType(updates.lesson_type)
      : undefined,
  }
}

async function insertSingleLesson(
  supabase: ReturnType<typeof createServiceRoleClient>,
  payload: Record<string, unknown>,
): Promise<Lesson> {
  const { data, error } = await supabase
    .from('lessons')
    .insert({
      ...payload,
      lesson_type: payload.lesson_type ?? '개인레슨',
    })
    .select(LESSON_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as Lesson
}

async function fetchSlotCandidates(
  supabase: ReturnType<typeof createServiceRoleClient>,
  row: LegacySiblingRow,
) {
  if (row.member_id) {
    const { data } = await supabase
      .from('lessons')
      .select(LESSON_SELECT)
      .eq('member_id', row.member_id)
    return (data ?? []) as LegacySiblingRow[]
  }

  if (row.title) {
    const { data } = await supabase
      .from('lessons')
      .select(LESSON_SELECT)
      .eq('title', row.title)
      .is('member_id', null)
    return (data ?? []) as LegacySiblingRow[]
  }

  return []
}

function filterByScope(
  rows: LegacySiblingRow[],
  scope: LessonSeriesScope,
  anchorDate: string,
): LegacySiblingRow[] {
  if (scope === 'single') {
    return rows.filter((row) => row.lesson_date === anchorDate)
  }
  if (scope === 'future') {
    return rows.filter((row) => row.lesson_date >= anchorDate)
  }
  return rows
}

async function removeSlotBasedRecurrence(
  supabase: ReturnType<typeof createServiceRoleClient>,
  lessonId: string,
  scope: LessonSeriesScope,
  anchorDate: string,
  updates: Partial<LessonFormData>,
  row: RecurrenceCapableLesson,
): Promise<{ data?: Lesson[]; deletedIds?: string[]; error?: string }> {
  const slotTarget: LegacySiblingRow = {
    id: row.id,
    lesson_date: anchorDate,
    member_id: updates.member_id ?? row.member_id,
    title: updates.title ?? row.title,
    instructor_id: updates.instructor_id ?? row.instructor_id,
    start_time: updates.start_time ?? row.start_time,
    end_time: updates.end_time ?? row.end_time,
  }

  const candidates = await fetchSlotCandidates(supabase, slotTarget)
  const matching = filterLessonsByRecurringSlot(slotTarget, candidates)
  const inScope = filterByScope(matching, scope, anchorDate)

  const keepRow =
    inScope.find((item) => item.id === lessonId) ??
    inScope.find((item) => item.lesson_date === anchorDate) ??
    ({ ...slotTarget, id: lessonId } as LegacySiblingRow)

  if (keepRow.event_type === 'recurring_master') {
    return removeRecurringMasterRecurrence(
      keepRow.id,
      scope,
      anchorDate,
      updates,
    )
  }

  if (scope === 'single') {
    const sameDateDupes = matching
      .filter((item) => item.lesson_date === anchorDate && item.id !== keepRow.id)
      .map((item) => item.id)
    if (sameDateDupes.length) {
      await bulkDeleteByIds(supabase, sameDateDupes)
    }

    if (parseVirtualLessonId(keepRow.id)) {
      const single = await insertSingleLesson(
        supabase,
        buildSingleInsertPayload(row, anchorDate, updates),
      )
      revalidateCalendarPaths()
      return {
        data: [single],
        deletedIds: [...sameDateDupes, keepRow.id],
      }
    }

    const { data, error: updateError } = await supabase
      .from('lessons')
      .update(buildSingleUpdatePayload(updates))
      .eq('id', keepRow.id)
      .select(LESSON_SELECT)
      .single()
    if (updateError) return { error: updateError.message }
    revalidateCalendarPaths()
    return {
      data: data ? [data as Lesson] : undefined,
      deletedIds: sameDateDupes,
    }
  }

  const deleteIds = inScope
    .filter((item) => item.id !== keepRow.id)
    .map((item) => item.id)

  const masterRows = inScope.filter((item) => item.event_type === 'recurring_master')
  for (const master of masterRows) {
    if (master.id === keepRow.id) continue
    const { data: exceptions } = await supabase
      .from('lessons')
      .select('id')
      .eq('recurring_master_id', master.id)
    deleteIds.push(...(exceptions ?? []).map((item) => item.id))
  }

  await bulkDeleteByIds(supabase, deleteIds)

  if (parseVirtualLessonId(keepRow.id)) {
    const single = await insertSingleLesson(
      supabase,
      buildSingleInsertPayload(row, anchorDate, updates),
    )
    revalidateCalendarPaths()
    return {
      data: [single],
      deletedIds: [...deleteIds, keepRow.id],
    }
  }

  const { data, error: updateError } = await supabase
    .from('lessons')
    .update(buildSingleUpdatePayload(updates))
    .eq('id', keepRow.id)
    .select(LESSON_SELECT)
    .single()
  if (updateError) return { error: updateError.message }

  revalidateCalendarPaths()
  return {
    data: data ? [data as Lesson] : undefined,
    deletedIds: deleteIds,
  }
}

async function fetchLegacySiblingIds(
  supabase: ReturnType<typeof createServiceRoleClient>,
  row: RecurrenceCapableLesson,
  groupId: string,
  anchorDate: string,
  scope: LessonSeriesScope,
): Promise<string[]> {
  const { data: siblings } = await supabase
    .from('lessons')
    .select('id, lesson_date, member_id, instructor_id, start_time, end_time, title')
    .eq('recurrence_group_id', groupId)

  let matching = filterLessonsByRecurringSlot(
    row as LegacySiblingRow,
    (siblings ?? []) as LegacySiblingRow[],
  )

  if (scope === 'future') {
    matching = matching.filter((item) => item.lesson_date >= anchorDate)
  }

  return matching.map((item) => item.id)
}

async function fetchRecurringMasterRow(
  supabase: ReturnType<typeof createServiceRoleClient>,
  masterId: string,
): Promise<RecurrenceCapableLesson | null> {
  const { data, error } = await supabase
    .from('lessons')
    .select(LESSON_SELECT)
    .eq('id', masterId)
    .eq('event_type', 'recurring_master')
    .maybeSingle()

  if (error || !data) return null
  return data as RecurrenceCapableLesson
}

function buildFallbackSource(
  occurrenceDate: string,
  updates: Partial<LessonFormData>,
): RecurrenceCapableLesson {
  return {
    id: '',
    lesson_date: occurrenceDate,
    member_id: updates.member_id ?? null,
    title: updates.title ?? null,
    instructor_id: updates.instructor_id ?? null,
    start_time: updates.start_time ?? null,
    end_time: updates.end_time ?? null,
    lesson_type: updates.lesson_type ?? 'individual',
  }
}

async function removeRecurrenceFallback(
  lessonId: string,
  scope: LessonSeriesScope,
  anchorDate: string,
  updates: Partial<LessonFormData>,
  options?: { masterId?: string | null },
): Promise<{ data?: Lesson[]; deletedIds?: string[]; error?: string }> {
  const supabase = createServiceRoleClient()
  const virtual = parseVirtualLessonId(lessonId)
  const occurrenceDate = virtual?.occurrenceDate ?? anchorDate
  const masterId = options?.masterId ?? virtual?.masterId ?? null
  const deletedIds = new Set<string>()

  if (masterId) {
    deletedIds.add(masterId)
    await supabase.from('lessons').delete().eq('id', masterId)
    const { data: exceptionRows } = await supabase
      .from('lessons')
      .select('id')
      .eq('recurring_master_id', masterId)
    for (const row of exceptionRows ?? []) {
      deletedIds.add(row.id)
    }
    if (exceptionRows?.length) {
      await bulkDeleteByIds(
        supabase,
        exceptionRows.map((row) => row.id),
      )
    }
  }

  const slotTarget: LegacySiblingRow = {
    id: lessonId,
    lesson_date: occurrenceDate,
    member_id: updates.member_id ?? null,
    title: updates.title ?? null,
    instructor_id: updates.instructor_id ?? null,
    start_time: updates.start_time ?? null,
    end_time: updates.end_time ?? null,
  }

  const candidates = await fetchSlotCandidates(supabase, slotTarget)
  const matching = filterLessonsByRecurringSlot(slotTarget, candidates)
  const inScope = filterByScope(matching, scope, occurrenceDate)

  if (scope === 'single') {
    const sameDateDupes = matching
      .filter((item) => item.lesson_date === occurrenceDate)
      .map((item) => item.id)
    if (sameDateDupes.length) {
      await bulkDeleteByIds(supabase, sameDateDupes)
      sameDateDupes.forEach((id) => deletedIds.add(id))
    }

    const single = await insertSingleLesson(
      supabase,
      buildSingleInsertPayload(
        buildFallbackSource(occurrenceDate, updates),
        occurrenceDate,
        updates,
      ),
    )
    if (virtual) deletedIds.add(lessonId)
    revalidateCalendarPaths()
    return {
      data: [single],
      deletedIds: [...deletedIds],
    }
  }

  const deleteIds = inScope.map((item) => item.id)
  if (deleteIds.length) {
    await bulkDeleteByIds(supabase, deleteIds)
    deleteIds.forEach((id) => deletedIds.add(id))
  }

  const template =
    (inScope.find((item) => item.lesson_date === occurrenceDate) as
      | RecurrenceCapableLesson
      | undefined) ?? buildFallbackSource(occurrenceDate, updates)

  const single = await insertSingleLesson(
    supabase,
    buildSingleInsertPayload(template, occurrenceDate, updates),
  )

  if (virtual) deletedIds.add(lessonId)
  revalidateCalendarPaths()
  return {
    data: [single],
    deletedIds: [...deletedIds],
  }
}

async function removeRecurringMasterRecurrence(
  masterId: string,
  scope: LessonSeriesScope,
  occurrenceDate: string,
  updates: Partial<LessonFormData>,
  sourceLessonId?: string,
): Promise<{ data?: Lesson[]; deletedIds?: string[]; error?: string }> {
  const supabase = createServiceRoleClient()

  const row = await fetchRecurringMasterRow(supabase, masterId)

  if (!row) {
    return removeRecurrenceFallback(
      sourceLessonId ?? buildVirtualLessonId(masterId, occurrenceDate),
      scope,
      occurrenceDate,
      updates,
      { masterId },
    )
  }

  const deletedIds: string[] = [masterId]

  if (scope === 'single') {
    await supabase
      .from('lessons')
      .update({
        recurrence: addExdateToRecurrence(row.recurrence, occurrenceDate, row.start_time),
      })
      .eq('id', masterId)

    await supabase
      .from('lessons')
      .delete()
      .eq('recurring_master_id', masterId)
      .eq('lesson_date', occurrenceDate)

    const single = await insertSingleLesson(
      supabase,
      buildSingleInsertPayload(row, occurrenceDate, updates),
    )
    revalidateCalendarPaths()
    return { data: [single], deletedIds: [`virt:${masterId}:${occurrenceDate}`] }
  }

  if (scope === 'future') {
    await supabase
      .from('lessons')
      .update({
        recurrence: truncateRecurrenceUntil(row.recurrence, dayBefore(occurrenceDate)),
      })
      .eq('id', masterId)

    await supabase
      .from('lessons')
      .delete()
      .eq('recurring_master_id', masterId)
      .gte('lesson_date', occurrenceDate)

    const single = await insertSingleLesson(
      supabase,
      buildSingleInsertPayload(row, occurrenceDate, updates),
    )
    revalidateCalendarPaths()
    return {
      data: [single],
      deletedIds: [`virt:${masterId}:${occurrenceDate}`],
    }
  }

  const { data: exceptions } = await supabase
    .from('lessons')
    .select('id')
    .eq('recurring_master_id', masterId)

  await bulkDeleteByIds(supabase, [
    masterId,
    ...(exceptions ?? []).map((item) => item.id),
  ])
  deletedIds.push(...(exceptions ?? []).map((item) => item.id))

  const single = await insertSingleLesson(
    supabase,
    buildSingleInsertPayload(row, occurrenceDate, updates),
  )
  revalidateCalendarPaths()
  return {
    data: [single],
    deletedIds: [...deletedIds, `virt:${masterId}:${occurrenceDate}`],
  }
}

async function removeLegacyMaterializedRecurrence(
  lessonId: string,
  scope: LessonSeriesScope,
  anchorDate: string,
  updates: Partial<LessonFormData>,
): Promise<{ data?: Lesson[]; deletedIds?: string[]; error?: string }> {
  const supabase = createServiceRoleClient()

  const { data: lesson, error } = await supabase
    .from('lessons')
    .select(LESSON_SELECT)
    .eq('id', lessonId)
    .maybeSingle()

  if (error || !lesson) {
    return { error: '수업을 찾을 수 없습니다.' }
  }

  const row = lesson as RecurrenceCapableLesson
  const { groupId } = resolveLessonRecurrence(row)

  if (!groupId || groupId.startsWith('slot:')) {
    return removeSlotBasedRecurrence(
      supabase,
      lessonId,
      scope,
      anchorDate,
      updates,
      row,
    )
  }

  if (scope === 'single') {
    const { data, error: updateError } = await supabase
      .from('lessons')
      .update(buildSingleUpdatePayload(updates))
      .eq('id', lessonId)
      .select(LESSON_SELECT)
      .single()
    if (updateError) return { error: updateError.message }
    revalidateCalendarPaths()
    return { data: data ? [data as Lesson] : undefined }
  }

  const siblingIds = await fetchLegacySiblingIds(
    supabase,
    row,
    groupId,
    anchorDate,
    scope,
  )
  const deleteIds = siblingIds.filter((id) => id !== lessonId)
  await bulkDeleteByIds(supabase, deleteIds)

  const { data, error: updateError } = await supabase
    .from('lessons')
    .update(buildSingleUpdatePayload(updates))
    .eq('id', lessonId)
    .select(LESSON_SELECT)
    .single()
  if (updateError) return { error: updateError.message }

  revalidateCalendarPaths()
  return { data: data ? [data as Lesson] : undefined, deletedIds: deleteIds }
}

export async function removeLessonRecurrence(
  lessonId: string,
  scope: LessonSeriesScope,
  anchorDate: string,
  updates: Partial<LessonFormData>,
): Promise<{ data?: Lesson[]; deletedIds?: string[]; error?: string }> {
  const virtual = parseVirtualLessonId(lessonId)
  if (virtual) {
    return removeRecurringMasterRecurrence(
      virtual.masterId,
      scope,
      virtual.occurrenceDate,
      updates,
      lessonId,
    )
  }

  const recurringTarget = await resolveRecurringDeleteTarget(lessonId, anchorDate)
  if (recurringTarget) {
    return removeRecurringMasterRecurrence(
      recurringTarget.masterId,
      scope,
      recurringTarget.occurrenceDate,
      updates,
      lessonId,
    )
  }

  return removeLegacyMaterializedRecurrence(lessonId, scope, anchorDate, updates)
}
