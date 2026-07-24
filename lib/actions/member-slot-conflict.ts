import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchExpandedCalendarLessons } from '@/lib/actions/calendar-lessons-range'
import { findMemberSlotRowIds } from '@/lib/lesson-slot-utils'
import { mergeCalendarLessonsForRange } from '@/lib/calendar-recurrence/expand-lessons'
import type { RecurrenceCapableLesson } from '@/lib/calendar-recurrence/types'
import { isVirtualLessonId, parseVirtualLessonId } from '@/lib/calendar-recurrence/types'
import { enrichLessonRecurrenceFields } from '@/lib/lesson-recurrence-legacy'
import {
  LESSON_CALENDAR_SELECT,
  LESSON_CALENDAR_SELECT_LEGACY,
} from '@/lib/supabase-selects'

function slotStartKey(startTime?: string | null) {
  return startTime?.slice(0, 5) ?? ''
}

function isExcludedLessonId(id: string, exclude: Set<string>) {
  if (exclude.has(id)) return true
  const virtual = parseVirtualLessonId(id)
  if (virtual && exclude.has(virtual.masterId)) return true
  return false
}

/**
 * 생성/수정용 빠른 슬롯 충돌 — 해당 회원·날짜만 조회.
 * (기존 fetchExpandedCalendarLessons 전체 펼침보다 훨씬 가벼움)
 */
export async function findFastMemberSlotConflict(
  supabase: SupabaseClient,
  params: {
    lessonDate: string
    startTime?: string | null
    memberId: string
    excludeLessonIds?: string[]
  },
): Promise<{ id: string } | null> {
  const exclude = new Set(params.excludeLessonIds ?? [])
  const startKey = slotStartKey(params.startTime)

  const { data: storedRows, error: storedError } = await supabase
    .from('lessons')
    .select('id, start_time, event_type, attendance_status, event_status')
    .eq('lesson_date', params.lessonDate)
    .eq('member_id', params.memberId)
    .limit(80)

  if (!storedError && storedRows) {
    for (const row of storedRows) {
      if (row.event_type === 'recurring_master') continue
      if (row.attendance_status === 'cancelled') continue
      if (row.event_status === 'cancelled') continue
      if (slotStartKey(row.start_time) !== startKey) continue
      if (isExcludedLessonId(row.id, exclude)) continue
      return { id: row.id }
    }
  }

  let mastersQuery = await supabase
    .from('lessons')
    .select(LESSON_CALENDAR_SELECT)
    .eq('member_id', params.memberId)
    .eq('event_type', 'recurring_master')
    .lte('lesson_date', params.lessonDate)
    .limit(40)

  if (mastersQuery.error) {
    mastersQuery = await supabase
      .from('lessons')
      .select(LESSON_CALENDAR_SELECT_LEGACY)
      .eq('member_id', params.memberId)
      .lte('lesson_date', params.lessonDate)
      .limit(40)
  }

  const masters = ((mastersQuery.data ?? []) as RecurrenceCapableLesson[]).map(
    (row) => enrichLessonRecurrenceFields(row) as RecurrenceCapableLesson,
  )
  if (masters.length === 0) return null

  const expanded = mergeCalendarLessonsForRange(
    [],
    masters,
    [],
    params.lessonDate,
    params.lessonDate,
  )

  for (const lesson of expanded) {
    if (lesson.member_id !== params.memberId) continue
    if (slotStartKey(lesson.start_time) !== startKey) continue
    if (isExcludedLessonId(lesson.id, exclude)) continue
    return { id: lesson.id }
  }

  return null
}

/** 캘린더·수업현황에 실제로 보이는 슬롯만 충돌로 판단 (무거움 — 레거시/특수 경로용) */
export async function findDisplayableMemberSlotConflict(params: {
  lessonDate: string
  startTime?: string | null
  memberId: string
  excludeLessonIds?: string[]
}): Promise<{ id: string } | null> {
  const exclude = new Set(params.excludeLessonIds ?? [])
  const startKey = slotStartKey(params.startTime)

  const { lessons } = await fetchExpandedCalendarLessons(
    params.lessonDate,
    params.lessonDate,
    120,
  )

  for (const lesson of lessons) {
    if (lesson.member_id !== params.memberId) continue
    if (slotStartKey(lesson.start_time) !== startKey) continue
    if (isExcludedLessonId(lesson.id, exclude)) continue
    return { id: lesson.id }
  }

  return null
}

/** 화면에는 없지만 DB에만 남은 같은 슬롯 행 제거 */
export async function purgeOrphanMemberSlotRows(
  supabase: SupabaseClient,
  params: {
    lessonDate: string
    startTime?: string | null
    memberId: string
    excludeLessonIds?: string[]
  },
): Promise<string[]> {
  const displayConflict = await findFastMemberSlotConflict(supabase, params)
  if (displayConflict) return []

  const orphanIds = await findMemberSlotRowIds(supabase, params)
  if (orphanIds.length === 0) return []

  const { error } = await supabase.from('lessons').delete().in('id', orphanIds)
  if (error) {
    console.warn('purgeOrphanMemberSlotRows:', error.message)
    return []
  }

  return orphanIds
}

export function lessonIdMatchesSlotExclusion(id: string, exclude: Set<string>) {
  return isExcludedLessonId(id, exclude)
}

export { isVirtualLessonId }
