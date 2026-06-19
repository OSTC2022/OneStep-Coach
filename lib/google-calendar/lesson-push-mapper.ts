import 'server-only'

import { getLessonCalendarLabel } from '@/lib/calendar-utils'
import { GOOGLE_LESSON_ID_PROPERTY } from '@/lib/google-calendar/config'
import type { Lesson } from '@/lib/types'

const KST = 'Asia/Seoul'

export type LessonPushRow = Pick<
  Lesson,
  | 'id'
  | 'lesson_date'
  | 'start_time'
  | 'end_time'
  | 'title'
  | 'content'
  | 'member_id'
  | 'member'
  | 'instructor_id'
  | 'event_type'
  | 'recurrence'
  | 'attendance_status'
  | 'event_status'
  | 'event_timezone'
  | 'google_event_id'
>

function normalizeTime(time: string | null | undefined): string {
  if (!time) return '00:00:00'
  const trimmed = time.trim()
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed
  return '00:00:00'
}

function toKstDateTime(lessonDate: string, time: string | null | undefined): string {
  return `${lessonDate}T${normalizeTime(time)}+09:00`
}

function defaultEndTime(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  if (endTime) return endTime
  const start = normalizeTime(startTime)
  const [hh, mm] = start.split(':').map(Number)
  const total = hh * 60 + mm + 60
  const endH = Math.floor(total / 60) % 24
  const endM = total % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`
}

export function lessonToGoogleEventBody(lesson: LessonPushRow): Record<string, unknown> | null {
  if (lesson.event_status === 'cancelled' || lesson.attendance_status === 'cancelled') {
    return null
  }

  const summary = getLessonCalendarLabel(lesson)
  if (!summary || summary === '일정') return null

  const timezone = lesson.event_timezone ?? KST
  const startTime = lesson.start_time
  const endTime = defaultEndTime(startTime, lesson.end_time)

  const body: Record<string, unknown> = {
    summary,
    start: {
      dateTime: toKstDateTime(lesson.lesson_date, startTime),
      timeZone: timezone,
    },
    end: {
      dateTime: toKstDateTime(lesson.lesson_date, endTime),
      timeZone: timezone,
    },
  }

  if (lesson.event_type === 'recurring_master' && lesson.recurrence?.length) {
    body.recurrence = lesson.recurrence
  }

  body.extendedProperties = {
    private: {
      [GOOGLE_LESSON_ID_PROPERTY]: lesson.id,
    },
  }

  return body
}
