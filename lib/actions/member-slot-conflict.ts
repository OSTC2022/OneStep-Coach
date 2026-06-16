import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchExpandedCalendarLessons } from '@/lib/actions/calendar-lessons-range'
import { findMemberSlotRowIds } from '@/lib/lesson-slot-utils'
import { isVirtualLessonId, parseVirtualLessonId } from '@/lib/calendar-recurrence/types'

function slotStartKey(startTime?: string | null) {
  return startTime?.slice(0, 5) ?? ''
}

function isExcludedLessonId(id: string, exclude: Set<string>) {
  if (exclude.has(id)) return true
  const virtual = parseVirtualLessonId(id)
  if (virtual && exclude.has(virtual.masterId)) return true
  return false
}

/** 캘린더·수업현황에 실제로 보이는 슬롯만 충돌로 판단 */
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
  const displayConflict = await findDisplayableMemberSlotConflict(params)
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
