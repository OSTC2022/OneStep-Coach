import type { SupabaseClient } from '@supabase/supabase-js'
import type { LessonSeriesScope } from '@/lib/actions/lessons'
import { filterLessonsByRecurringSlotMatch } from '@/lib/lesson-recurrence-legacy'

type SlotTarget = {
  lesson_date: string
  member_id?: string | null
  title?: string | null
  instructor_id?: string | null
  start_time?: string | null
  end_time?: string | null
}

type StoredRow = {
  id: string
  lesson_date: string
  event_type?: string | null
  session_deducted?: boolean
}

function filterRowsByScope<T extends { lesson_date: string }>(
  rows: T[],
  scope: LessonSeriesScope,
  anchorDate: string,
): T[] {
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
  supabase: SupabaseClient,
  slotTarget: SlotTarget,
): Promise<StoredRow[]> {
  if (slotTarget.member_id) {
    const { data } = await supabase
      .from('lessons')
      .select('id, lesson_date, event_type, session_deducted, member_id, title, instructor_id, start_time, end_time')
      .eq('member_id', slotTarget.member_id)
    return (data ?? []) as StoredRow[]
  }

  if (slotTarget.title) {
    const { data } = await supabase
      .from('lessons')
      .select('id, lesson_date, event_type, session_deducted, member_id, title, instructor_id, start_time, end_time')
      .eq('title', slotTarget.title)
      .is('member_id', null)
    return (data ?? []) as StoredRow[]
  }

  return []
}

async function bulkDeleteByIds(supabase: SupabaseClient, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return

  const chunkSize = 100
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const { error } = await supabase.from('lessons').delete().in('id', chunk)
    if (error) throw new Error(error.message)
  }
}

function collectMatchingStoredRows(
  supabase: SupabaseClient,
  slotTarget: SlotTarget,
  scope: LessonSeriesScope,
  anchorDate: string,
  options?: {
    keepIds?: string[]
    recurrenceGroupId?: string | null
  },
) {
  return fetchSlotCandidates(supabase, slotTarget).then(async (candidates) => {
    const matching = filterLessonsByRecurringSlotMatch(slotTarget, candidates)
    const inScope = filterRowsByScope(matching, scope, anchorDate)
    const keep = new Set(options?.keepIds ?? [])
    const rows = new Map<string, StoredRow>()

    for (const row of inScope) {
      if (keep.has(row.id)) continue
      if (row.event_type === 'recurring_master') continue
      rows.set(row.id, row)
    }

    if (options?.recurrenceGroupId) {
      const { data: groupRows } = await supabase
        .from('lessons')
        .select('id, lesson_date, event_type, session_deducted')
        .eq('recurrence_group_id', options.recurrenceGroupId)
        .neq('event_type', 'recurring_master')

      for (const row of groupRows ?? []) {
        if (keep.has(row.id)) continue
        if (scope === 'single' && row.lesson_date !== anchorDate) continue
        if (scope === 'future' && row.lesson_date < anchorDate) continue
        rows.set(row.id, row as StoredRow)
      }
    }

    return [...rows.values()]
  })
}

/** 출석·차감된 stored 행 등 purge 대상이 아닌 sibling에도 강사·수업유형 반영 */
export async function syncStoredLessonFieldsForRecurringSlot(
  supabase: SupabaseClient,
  slotTarget: SlotTarget,
  scope: LessonSeriesScope,
  anchorDate: string,
  fields: {
    instructor_id?: string | null
    lesson_type?: string
    recurrence_pattern?: string
    recurrence_group_id?: string | null
  },
  options?: {
    keepIds?: string[]
    recurrenceGroupId?: string | null
  },
): Promise<string[]> {
  const rows = await collectMatchingStoredRows(
    supabase,
    slotTarget,
    scope,
    anchorDate,
    options,
  )

  const payload: Record<string, unknown> = {}
  if ('instructor_id' in fields) payload.instructor_id = fields.instructor_id
  if (fields.lesson_type) payload.lesson_type = fields.lesson_type
  if (fields.recurrence_pattern) payload.recurrence_pattern = fields.recurrence_pattern
  if (fields.recurrence_group_id) payload.recurrence_group_id = fields.recurrence_group_id

  if (!Object.keys(payload).length || !rows.length) return []

  const updatedIds: string[] = []
  for (const row of rows) {
    const { error } = await supabase.from('lessons').update(payload).eq('id', row.id)
    if (error) throw new Error(error.message)
    updatedIds.push(row.id)
  }
  return updatedIds
}

/** 반복 master 확장을 가리는 stored(single/materialized/exception) 행 제거 */
export async function purgeStoredLessonsForRecurringSlot(
  supabase: SupabaseClient,
  slotTarget: SlotTarget,
  scope: LessonSeriesScope,
  anchorDate: string,
  options?: {
    keepIds?: string[]
    recurrenceGroupId?: string | null
  },
): Promise<string[]> {
  const rows = await collectMatchingStoredRows(
    supabase,
    slotTarget,
    scope,
    anchorDate,
    options,
  )

  const deleteIds = rows
    .filter((row) => !row.session_deducted)
    .map((row) => row.id)

  if (deleteIds.length) {
    await bulkDeleteByIds(supabase, deleteIds)
  }
  return deleteIds
}

export async function syncAndPurgeStoredLessonsForRecurringSlot(
  supabase: SupabaseClient,
  slotTarget: SlotTarget,
  scope: LessonSeriesScope,
  anchorDate: string,
  fields: {
    instructor_id?: string | null
    lesson_type?: string
    recurrence_pattern?: string
    recurrence_group_id?: string | null
  },
  options?: {
    keepIds?: string[]
    recurrenceGroupId?: string | null
  },
): Promise<{ syncedIds: string[]; deletedIds: string[] }> {
  const syncedIds = await syncStoredLessonFieldsForRecurringSlot(
    supabase,
    slotTarget,
    scope,
    anchorDate,
    fields,
    options,
  )
  const deletedIds = await purgeStoredLessonsForRecurringSlot(
    supabase,
    slotTarget,
    scope,
    anchorDate,
    options,
  )
  return { syncedIds, deletedIds }
}
