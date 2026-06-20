import { resolveLessonTitle } from '@/lib/calendar-utils'
import {
  isAttendanceMarked,
  isLessonCountedAsMemberAttendance,
  type LessonAttendanceRow,
} from '@/lib/lesson-record-utils'

export type LessonSlotDedupeRow = LessonAttendanceRow & {
  id?: string
  member_id?: string | null
  title?: string | null
  content?: string | null
  event_status?: string | null
  event_type?: string | null
  created_at?: string | null
}

/** 같은 날·시간·회원(또는 제목) 슬롯 키 */
export function getLessonSlotDedupeKey(
  lesson: Pick<
    LessonSlotDedupeRow,
    'id' | 'lesson_date' | 'start_time' | 'member_id' | 'title' | 'content'
  >,
): string | null {
  const time = (lesson.start_time ?? '').slice(0, 5)
  if (lesson.member_id) {
    return `${lesson.lesson_date}|${time}|m:${lesson.member_id}`
  }
  const title = resolveLessonTitle(lesson)
  if (title) {
    return `${lesson.lesson_date}|${time}|t:${title}`
  }
  return lesson.id ? `${lesson.lesson_date}|${time}|id:${lesson.id}` : null
}

/**
 * 삭제·수정 후 남은 stale 행보다 실제 출석·종료가 반영된 행을 우선합니다.
 */
export function scoreLessonForSlotDedupe(lesson: LessonSlotDedupeRow): number {
  let score = 0

  if (lesson.event_status === 'cancelled' || lesson.attendance_status === 'cancelled') {
    score -= 1000
  }
  if (lesson.event_type === 'recurring_master') {
    score -= 500
  }

  if (lesson.member_id && isLessonCountedAsMemberAttendance(lesson)) {
    score += 200
  } else if (isAttendanceMarked(lesson)) {
    score += 120
  }

  if (lesson.session_deducted) score += 80
  if (lesson.event_type === 'exception') score += 60
  if (lesson.event_type === 'materialized') score += 40
  if (lesson.end_time) score += 20

  if (lesson.created_at) {
    const ts = new Date(lesson.created_at).getTime()
    if (!Number.isNaN(ts)) score += ts / 1e15
  }

  return score
}

/** 같은 슬롯에 회원·시간이 겹치는 중복 수업 제거 */
export function dedupeLessonsBySlot<T extends LessonSlotDedupeRow>(lessons: T[]): T[] {
  const map = new Map<string, T>()

  for (const lesson of lessons) {
    const key = getLessonSlotDedupeKey(lesson)
    if (!key) continue
    const existing = map.get(key)
    if (!existing || scoreLessonForSlotDedupe(lesson) > scoreLessonForSlotDedupe(existing)) {
      map.set(key, lesson)
    }
  }

  return Array.from(map.values())
}
