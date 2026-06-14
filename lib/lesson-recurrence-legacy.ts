import {
  type LessonRecurrencePattern,
  parseLessonRecurrencePattern,
} from '@/lib/lesson-recurrence'
import { getDay, parseISO } from 'date-fns'

export const LESSON_RECURRENCE_NOTE_PREFIX = '__cal_recurrence__:'

export type LessonRecurrenceMeta = {
  groupId: string
  pattern: LessonRecurrencePattern
}

export function stripRecurrenceFromSpecialNote(
  specialNote: string | null | undefined,
): string {
  if (!specialNote) return ''
  return specialNote
    .split('\n')
    .filter((line) => !line.startsWith(LESSON_RECURRENCE_NOTE_PREFIX))
    .join('\n')
    .trim()
}

export function encodeRecurrenceInSpecialNote(
  specialNote: string | null | undefined,
  meta: LessonRecurrenceMeta,
): string {
  const base = stripRecurrenceFromSpecialNote(specialNote)
  const payload = `${LESSON_RECURRENCE_NOTE_PREFIX}${JSON.stringify(meta)}`
  return base ? `${base}\n${payload}` : payload
}

export function parseRecurrenceFromSpecialNote(
  specialNote: string | null | undefined,
): LessonRecurrenceMeta | null {
  if (!specialNote?.includes(LESSON_RECURRENCE_NOTE_PREFIX)) return null
  const line = specialNote
    .split('\n')
    .find((item) => item.startsWith(LESSON_RECURRENCE_NOTE_PREFIX))
  if (!line) return null
  try {
    const parsed = JSON.parse(
      line.slice(LESSON_RECURRENCE_NOTE_PREFIX.length),
    ) as LessonRecurrenceMeta
    if (!parsed?.groupId || !parsed?.pattern) return null
    return parsed
  } catch {
    return null
  }
}

export function resolveLessonRecurrence(lesson: {
  recurrence_group_id?: string | null
  recurrence_pattern?: string | null
  special_note?: string | null
}): { groupId: string | null; pattern: LessonRecurrencePattern } {
  if (lesson.recurrence_group_id) {
    return {
      groupId: lesson.recurrence_group_id,
      pattern: parseLessonRecurrencePattern(lesson.recurrence_pattern),
    }
  }

  const legacy = parseRecurrenceFromSpecialNote(lesson.special_note)
  if (legacy) {
    return {
      groupId: legacy.groupId,
      pattern: legacy.pattern,
    }
  }

  return { groupId: null, pattern: 'none' }
}

/** 반복 일정 묶음 키 — 종료 시각은 날짜별로 달라질 수 있어 제외 */
export function buildLessonSlotKey(lesson: {
  member_id?: string | null
  instructor_id?: string | null
  start_time?: string | null
  title?: string | null
}) {
  return [
    lesson.member_id ?? '',
    lesson.title?.trim() ?? '',
    lesson.instructor_id ?? '',
    lesson.start_time?.slice(0, 5) ?? '',
  ].join('|')
}

export function filterLessonsBySlotKey<
  T extends {
    member_id?: string | null
    instructor_id?: string | null
    start_time?: string | null
    title?: string | null
  },
>(target: T, candidates: T[]): T[] {
  const slotKey = buildLessonSlotKey(target)
  return candidates.filter((lesson) => buildLessonSlotKey(lesson) === slotKey)
}

/** 이후 모두 삭제용 — 회원·시작 시각 기준 (강사 변경·종료 시각 차이 무시) */
export function buildLessonSeriesDeleteKey(lesson: {
  member_id?: string | null
  instructor_id?: string | null
  start_time?: string | null
  title?: string | null
}) {
  if (lesson.member_id) {
    return `m:${lesson.member_id}|${lesson.start_time?.slice(0, 5) ?? ''}`
  }
  return [
    't',
    lesson.title?.trim() ?? '',
    lesson.instructor_id ?? '',
    lesson.start_time?.slice(0, 5) ?? '',
  ].join(':')
}

export function filterLessonsBySeriesDeleteKey<
  T extends {
    member_id?: string | null
    instructor_id?: string | null
    start_time?: string | null
    title?: string | null
  },
>(target: T, candidates: T[]): T[] {
  const key = buildLessonSeriesDeleteKey(target)
  return candidates.filter(
    (lesson) => buildLessonSeriesDeleteKey(lesson) === key,
  )
}

function getLessonWeekday(lessonDate: string) {
  return getDay(parseISO(lessonDate))
}

/** 반복 슬롯 매칭 — 강사 변경과 무관하게 같은 회원/제목·요일·시작 시각 */
export function buildRecurringSlotMatchKey(lesson: {
  member_id?: string | null
  title?: string | null
  start_time?: string | null
}) {
  if (lesson.member_id) {
    return `m:${lesson.member_id}|${(lesson.start_time ?? '').slice(0, 5)}`
  }
  return `t:${lesson.title?.trim() ?? ''}|${(lesson.start_time ?? '').slice(0, 5)}`
}

export function filterLessonsByRecurringSlotMatch<
  T extends {
    lesson_date: string
    member_id?: string | null
    title?: string | null
    start_time?: string | null
  },
>(target: T, candidates: T[]): T[] {
  const weekday = getLessonWeekday(target.lesson_date)
  const key = buildRecurringSlotMatchKey(target)
  return candidates.filter(
    (lesson) =>
      buildRecurringSlotMatchKey(lesson) === key &&
      getLessonWeekday(lesson.lesson_date) === weekday,
  )
}

/** 반복 삭제·수정 범위 — 같은 회원(또는 제목)·같은 요일·같은 시작 시각 */
export function filterLessonsByRecurringSlot<
  T extends {
    lesson_date: string
    member_id?: string | null
    instructor_id?: string | null
    start_time?: string | null
    title?: string | null
  },
>(target: T, candidates: T[]): T[] {
  const weekday = getLessonWeekday(target.lesson_date)
  return filterLessonsBySeriesDeleteKey(target, candidates).filter(
    (lesson) => getLessonWeekday(lesson.lesson_date) === weekday,
  )
}

type LessonSeriesRow = {
  id: string
  lesson_date: string
  member_id?: string | null
  instructor_id?: string | null
  start_time?: string | null
  end_time?: string | null
  title?: string | null
  special_note?: string | null
  recurrence_group_id?: string | null
  recurrence_pattern?: string | null
}

function diffDays(a: string, b: string) {
  const ms = new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

/** DB 메타 없을 때 같은 시간대 반복 일정 추정 */
export function inferRecurrenceFromSlotLessons(
  target: LessonSeriesRow,
  candidates: LessonSeriesRow[],
): {
  groupId: string | null
  pattern: LessonRecurrencePattern
  siblingIds: string[]
  endDate: string | null
} | null {
  const siblings = filterLessonsByRecurringSlotMatch(target, candidates).sort((a, b) =>
    a.lesson_date.localeCompare(b.lesson_date),
  )
  const slotKey = buildLessonSlotKey(target)

  const uniqueByDate = [
    ...new Map(siblings.map((lesson) => [lesson.lesson_date, lesson])).values(),
  ].sort((a, b) => a.lesson_date.localeCompare(b.lesson_date))

  if (uniqueByDate.length < 2) return null

  const intervals = uniqueByDate
    .slice(1)
    .map((lesson, index) =>
      diffDays(uniqueByDate[index].lesson_date, lesson.lesson_date),
    )

  const allDaily = intervals.every((gap) => gap === 1)
  const allEveryOther = intervals.every((gap) => gap === 2)
  const allWeekly = intervals.every((gap) => gap === 7)
  const allBiweekly = intervals.every((gap) => gap === 14)

  let pattern: LessonRecurrencePattern | null = null
  if (allDaily) pattern = 'daily'
  else if (allEveryOther) pattern = 'every_other_day'
  else if (allWeekly) pattern = 'weekly'
  else if (allBiweekly) pattern = 'biweekly'

  if (!pattern) return null

  return {
    groupId: `slot:${slotKey}`,
    pattern,
    siblingIds: siblings.map((lesson) => lesson.id),
    endDate: siblings[siblings.length - 1]?.lesson_date ?? null,
  }
}

export function enrichLessonRecurrenceFields<
  T extends {
    recurrence_group_id?: string | null
    recurrence_pattern?: string | null
    special_note?: string | null
  },
>(lesson: T): T & {
  recurrence_group_id: string | null
  recurrence_pattern: string | null
} {
  const resolved = resolveLessonRecurrence(lesson)
  return {
    ...lesson,
    recurrence_group_id: resolved.groupId,
    recurrence_pattern:
      resolved.pattern === 'none' ? null : resolved.pattern,
  }
}
