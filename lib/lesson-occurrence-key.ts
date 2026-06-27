import {
  parseVirtualLessonId,
  type RecurrenceCapableLesson,
} from '@/lib/calendar-recurrence/types'
import { resolveLessonTitle } from '@/lib/calendar-utils'
import type { Lesson } from '@/lib/types'

export const DEFAULT_CENTER_ID = 'default'

export type LessonOccurrenceKeyInput = Pick<
  Lesson,
  | 'id'
  | 'member_id'
  | 'lesson_date'
  | 'start_time'
  | 'title'
  | 'content'
  | 'google_recurring_event_id'
  | 'google_event_id'
  | 'recurring_master_id'
  | 'original_start_time'
>

const KST_OFFSET = '+09:00'

function normalizeStartTime(time?: string | null): string {
  return (time ?? '00:00').slice(0, 5)
}

/** Google exception·가상 일정과 동일한 UTC ISO (Asia/Seoul 기준) */
export function formatLessonOriginalStartIso(
  lessonDate: string,
  startTime?: string | null,
): string {
  const time = normalizeStartTime(startTime)
  const hhmmss = time.length === 5 ? `${time}:00` : time
  return new Date(`${lessonDate}T${hhmmss}${KST_OFFSET}`).toISOString()
}

function normalizeOriginalStartTime(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

/** Google 반복·가상 일정 우선, 없으면 날짜·시간·제목 슬롯 키 */
export function buildLessonOccurrenceKey(
  lesson: LessonOccurrenceKeyInput,
  centerId = DEFAULT_CENTER_ID,
): string | null {
  const memberId = lesson.member_id
  if (!memberId) return null

  const virtual = lesson.id ? parseVirtualLessonId(lesson.id) : null
  const lessonDate = virtual?.occurrenceDate ?? lesson.lesson_date
  const startTime = lesson.start_time

  const googleRecurringEventId =
    lesson.google_recurring_event_id ??
    (lesson.recurring_master_id ? null : null)

  const masterId =
    lesson.recurring_master_id ??
    virtual?.masterId ??
    null

  if (googleRecurringEventId) {
    const original =
      normalizeOriginalStartTime(lesson.original_start_time) ??
      formatLessonOriginalStartIso(lessonDate, startTime)
    return `${centerId}|m:${memberId}|gr:${googleRecurringEventId}|${original}`
  }

  if (masterId) {
    const original =
      normalizeOriginalStartTime(lesson.original_start_time) ??
      formatLessonOriginalStartIso(lessonDate, startTime)
    return `${centerId}|m:${memberId}|rm:${masterId}|${original}`
  }

  const title = resolveLessonTitle(lesson) || lesson.id || 'lesson'
  const start = normalizeStartTime(startTime)
  return `${centerId}|m:${memberId}|slot:${lessonDate}|${start}|${title}`
}

export function lessonToOccurrenceKeyInput(
  lesson: RecurrenceCapableLesson | Lesson,
): LessonOccurrenceKeyInput {
  return {
    id: lesson.id,
    member_id: lesson.member_id ?? null,
    lesson_date: lesson.lesson_date,
    start_time: lesson.start_time ?? null,
    title: lesson.title ?? null,
    content: lesson.content ?? null,
    google_recurring_event_id:
      (lesson as Lesson).google_recurring_event_id ?? null,
    google_event_id: (lesson as Lesson).google_event_id ?? null,
    recurring_master_id: lesson.recurring_master_id ?? null,
    original_start_time: lesson.original_start_time ?? null,
  }
}
