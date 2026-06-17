import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseVirtualLessonId,
  type RecurrenceCapableLesson,
} from '@/lib/calendar-recurrence/types'
import { querySessionPackageIdForDeduction } from '@/lib/actions/sessions'

const MASTER_SELECT =
  'id, lesson_date, start_time, end_time, member_id, title, content, instructor_id, session_package_id, lesson_type, recurrence, recurrence_pattern, recurrence_group_id, event_type, event_status, attendance_status'

function occurrenceOriginalIso(
  master: Pick<RecurrenceCapableLesson, 'start_time'>,
  date: string,
): string {
  const time = (master.start_time ?? '00:00:00').slice(0, 8)
  return `${date}T${time.length === 5 ? `${time}:00` : time}.000Z`
}

function buildAttendanceExceptionPayload(
  master: RecurrenceCapableLesson,
  occurrenceDate: string,
  sessionPackageId: string | null,
): Record<string, unknown> {
  return {
    event_type: 'exception',
    event_status: 'confirmed',
    attendance_status: 'present',
    recurring_master_id: master.id,
    original_start_time: occurrenceOriginalIso(master, occurrenceDate),
    lesson_date: occurrenceDate,
    member_id: master.member_id,
    title: master.title,
    content: master.content,
    instructor_id: master.instructor_id,
    start_time: master.start_time,
    end_time: master.end_time,
    lesson_type: master.lesson_type ?? '개인레슨',
    recurrence_group_id: master.recurrence_group_id,
    recurrence_pattern: master.recurrence_pattern,
    session_package_id: sessionPackageId ?? master.session_package_id,
    session_deducted: false,
  }
}

/** 반복 캘린더 가상 ID(virt:…) → DB에 저장된 수업 ID. 필요 시 exception 행 생성 */
export async function resolvePersistedLessonIdForWrite(
  supabase: SupabaseClient,
  lessonId: string,
): Promise<{ lessonId: string; materialized: boolean; error?: string }> {
  const virtual = parseVirtualLessonId(lessonId)
  if (!virtual) {
    return { lessonId, materialized: false }
  }

  const { masterId, occurrenceDate } = virtual

  const { data: master, error: masterError } = await supabase
    .from('lessons')
    .select(MASTER_SELECT)
    .eq('id', masterId)
    .maybeSingle()

  if (masterError || !master) {
    return { lessonId, materialized: false, error: '반복 일정을 찾을 수 없습니다.' }
  }

  const row = master as RecurrenceCapableLesson

  const { data: existingException } = await supabase
    .from('lessons')
    .select('id')
    .eq('recurring_master_id', masterId)
    .eq('lesson_date', occurrenceDate)
    .maybeSingle()

  if (existingException?.id) {
    return { lessonId: existingException.id, materialized: false }
  }

  if (row.member_id) {
    const startKey = (row.start_time ?? '').slice(0, 5)
    const { data: slotRows } = await supabase
      .from('lessons')
      .select('id, start_time, event_type')
      .eq('member_id', row.member_id)
      .eq('lesson_date', occurrenceDate)

    const slotMatch = (slotRows ?? []).find(
      (item) =>
        item.event_type !== 'recurring_master' &&
        (item.start_time ?? '').slice(0, 5) === startKey,
    )
    if (slotMatch?.id) {
      return { lessonId: slotMatch.id, materialized: false }
    }
  }

  let sessionPackageId = row.session_package_id ?? null
  if (row.member_id && !sessionPackageId) {
    sessionPackageId = await querySessionPackageIdForDeduction(supabase, row.member_id)
  }

  const payload = buildAttendanceExceptionPayload(row, occurrenceDate, sessionPackageId)
  const { data: inserted, error: insertError } = await supabase
    .from('lessons')
    .insert(payload)
    .select('id')
    .single()

  if (insertError || !inserted?.id) {
    return {
      lessonId,
      materialized: false,
      error: insertError?.message ?? '수업을 저장하지 못했습니다.',
    }
  }

  return { lessonId: inserted.id, materialized: true }
}
