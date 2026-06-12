import type { Member } from '@/lib/types'
import { formatPrimaryInstructorName, getMemberAge } from '@/lib/member-utils'
import {
  filterLessonsUpToNow,
  getTodayDateKey,
} from '@/lib/lesson-record-utils'

export type MemberListOrderBy =
  | 'recent_lesson'
  | 'age'
  | 'sport'
  | 'instructor'
  | 'name'
  | 'created_at'
  | 'deleted_at'

export type MemberListSortField = 'recent_lesson' | 'age' | 'sport' | 'instructor'

export const DEFAULT_MEMBER_LIST_SORT: {
  field: MemberListSortField
  asc: boolean
} = {
  field: 'recent_lesson',
  asc: false,
}

export function memberListOrderByFromField(
  field: MemberListSortField,
): MemberListOrderBy {
  return field
}

export function sortFieldUsesMemorySort(field: MemberListOrderBy): boolean {
  return field === 'recent_lesson' || field === 'instructor' || field === 'age'
}

export function lessonOccurredSortKey(lesson: {
  lesson_date: string
  start_time?: string | null
}): string {
  const time = lesson.start_time?.slice(0, 5) ?? '00:00'
  return `${lesson.lesson_date}T${time}`
}

export async function fetchLastLessonDateByMember(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  memberIds: string[],
  asOf: Date = new Date(),
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (memberIds.length === 0) return map

  const todayKey = getTodayDateKey(asOf)
  const { data } = await supabase
    .from('lessons')
    .select('member_id, lesson_date, start_time')
    .in('member_id', memberIds)
    .lte('lesson_date', todayKey)

  const occurred = filterLessonsUpToNow(data ?? [], asOf)

  for (const row of occurred) {
    if (!row.member_id) continue
    const sortKey = lessonOccurredSortKey(row)
    const prev = map.get(row.member_id)
    if (!prev || sortKey > prev) {
      map.set(row.member_id, sortKey)
    }
  }

  return map
}

function instructorSortLabel(
  member: Member & { primary_instructor?: { id: string; name: string } | null },
): string {
  return formatPrimaryInstructorName(member.primary_instructor)
}

export async function sortMembersForList<
  T extends Member & { primary_instructor?: { id: string; name: string } | null },
>(
  members: T[],
  orderBy: MemberListOrderBy,
  orderAsc: boolean,
  lastLessonByMember: Map<string, string>,
): Promise<T[]> {
  const dir = orderAsc ? 1 : -1

  return [...members].sort((a, b) => {
    switch (orderBy) {
      case 'recent_lesson': {
        const da = lastLessonByMember.get(a.id) ?? ''
        const db = lastLessonByMember.get(b.id) ?? ''
        if (!da && !db) return a.name.localeCompare(b.name, 'ko') * dir
        if (!da) return 1
        if (!db) return -1
        const cmp = da.localeCompare(db)
        return cmp !== 0 ? cmp * dir : a.name.localeCompare(b.name, 'ko')
      }
      case 'age': {
        const ageA = getMemberAge(a) ?? -1
        const ageB = getMemberAge(b) ?? -1
        if (ageA !== ageB) return (ageA - ageB) * dir
        return a.name.localeCompare(b.name, 'ko')
      }
      case 'sport': {
        const sportA = a.sport?.trim() || '힣'
        const sportB = b.sport?.trim() || '힣'
        const cmp = sportA.localeCompare(sportB, 'ko')
        return cmp !== 0 ? cmp * dir : a.name.localeCompare(b.name, 'ko')
      }
      case 'instructor': {
        const cmp = instructorSortLabel(a).localeCompare(instructorSortLabel(b), 'ko')
        return cmp !== 0 ? cmp * dir : a.name.localeCompare(b.name, 'ko')
      }
      default:
        return a.name.localeCompare(b.name, 'ko') * dir
    }
  })
}
