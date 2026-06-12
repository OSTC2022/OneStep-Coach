import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export type LessonSlotIdentity = {
  memberId: string | null
  title: string | null
  instructorId: string | null
  startTime: string | null
}

export type LessonSlotRow = {
  id: string
  lesson_date: string
  member_id?: string | null
  title?: string | null
  instructor_id?: string | null
  start_time?: string | null
  session_deducted?: boolean
  google_event_id?: string | null
}

const LESSON_SLOT_SELECT =
  'id, lesson_date, member_id, title, instructor_id, start_time, session_deducted, google_event_id'

export function buildLessonSlotDateKey(
  lessonDate: string,
  identity: LessonSlotIdentity,
): string {
  const startKey = identity.startTime?.slice(0, 5) ?? ''
  const instructorKey = identity.instructorId ?? ''
  if (identity.memberId) {
    return `${lessonDate}|m:${identity.memberId}|${instructorKey}|${startKey}`
  }
  if (identity.title) {
    return `${lessonDate}|t:${identity.title.trim()}|${instructorKey}|${startKey}`
  }
  return ''
}

/** 앱 반복 등록 — 강사·시간·회원(또는 제목) 모두 일치 */
export function matchesRecurrenceSlot(
  row: Pick<
    LessonSlotRow,
    'member_id' | 'title' | 'instructor_id' | 'start_time'
  >,
  identity: LessonSlotIdentity,
): boolean {
  const startKey = identity.startTime?.slice(0, 5) ?? ''
  const instructorKey = identity.instructorId ?? ''
  if ((row.instructor_id ?? '') !== instructorKey) return false
  if ((row.start_time?.slice(0, 5) ?? '') !== startKey) return false
  if (identity.memberId) return row.member_id === identity.memberId
  if (identity.title) {
    return !row.member_id && (row.title?.trim() ?? '') === identity.title.trim()
  }
  return false
}

/** 구글 캘린더 가져오기 — 같은 날·같은 회원·같은 시작 시간 (강사는 무시) */
export function matchesGoogleImportSlot(
  row: Pick<LessonSlotRow, 'member_id' | 'title' | 'start_time'>,
  identity: Pick<LessonSlotIdentity, 'memberId' | 'title' | 'startTime'>,
): boolean {
  const startKey = identity.startTime?.slice(0, 5) ?? ''
  if ((row.start_time?.slice(0, 5) ?? '') !== startKey) return false
  if (identity.memberId) return row.member_id === identity.memberId
  if (identity.title) {
    return !row.member_id && (row.title?.trim() ?? '') === identity.title.trim()
  }
  return false
}

export type LessonSlotLookupCandidate = {
  lessonDate: string
  memberId: string | null
  title: string
  startTime: string | null
}

export async function findExistingLessonsByDates(
  supabase: SupabaseClient,
  identity: LessonSlotIdentity,
  dates: string[],
): Promise<Map<string, string>> {
  const byDate = new Map<string, string>()
  if (dates.length === 0) return byDate
  if (!identity.memberId && !identity.title) return byDate

  let query = supabase
    .from('lessons')
    .select('id, lesson_date, member_id, title, instructor_id, start_time')
    .in('lesson_date', dates)

  if (identity.memberId) {
    query = query.eq('member_id', identity.memberId)
  } else {
    query = query.is('member_id', null).eq('title', identity.title!)
  }

  const { data, error } = await query
  if (error || !data) return byDate

  for (const row of data as LessonSlotRow[]) {
    if (!matchesRecurrenceSlot(row, identity)) continue
    if (!byDate.has(row.lesson_date)) {
      byDate.set(row.lesson_date, row.id)
    }
  }
  return byDate
}

export async function loadExistingLessonsBySlotKeys(
  supabase: SupabaseClient,
  candidates: LessonSlotLookupCandidate[],
): Promise<Map<string, LessonSlotRow>> {
  const map = new Map<string, LessonSlotRow>()
  if (candidates.length === 0) return map

  const dates = [...new Set(candidates.map((item) => item.lessonDate))]
  const memberIds = [
    ...new Set(candidates.map((item) => item.memberId).filter(Boolean)),
  ] as string[]
  const guestTitles = [
    ...new Set(
      candidates.filter((item) => !item.memberId && item.title).map((item) => item.title),
    ),
  ]

  const rows: LessonSlotRow[] = []

  if (memberIds.length > 0) {
    const { data, error } = await supabase
      .from('lessons')
      .select(LESSON_SLOT_SELECT)
      .in('lesson_date', dates)
      .in('member_id', memberIds)
    if (!error && data) rows.push(...(data as LessonSlotRow[]))
  }

  if (guestTitles.length > 0) {
    const { data, error } = await supabase
      .from('lessons')
      .select(LESSON_SLOT_SELECT)
      .in('lesson_date', dates)
      .is('member_id', null)
      .in('title', guestTitles)
    if (!error && data) rows.push(...(data as LessonSlotRow[]))
  }

  for (const candidate of candidates) {
    const identity = {
      memberId: candidate.memberId,
      title: candidate.memberId ? null : candidate.title,
      startTime: candidate.startTime,
    }
    const key = buildLessonSlotDateKey(candidate.lessonDate, {
      ...identity,
      instructorId: null,
    })
    if (!key || map.has(key)) continue

    for (const row of rows) {
      if (row.lesson_date !== candidate.lessonDate) continue
      if (!matchesGoogleImportSlot(row, identity)) continue
      map.set(key, row)
      break
    }
  }

  return map
}

/** Google 반복 시리즈 ID → UUID 형식 recurrence_group_id */
export function googleRecurrenceGroupId(recurringEventId: string): string {
  const hash = createHash('sha256')
    .update(`google-cal-recurrence:${recurringEventId}`)
    .digest('hex')
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${['8', '9', 'a', 'b'][parseInt(hash.slice(16, 17), 16) % 4]}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-')
}
