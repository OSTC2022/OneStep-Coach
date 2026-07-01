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

const MEMBER_LESSON_LOOKUP_BATCH = 25
/** 회원별 최근 N건 — 오늘 미래 시간대 수업 제외 후에도 최신 1건 확보 */
const RECENT_LESSONS_PER_MEMBER = 5

async function fetchLastLessonSortKeyForMember(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  memberId: string,
  todayKey: string,
  asOf: Date,
): Promise<string | null> {
  const { data } = await supabase
    .from('lessons')
    .select('member_id, lesson_date, start_time')
    .eq('member_id', memberId)
    .lte('lesson_date', todayKey)
    .order('lesson_date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(RECENT_LESSONS_PER_MEMBER)

  const occurred = filterLessonsUpToNow(data ?? [], asOf)
  if (occurred.length === 0) return null

  let best = ''
  for (const row of occurred) {
    const sortKey = lessonOccurredSortKey(row)
    if (sortKey > best) best = sortKey
  }
  return best || null
}

export async function fetchLastLessonDateByMember(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  memberIds: string[],
  asOf: Date = new Date(),
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (memberIds.length === 0) return map

  const todayKey = getTodayDateKey(asOf)

  for (let i = 0; i < memberIds.length; i += MEMBER_LESSON_LOOKUP_BATCH) {
    const batch = memberIds.slice(i, i + MEMBER_LESSON_LOOKUP_BATCH)
    const results = await Promise.all(
      batch.map((memberId) =>
        fetchLastLessonSortKeyForMember(supabase, memberId, todayKey, asOf),
      ),
    )
    for (let j = 0; j < batch.length; j += 1) {
      const sortKey = results[j]
      if (sortKey) map.set(batch[j], sortKey)
    }
  }

  return map
}

function instructorSortLabel(
  member: Member & { primary_instructor?: { id: string; name: string } | null },
): string {
  return formatPrimaryInstructorName(member.primary_instructor)
}

function memberCreatedSortKey(member: Member): string {
  return member.created_at ?? member.registered_at ?? ''
}

function parseRegisteredAtMs(member: Member): number {
  const raw = memberCreatedSortKey(member)
  if (!raw) return 0
  const ms = new Date(raw).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function parseLessonSortKeyMs(sortKey: string): number {
  if (!sortKey) return 0
  const normalized =
    sortKey.length === 16 && sortKey.includes('T') ? `${sortKey}:00` : sortKey
  const ms = new Date(normalized).getTime()
  return Number.isFinite(ms) ? ms : 0
}

/** 가입·최근 수업 중 더 최근 시각 — 목록 상단 정렬용 */
export function memberLastActivityMs(
  member: Member,
  lastLessonKey?: string,
): number {
  return Math.max(parseRegisteredAtMs(member), parseLessonSortKeyMs(lastLessonKey ?? ''))
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
        const actA = memberLastActivityMs(a, lastLessonByMember.get(a.id))
        const actB = memberLastActivityMs(b, lastLessonByMember.get(b.id))
        if (actA !== actB) return (actA - actB) * dir
        return a.name.localeCompare(b.name, 'ko')
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
