import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseVirtualLessonId } from '@/lib/calendar-recurrence/types'
import {
  buildLessonOccurrenceKey,
  DEFAULT_CENTER_ID,
  formatLessonOriginalStartIso,
  lessonToOccurrenceKeyInput,
  type LessonOccurrenceKeyInput,
} from '@/lib/lesson-occurrence-key'
import type { AttendanceStatus } from '@/lib/types'

const LESSON_CONTEXT_SELECT = `
  id,
  lesson_date,
  start_time,
  member_id,
  instructor_id,
  title,
  content,
  recurring_master_id,
  original_start_time,
  google_recurring_event_id,
  google_event_id,
  event_type
`

const MASTER_CONTEXT_SELECT = `
  id,
  lesson_date,
  start_time,
  member_id,
  instructor_id,
  title,
  content,
  google_recurring_event_id,
  google_event_id,
  recurrence_group_id
`

export type AttendanceRecordRow = {
  id: string
  center_id: string
  member_id: string
  lesson_occurrence_key: string
  lesson_date: string
  start_time: string | null
  lesson_id: string | null
  recurring_master_id: string | null
  google_recurring_event_id: string | null
  original_start_time: string | null
  instructor_id: string | null
  status: AttendanceStatus
  checked_in_at: string | null
  checked_in_by: string | null
  created_at: string
  updated_at: string
}

export type LessonOccurrenceContext = LessonOccurrenceKeyInput & {
  center_id: string
  lesson_occurrence_key: string
  instructor_id: string | null
  persisted_lesson_id: string | null
}

function isMissingAttendanceRecordsTable(message?: string) {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes('attendance_records') ||
    lower.includes('could not find the table')
  )
}

export async function resolveLessonOccurrenceContext(
  supabase: SupabaseClient,
  lessonId: string,
): Promise<{ context?: LessonOccurrenceContext; error?: string }> {
  const virtual = parseVirtualLessonId(lessonId)

  if (virtual) {
    const { masterId, occurrenceDate } = virtual
    const { data: master, error: masterError } = await supabase
      .from('lessons')
      .select(MASTER_CONTEXT_SELECT)
      .eq('id', masterId)
      .maybeSingle()

    if (masterError || !master) {
      return { error: '반복 일정을 찾을 수 없습니다.' }
    }

    const input: LessonOccurrenceKeyInput = {
      id: lessonId,
      member_id: master.member_id,
      lesson_date: occurrenceDate,
      start_time: master.start_time,
      title: master.title,
      content: master.content,
      google_recurring_event_id: master.google_recurring_event_id ?? null,
      google_event_id: master.google_event_id,
      recurring_master_id: masterId,
      original_start_time: formatLessonOriginalStartIso(
        occurrenceDate,
        master.start_time,
      ),
    }

    const lesson_occurrence_key = buildLessonOccurrenceKey(input)
    if (!lesson_occurrence_key || !master.member_id) {
      return { error: '출석 키를 만들 수 없습니다. 회원 연결을 확인해주세요.' }
    }

    const { data: existingLesson } = await supabase
      .from('lessons')
      .select('id')
      .eq('recurring_master_id', masterId)
      .eq('lesson_date', occurrenceDate)
      .neq('event_type', 'recurring_master')
      .maybeSingle()

    return {
      context: {
        ...input,
        center_id: DEFAULT_CENTER_ID,
        lesson_occurrence_key,
        instructor_id: master.instructor_id ?? null,
        persisted_lesson_id: existingLesson?.id ?? null,
      },
    }
  }

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select(LESSON_CONTEXT_SELECT)
    .eq('id', lessonId)
    .maybeSingle()

  if (lessonError || !lesson) {
    return { error: '수업을 찾을 수 없습니다.' }
  }

  const input = lessonToOccurrenceKeyInput(lesson as LessonOccurrenceKeyInput)
  const lesson_occurrence_key = buildLessonOccurrenceKey(input)
  if (!lesson_occurrence_key || !lesson.member_id) {
    return { error: '출석 키를 만들 수 없습니다. 회원 연결을 확인해주세요.' }
  }

  return {
    context: {
      ...input,
      center_id: DEFAULT_CENTER_ID,
      lesson_occurrence_key,
      instructor_id: lesson.instructor_id ?? null,
      persisted_lesson_id: lesson.id,
    },
  }
}

export async function upsertAttendanceRecord(
  supabase: SupabaseClient,
  params: {
    context: LessonOccurrenceContext
    status: AttendanceStatus
    userId: string
  },
): Promise<{ data?: AttendanceRecordRow; error?: string }> {
  const now = new Date().toISOString()
  const checkedInAt =
    params.status === 'present' || params.status === 'makeup' ? now : null

  const payload = {
    center_id: params.context.center_id,
    member_id: params.context.member_id!,
    lesson_occurrence_key: params.context.lesson_occurrence_key,
    lesson_date: params.context.lesson_date,
    start_time: params.context.start_time
      ? `${normalizeStartTime(params.context.start_time)}:00`.slice(0, 8)
      : null,
    lesson_id: params.context.persisted_lesson_id,
    recurring_master_id: params.context.recurring_master_id,
    google_recurring_event_id: params.context.google_recurring_event_id,
    original_start_time: params.context.original_start_time,
    instructor_id: params.context.instructor_id,
    status: params.status,
    checked_in_at: checkedInAt,
    checked_in_by: params.userId,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .upsert(payload, { onConflict: 'center_id,member_id,lesson_occurrence_key' })
    .select()
    .single()

  if (error) {
    if (isMissingAttendanceRecordsTable(error.message)) {
      return {
        error:
          'attendance_records 테이블이 없습니다. supabase/add-attendance-records.sql 을 실행해주세요.',
      }
    }
    return { error: error.message }
  }

  return { data: data as AttendanceRecordRow }
}

export async function deleteAttendanceRecord(
  supabase: SupabaseClient,
  context: LessonOccurrenceContext,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('attendance_records')
    .delete()
    .eq('center_id', context.center_id)
    .eq('member_id', context.member_id!)
    .eq('lesson_occurrence_key', context.lesson_occurrence_key)

  if (error) {
    if (isMissingAttendanceRecordsTable(error.message)) {
      return {
        error:
          'attendance_records 테이블이 없습니다. supabase/add-attendance-records.sql 을 실행해주세요.',
      }
    }
    return { error: error.message }
  }

  return {}
}

export async function fetchAttendanceRecordsForRange(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string,
): Promise<AttendanceRecordRow[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .gte('lesson_date', dateFrom)
    .lte('lesson_date', dateTo)

  if (error) {
    if (isMissingAttendanceRecordsTable(error.message)) {
      console.warn('[attendance-records] table missing — run add-attendance-records.sql')
      return []
    }
    console.error('[attendance-records] fetch error:', error.message)
    return []
  }

  return (data ?? []) as AttendanceRecordRow[]
}

function normalizeStartTime(time: string): string {
  return time.slice(0, 5)
}

export function attachAttendanceRecordsToLessons<T extends LessonOccurrenceKeyInput>(
  lessons: T[],
  records: AttendanceRecordRow[],
): Array<
  T & {
    attendance_record?: AttendanceRecordRow | null
    attendance_status?: string
    lesson_sessions?: Array<{ checked_in_at?: string | null }>
  }
> {
  const byKey = new Map(records.map((row) => [row.lesson_occurrence_key, row]))

  return lessons.map((lesson) => {
    const key = buildLessonOccurrenceKey(lesson)
    if (!key) return lesson

    const record = byKey.get(key)
    if (!record) return lesson

    const patched: T & {
      attendance_record?: AttendanceRecordRow
      attendance_status?: string
      lesson_sessions?: Array<{ checked_in_at?: string | null }>
    } = { ...lesson, attendance_record: record }

    patched.attendance_status = record.status
    if (record.checked_in_at && record.status === 'present') {
      patched.lesson_sessions = [{ checked_in_at: record.checked_in_at }]
    } else if (record.status === 'cancelled') {
      patched.lesson_sessions = []
    }

    return patched
  })
}
