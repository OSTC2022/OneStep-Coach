import 'server-only'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { truncateRecurrenceUntil } from '@/lib/calendar-recurrence/expand-lessons'
import { buildAppRecurringMasterPayload } from '@/lib/calendar-recurrence/google-sync-mapper'
import { parseVirtualLessonId } from '@/lib/calendar-recurrence/types'
import type { LessonFormData, LessonSeriesScope } from '@/lib/actions/lessons'
import type { LessonRecurrencePattern } from '@/lib/lesson-recurrence'
import { isOpenEndedRecurrencePattern } from '@/lib/lesson-recurrence'
import type { Lesson } from '@/lib/types'
import { getDay, parseISO } from 'date-fns'
import { filterLessonsByRecurringSlotMatch } from '@/lib/lesson-recurrence-legacy'
import { resolveLessonTitle } from '@/lib/calendar-utils'
import { purgeStoredLessonsForRecurringSlot, syncAndPurgeStoredLessonsForRecurringSlot } from '@/lib/calendar-recurrence/purge-slot-stored-lessons'
import { resolveRecurringDeleteTarget } from '@/lib/actions/calendar-recurrence-series'
import {
  resolveInstructorIdUpdate,
  resolveLessonTypeUpdate,
} from '@/lib/calendar-recurrence/resolve-field-update'

const LESSON_SELECT =
  'id, lesson_date, start_time, end_time, member_id, title, instructor_id, lesson_type, recurrence, recurrence_pattern, recurrence_group_id, event_type, recurring_master_id, session_deducted'

type SlotRow = {
  id: string
  lesson_date: string
  member_id?: string | null
  instructor_id?: string | null
  start_time?: string | null
  end_time?: string | null
  title?: string | null
  lesson_type?: string | null
  recurrence_group_id?: string | null
  event_type?: string | null
}

function revalidateCalendarPaths() {
  revalidatePath('/dashboard/lessons')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/lesson-status')
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

function buildSlotTarget(
  anchorDate: string,
  updates: Partial<LessonFormData>,
  source: SlotRow,
): SlotRow {
  return {
    id: source.id,
    lesson_date: anchorDate,
    member_id: updates.member_id ?? source.member_id,
    title: updates.title ?? source.title,
    instructor_id: resolveInstructorIdUpdate(updates, source.instructor_id),
    start_time: updates.start_time ?? source.start_time,
    end_time: updates.end_time ?? source.end_time,
  }
}

function buildSlotMatchTarget(anchorDate: string, source: SlotRow): SlotRow {
  return {
    id: source.id,
    lesson_date: anchorDate,
    member_id: source.member_id,
    title: source.title,
    instructor_id: source.instructor_id,
    start_time: source.start_time,
    end_time: source.end_time,
  }
}

function filterByScope(
  rows: SlotRow[],
  scope: LessonSeriesScope,
  anchorDate: string,
): SlotRow[] {
  if (scope === 'single') {
    return rows.filter((row) => row.lesson_date === anchorDate)
  }
  if (scope === 'future') {
    // future = 기준일(편집 중인 날) 포함, 그 이후만
    return rows.filter((row) => row.lesson_date >= anchorDate)
  }
  return rows
}

async function fetchSlotCandidates(
  supabase: ReturnType<typeof createServiceRoleClient>,
  source: SlotRow,
) {
  if (source.member_id) {
    const { data } = await supabase
      .from('lessons')
      .select(LESSON_SELECT)
      .eq('member_id', source.member_id)
    return (data ?? []) as SlotRow[]
  }

  if (source.title) {
    const { data } = await supabase
      .from('lessons')
      .select(LESSON_SELECT)
      .eq('title', source.title)
      .is('member_id', null)
    return (data ?? []) as SlotRow[]
  }

  return []
}

async function deleteUnnamedRecurringMastersAtSlot(
  supabase: ReturnType<typeof createServiceRoleClient>,
  slotTarget: SlotRow,
  anchorDate: string,
  keepMasterId: string,
): Promise<string[]> {
  const weekday = getDay(parseISO(anchorDate))
  const startKey = (slotTarget.start_time ?? '').slice(0, 5)

  const { data: masters } = await supabase
    .from('lessons')
    .select('id, lesson_date, start_time, member_id, title, event_type')
    .eq('event_type', 'recurring_master')

  const deleteIds: string[] = []
  for (const row of masters ?? []) {
    if (row.id === keepMasterId) continue
    if (row.member_id) continue
    if (resolveLessonTitle(row)) continue
    if ((row.start_time?.slice(0, 5) ?? '') !== startKey) continue
    if (getDay(parseISO(row.lesson_date)) !== weekday) continue
    deleteIds.push(row.id)
  }

  if (deleteIds.length) {
    await bulkDeleteByIds(supabase, deleteIds)
  }
  return deleteIds
}

export async function convertLessonToRecurringSeries(
  lessonId: string,
  scope: LessonSeriesScope,
  anchorDate: string,
  updates: Partial<LessonFormData>,
  pattern: LessonRecurrencePattern,
  endDate?: string | null,
): Promise<{ data?: Lesson[]; deletedIds?: string[]; error?: string }> {
  const supabase = createServiceRoleClient()

  const virtual = parseVirtualLessonId(lessonId)
  let resolvedLessonId = lessonId

  if (virtual) {
    resolvedLessonId = virtual.masterId
    anchorDate = virtual.occurrenceDate
  }

  const { data: source, error: sourceError } = await supabase
    .from('lessons')
    .select(LESSON_SELECT)
    .eq('id', resolvedLessonId)
    .maybeSingle()

  if (sourceError || !source) {
    return { error: '수업을 찾을 수 없습니다.' }
  }

  const recurringTarget = await resolveRecurringDeleteTarget(resolvedLessonId, anchorDate)
  if (recurringTarget) {
    resolvedLessonId = recurringTarget.masterId
    anchorDate = recurringTarget.occurrenceDate
    const { data: masterSource } = await supabase
      .from('lessons')
      .select(LESSON_SELECT)
      .eq('id', recurringTarget.masterId)
      .maybeSingle()
    if (masterSource) {
      Object.assign(source, masterSource)
    }
  }

  const slotTarget = buildSlotTarget(anchorDate, updates, source as SlotRow)
  const slotMatchTarget = buildSlotMatchTarget(anchorDate, source as SlotRow)

  if (!slotTarget.member_id && !resolveLessonTitle(slotTarget)) {
    return { error: '반복 등록 전 회원 연결 또는 이름을 입력해주세요.' }
  }

  const candidates = await fetchSlotCandidates(supabase, slotMatchTarget)
  const matching = filterLessonsByRecurringSlotMatch(slotMatchTarget, candidates)
  const inScope = filterByScope(matching, scope, anchorDate)

  const anchorRow =
    inScope.find((row) => row.id === resolvedLessonId) ??
    inScope.find((row) => row.lesson_date === anchorDate) ??
    (source as SlotRow)

  const duplicateDeleteIds = inScope
    .filter((row) => row.id !== anchorRow.id && row.event_type !== 'recurring_master')
    .map((row) => row.id)

  const recurrenceGroupId =
    anchorRow.event_type === 'recurring_master' && source.recurrence_group_id
      ? source.recurrence_group_id
      : crypto.randomUUID()
  const resolvedLessonType = resolveLessonTypeUpdate(
    updates,
    source.lesson_type ?? updates.lesson_type,
  )
  let recurrenceLines = buildAppRecurringMasterPayload(
    {
      lesson_date: anchorDate,
      start_time: slotTarget.start_time,
      end_time: updates.end_time ?? source.end_time,
      member_id: slotTarget.member_id,
      title: slotTarget.title,
      instructor_id: slotTarget.instructor_id,
      lesson_type: resolvedLessonType,
    },
    pattern,
    recurrenceGroupId,
  ).recurrence as string[]

  if (endDate && !isOpenEndedRecurrencePattern(pattern)) {
    recurrenceLines = truncateRecurrenceUntil(recurrenceLines, endDate)
  }

  const masterPayload = {
    ...buildAppRecurringMasterPayload(
      {
        lesson_date: anchorDate,
        start_time: slotTarget.start_time,
        end_time: updates.end_time ?? source.end_time,
        member_id: slotTarget.member_id,
        title: slotTarget.title,
        instructor_id: slotTarget.instructor_id,
        lesson_type: resolvedLessonType,
      },
      pattern,
      recurrenceGroupId,
    ),
    recurrence: recurrenceLines,
    member_id: slotTarget.member_id,
    title: slotTarget.title,
    instructor_id: slotTarget.instructor_id,
    start_time: slotTarget.start_time,
    end_time: updates.end_time ?? source.end_time,
    lesson_type: resolvedLessonType,
    lesson_date: anchorDate,
    recurring_master_id: null,
    original_start_time: null,
  }

  if (duplicateDeleteIds.length) {
    await bulkDeleteByIds(supabase, duplicateDeleteIds)
  }

  const orphanMasterIds = await deleteUnnamedRecurringMastersAtSlot(
    supabase,
    slotTarget,
    anchorDate,
    anchorRow.id,
  )

  let masterId = anchorRow.id

  if (anchorRow.event_type === 'recurring_master') {
    const { data, error: updateError } = await supabase
      .from('lessons')
      .update(masterPayload)
      .eq('id', anchorRow.id)
      .select(LESSON_SELECT)
      .single()
    if (updateError) return { error: updateError.message }

    const { deletedIds: purgedIds } = await syncAndPurgeStoredLessonsForRecurringSlot(
      supabase,
      slotMatchTarget,
      scope,
      anchorDate,
      {
        instructor_id: slotTarget.instructor_id,
        lesson_type: resolvedLessonType,
        recurrence_pattern: pattern,
        recurrence_group_id: recurrenceGroupId,
      },
      {
        keepIds: [anchorRow.id],
        recurrenceGroupId: recurrenceGroupId,
      },
    )

    revalidateCalendarPaths()
    return {
      data: data ? [data as Lesson] : undefined,
      deletedIds: [
        ...duplicateDeleteIds,
        ...orphanMasterIds,
        ...purgedIds,
        ...(virtual ? [lessonId] : []),
      ],
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('lessons')
    .update(masterPayload)
    .eq('id', anchorRow.id)
    .select(LESSON_SELECT)
    .single()

  if (updateError?.message.includes('event_type')) {
    return {
      error:
        '반복 일정 저장을 위해 supabase/add-calendar-recurrence-v2.sql 마이그레이션을 실행해 주세요.',
    }
  }

  if (updateError || !updated) {
    return { error: updateError?.message ?? '반복 일정 변환에 실패했습니다.' }
  }

  masterId = updated.id

  await supabase
    .from('lessons')
    .delete()
    .eq('recurring_master_id', masterId)

  revalidateCalendarPaths()

  const { deletedIds: purgedIds } = await syncAndPurgeStoredLessonsForRecurringSlot(
    supabase,
    slotMatchTarget,
    scope,
    anchorDate,
    {
      instructor_id: slotTarget.instructor_id,
      lesson_type: resolvedLessonType,
      recurrence_pattern: pattern,
      recurrence_group_id: recurrenceGroupId,
    },
    {
      keepIds: [masterId],
      recurrenceGroupId: recurrenceGroupId,
    },
  )

  const deletedIds = [
    ...duplicateDeleteIds,
    ...orphanMasterIds,
    ...purgedIds,
    ...(virtual && virtual.masterId !== masterId ? [lessonId] : []),
  ]

  return {
    data: [updated as Lesson],
    deletedIds,
  }
}
