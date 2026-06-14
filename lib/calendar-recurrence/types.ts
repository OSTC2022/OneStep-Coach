import type { LessonRecurrencePattern } from '@/lib/lesson-recurrence'

export type CalendarEventType =
  | 'single'
  | 'recurring_master'
  | 'exception'
  | 'materialized'

export type CalendarEventStatus = 'confirmed' | 'cancelled'

/** Expanded occurrence id: virt:{masterId}:{yyyy-MM-dd} */
export const VIRTUAL_LESSON_ID_PREFIX = 'virt:'

export type RecurrenceCapableLesson = {
  id: string
  lesson_date: string
  start_time?: string | null
  end_time?: string | null
  member_id?: string | null
  instructor_id?: string | null
  title?: string | null
  lesson_type?: string
  event_type?: CalendarEventType | null
  recurrence?: string[] | null
  recurrence_pattern?: string | null
  recurrence_group_id?: string | null
  recurring_master_id?: string | null
  original_start_time?: string | null
  event_status?: CalendarEventStatus | null
  attendance_status?: string
  google_event_id?: string | null
  google_recurring_event_id?: string | null
  [key: string]: unknown
}

export function isVirtualLessonId(id: string): boolean {
  return id.startsWith(VIRTUAL_LESSON_ID_PREFIX)
}

export function parseVirtualLessonId(id: string): {
  masterId: string
  occurrenceDate: string
} | null {
  if (!isVirtualLessonId(id)) return null
  const rest = id.slice(VIRTUAL_LESSON_ID_PREFIX.length)
  const sep = rest.lastIndexOf(':')
  if (sep <= 0) return null
  return {
    masterId: rest.slice(0, sep),
    occurrenceDate: rest.slice(sep + 1),
  }
}

export function buildVirtualLessonId(masterId: string, occurrenceDate: string): string {
  return `${VIRTUAL_LESSON_ID_PREFIX}${masterId}:${occurrenceDate}`
}

export function isPersistedRecurringLesson(lesson: {
  id: string
  recurrence_group_id?: string | null
  recurrence_pattern?: string | null
  event_type?: string | null
}): boolean {
  if (isVirtualLessonId(lesson.id)) return true
  if (lesson.event_type === 'recurring_master') return true
  if (lesson.event_type === 'exception') return true
  const groupId = lesson.recurrence_group_id
  const pattern = lesson.recurrence_pattern
  return Boolean(groupId && !groupId.startsWith('slot:') && pattern && pattern !== 'none')
}

export function isRecurringMaster(
  lesson: Pick<RecurrenceCapableLesson, 'event_type'>,
): boolean {
  return lesson.event_type === 'recurring_master'
}

export function isDisplayStoredLesson(
  lesson: Pick<RecurrenceCapableLesson, 'event_type'>,
): boolean {
  const type = lesson.event_type ?? 'single'
  return type === 'single' || type === 'materialized' || type === 'exception'
}

export function patternToRRuleLines(
  pattern: LessonRecurrencePattern,
  startDate: string,
): string[] {
  switch (pattern) {
    case 'daily':
      return [`RRULE:FREQ=DAILY`]
    case 'every_other_day':
      return [`RRULE:FREQ=DAILY;INTERVAL=2`]
    case 'weekly':
      return [`RRULE:FREQ=WEEKLY`]
    case 'biweekly':
      return [`RRULE:FREQ=WEEKLY;INTERVAL=2`]
    case 'monthly':
      return [`RRULE:FREQ=MONTHLY`]
    default:
      return []
  }
}

export function rruleLinesToPattern(lines: string[] | null | undefined): LessonRecurrencePattern {
  if (!lines?.length) return 'none'
  const rrule = lines.find((line) => line.startsWith('RRULE:')) ?? ''
  if (rrule.includes('FREQ=DAILY') && rrule.includes('INTERVAL=2')) {
    return 'every_other_day'
  }
  if (rrule.includes('FREQ=DAILY')) return 'daily'
  if (rrule.includes('FREQ=WEEKLY') && rrule.includes('INTERVAL=2')) {
    return 'biweekly'
  }
  if (rrule.includes('FREQ=WEEKLY')) return 'weekly'
  if (rrule.includes('FREQ=MONTHLY')) return 'monthly'
  return 'none'
}

export function getRecurrenceDisplayLabel(
  pattern: LessonRecurrencePattern | string | null | undefined,
): string | null {
  switch (pattern) {
    case 'daily':
      return '매일'
    case 'every_other_day':
      return '격일'
    case 'weekly':
      return '매주'
    case 'biweekly':
      return '격주'
    case 'monthly':
      return '매월'
    default:
      return null
  }
}
