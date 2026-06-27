'use server'

import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { requireRole } from '@/lib/actions/auth'
import {
  fetchAttendanceRecordsForRange,
  resolveLessonOccurrenceContext,
} from '@/lib/actions/attendance-records'

/** 관리자용 — 출석 DB 상태 스냅샷 (이현 등 특정 회원·날짜 디버깅) */
export async function debugAttendanceDbState(options: {
  memberName: string
  lessonDate: string
}): Promise<{
  member?: { id: string; name: string }
  lessons: Array<Record<string, unknown>>
  lesson_sessions: Array<Record<string, unknown>>
  attendance_records: Array<Record<string, unknown>>
  error?: string
}> {
  await requireRole(['admin'])

  let supabase
  try {
    supabase = createServiceRoleClient()
  } catch {
    supabase = await createStaffDataClient()
  }

  const { data: members, error: memberError } = await supabase
    .from('members')
    .select('id, name')
    .ilike('name', `%${options.memberName.trim()}%`)
    .limit(5)

  if (memberError) {
    return { lessons: [], lesson_sessions: [], attendance_records: [], error: memberError.message }
  }

  const member = (members ?? []).find((row) => row.name.includes(options.memberName.trim())) ??
    members?.[0]

  if (!member) {
    return {
      lessons: [],
      lesson_sessions: [],
      attendance_records: [],
      error: `회원을 찾을 수 없습니다: ${options.memberName}`,
    }
  }

  const { data: lessons } = await supabase
    .from('lessons')
    .select(
      'id, lesson_date, start_time, member_id, event_type, recurring_master_id, attendance_status, session_deducted, sync_origin, app_modified_at, google_recurring_event_id, original_start_time, created_at',
    )
    .eq('member_id', member.id)
    .eq('lesson_date', options.lessonDate)

  const lessonIds = (lessons ?? []).map((row) => row.id)

  let lesson_sessions: Array<Record<string, unknown>> = []
  if (lessonIds.length) {
    const { data } = await supabase
      .from('lesson_sessions')
      .select('id, lesson_id, status, checked_in_at, created_at, updated_at')
      .in('lesson_id', lessonIds)
    lesson_sessions = data ?? []
  }

  const attendance_records = await fetchAttendanceRecordsForRange(
    supabase,
    options.lessonDate,
    options.lessonDate,
  ).then((rows) => rows.filter((row) => row.member_id === member.id))

  return {
    member,
    lessons: lessons ?? [],
    lesson_sessions,
    attendance_records,
  }
}

export async function debugLessonOccurrenceContext(lessonId: string) {
  await requireRole(['admin'])
  const supabase = await createStaffDataClient()
  return resolveLessonOccurrenceContext(supabase, lessonId)
}
