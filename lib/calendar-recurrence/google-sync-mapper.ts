import type { LessonRecurrencePattern } from '@/lib/lesson-recurrence'
import {
  addExdateToRecurrence,
  truncateRecurrenceUntil,
} from '@/lib/calendar-recurrence/expand-lessons'
import {
  patternToRRuleLines,
  rruleLinesToPattern,
  type RecurrenceCapableLesson,
} from '@/lib/calendar-recurrence/types'
import type { GoogleCalendarEvent } from '@/lib/google-calendar/types'
import { parseGoogleEventDateTime } from '@/lib/google-calendar/event-mapper'

export function googleRecurrenceToPattern(
  recurrence: string[] | null | undefined,
): LessonRecurrencePattern {
  return rruleLinesToPattern(recurrence ?? [])
}

export function isGoogleRecurringMaster(event: GoogleCalendarEvent): boolean {
  return Boolean(event.recurrence?.length) && !event.recurringEventId
}

export function isGoogleRecurringInstance(event: GoogleCalendarEvent): boolean {
  return Boolean(event.recurringEventId)
}

/** Google marks edited/deleted instances with originalStartTime */
export function isGoogleRecurrenceException(event: GoogleCalendarEvent): boolean {
  if (!event.recurringEventId) return false
  if (event.status === 'cancelled') return true
  if (!event.originalStartTime) return false

  const instance = parseGoogleEventDateTime(event)
  const original = parseGoogleEventDateTime({
    ...event,
    start: event.originalStartTime,
    end: event.end,
  })
  if (!instance || !original) return false
  return (
    instance.lessonDate !== original.lessonDate ||
    instance.startTime !== original.startTime
  )
}

export function shouldSkipGoogleExpandedInstance(
  event: GoogleCalendarEvent,
): boolean {
  return (
    isGoogleRecurringInstance(event) &&
    !isGoogleRecurrenceException(event) &&
    event.status !== 'cancelled'
  )
}

export function parseGoogleOriginalStartIso(
  event: GoogleCalendarEvent,
): string | null {
  const schedule = parseGoogleEventDateTime({
    ...event,
    start: event.originalStartTime ?? event.start,
  })
  if (!schedule) return null
  const hhmm = schedule.startTime ?? '00:00'
  return new Date(`${schedule.lessonDate}T${hhmm}:00+09:00`).toISOString()
}

export function buildAppRecurringMasterPayload(
  form: {
    lesson_date: string
    start_time?: string | null
    end_time?: string | null
    member_id?: string | null
    title?: string | null
    instructor_id?: string | null
    lesson_type?: string
  },
  pattern: LessonRecurrencePattern,
  groupId: string,
): Record<string, unknown> {
  return {
    ...form,
    event_type: 'recurring_master',
    event_status: 'confirmed',
    recurrence: patternToRRuleLines(pattern, form.lesson_date),
    recurrence_pattern: pattern,
    recurrence_group_id: groupId,
  }
}

export function buildExceptionCancelPayload(
  master: RecurrenceCapableLesson,
  occurrenceDate: string,
  originalStartIso: string,
): Record<string, unknown> {
  return {
    event_type: 'exception',
    event_status: 'cancelled',
    attendance_status: 'cancelled',
    recurring_master_id: master.id,
    original_start_time: originalStartIso,
    lesson_date: occurrenceDate,
    start_time: master.start_time,
    end_time: master.end_time,
    member_id: master.member_id,
    title: master.title,
    instructor_id: master.instructor_id,
    lesson_type: master.lesson_type,
    recurrence_group_id: master.recurrence_group_id,
    recurrence_pattern: master.recurrence_pattern,
  }
}

export function applySeriesDeleteToMaster(
  master: RecurrenceCapableLesson,
  scope: 'single' | 'future' | 'all',
  occurrenceDate: string,
): Record<string, unknown> | 'delete_master' | null {
  if (scope === 'all') return 'delete_master'

  if (scope === 'single') {
    return {
      recurrence: addExdateToRecurrence(master.recurrence, occurrenceDate),
    }
  }

  const untilDate = occurrenceDate
  return {
    recurrence: truncateRecurrenceUntil(master.recurrence, untilDate),
  }
}
