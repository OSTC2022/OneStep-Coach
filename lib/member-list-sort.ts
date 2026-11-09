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

/** 한 번에 .in()으로 묶을 회원 수 */
const MEMBER_LESSON_LOOKUP_BATCH = 60
/** 회원당 후보 수업 수 (미래 슬롯 제외 후에도 1건 확보) */
const RECENT_LESSONS_PER_MEMBER = 4

type LessonRow = {
  member_id: string | null
  lesson_date: string
  start_time?: string | null
}

/**
 * 회원별 최근 수업일.
 * 예전: 회원마다 개별 쿼리(N+1) → 지금: .in() 배치 1회 + 필요 시 소수만 보완.
 */
export async function fetchLastLessonDateByMember(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  memberIds: string[],
  asOf: Date = new Date(),
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (memberIds.length === 0) return map

  const todayKey = getTodayDateKey(asOf)
  const uniqueIds = [...new Set(memberIds.filter(Boolean))]

  for (let i = 0; i < uniqueIds.length; i += MEMBER_LESSON_LOOKUP_BATCH) {
    const batch = uniqueIds.slice(i, i + MEMBER_LESSON_LOOKUP_BATCH)
    const fetchLimit = Math.min(2500, batch.length * RECENT_LESSONS_PER_MEMBER * 3)

    const { data } = await supabase
      .from('lessons')
      .select('member_id, lesson_date, start_time')
      .in('member_id', batch)
      .lte('lesson_date', todayKey)
      .order('lesson_date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(fetchLimit)

    const rowsByMember = new Map<string, LessonRow[]>()
    for (const row of (data ?? []) as LessonRow[]) {
      if (!row.member_id) continue
      const list = rowsByMember.get(row.member_id)
      if (list) {
        if (list.length < RECENT_LESSONS_PER_MEMBER) list.push(row)
      } else {
        rowsByMember.set(row.member_id, [row])
      }
    }

    // 배치에 안 잡힌 회원만 소수 개별 보완
    const missing = batch.filter((id) => !rowsByMember.has(id))
    if (missing.length > 0 && missing.length <= 20) {
      await Promise.all(
        missing.map(async (memberId) => {
          const { data: fallback } = await supabase
            .from('lessons')
            .select('member_id, lesson_date, start_time')
            .eq('member_id', memberId)
            .lte('lesson_date', todayKey)
            .order('lesson_date', { ascending: false })
            .order('start_time', { ascending: false })
            .limit(RECENT_LESSONS_PER_MEMBER)
          if (fallback?.length) {
            rowsByMember.set(memberId, fallback as LessonRow[])
          }
        }),
      )
    }

    for (const [memberId, rows] of rowsByMember) {
      const occurred = filterLessonsUpToNow(rows, asOf)
      if (occurred.length === 0) continue
      let best = ''
      for (const row of occurred) {
        const sortKey = lessonOccurredSortKey(row)
        if (sortKey > best) best = sortKey
      }
      if (best) map.set(memberId, best)
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
