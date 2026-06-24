'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import {
  CENTER_TRAINING_SCHEDULE_ATTENDANCE_NOTE,
  resolveCenterTrainingScheduleSessionDate,
} from '@/lib/running-league/center-training-schedule-attendance'
import type { Member } from '@/lib/types'
import { revalidatePath } from 'next/cache'

async function attendanceClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function revalidateMemberAttendancePaths() {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard/lesson-status')
}

type SessionRow = {
  id: string
  notes: string | null
  lesson_id: string | null
  session_deducted: boolean
}

/** 성인회원 훈련 스케줄 참여 시 해당 날짜 출석 체크 */
export async function recordCenterTrainingScheduleAttendance(input: {
  member: Pick<Member, 'id' | 'primary_instructor_id'>
  weekday: number
  scheduleDate: string | null | undefined
  checkedInBy: string
}): Promise<{ ok: true; sessionDate: string } | { ok: false; error: string }> {
  const sessionDate = resolveCenterTrainingScheduleSessionDate(
    input.weekday,
    input.scheduleDate,
  )
  const supabase = await attendanceClient()
  const now = new Date().toISOString()

  const { data: existingSessions, error: listError } = await supabase
    .from('lesson_sessions')
    .select('id, notes, lesson_id, session_deducted')
    .eq('member_id', input.member.id)
    .eq('session_date', sessionDate)

  if (listError) {
    console.error('recordCenterTrainingScheduleAttendance.list', listError)
    return { ok: false, error: '출석 기록을 확인하지 못했습니다.' }
  }

  const rows = (existingSessions ?? []) as SessionRow[]
  const ownRow = rows.find((row) => row.notes === CENTER_TRAINING_SCHEDULE_ATTENDANCE_NOTE)
  const hasOtherAttendance = rows.some(
    (row) =>
      row.notes !== CENTER_TRAINING_SCHEDULE_ATTENDANCE_NOTE &&
      (row.lesson_id != null || row.session_deducted),
  )

  if (hasOtherAttendance && !ownRow) {
    return { ok: true, sessionDate }
  }

  const sessionUpdate = {
    status: 'present' as const,
    checked_in_at: now,
    checked_in_by: input.checkedInBy,
    notes: CENTER_TRAINING_SCHEDULE_ATTENDANCE_NOTE,
    updated_at: now,
  }

  if (ownRow) {
    const { error } = await supabase
      .from('lesson_sessions')
      .update(sessionUpdate)
      .eq('id', ownRow.id)

    if (error) {
      console.error('recordCenterTrainingScheduleAttendance.update', error)
      return { ok: false, error: '출석 기록에 실패했습니다.' }
    }
  } else if (rows.length === 0) {
    const { error } = await supabase.from('lesson_sessions').insert({
      member_id: input.member.id,
      instructor_id: input.member.primary_instructor_id,
      session_date: sessionDate,
      lesson_id: null,
      session_package_id: null,
      session_deducted: false,
      ...sessionUpdate,
    })

    if (error) {
      console.error('recordCenterTrainingScheduleAttendance.insert', error)
      return { ok: false, error: '출석 기록에 실패했습니다.' }
    }
  } else {
    const { error } = await supabase
      .from('lesson_sessions')
      .update(sessionUpdate)
      .eq('id', rows[0].id)

    if (error) {
      console.error('recordCenterTrainingScheduleAttendance.updateExisting', error)
      return { ok: false, error: '출석 기록에 실패했습니다.' }
    }
  }

  revalidateMemberAttendancePaths()
  return { ok: true, sessionDate }
}

/** 훈련 스케줄 참여 취소 시 자동 출석 기록 제거 */
export async function clearCenterTrainingScheduleAttendance(input: {
  memberId: string
  weekday: number
  scheduleDate: string | null | undefined
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sessionDate = resolveCenterTrainingScheduleSessionDate(
    input.weekday,
    input.scheduleDate,
  )
  const supabase = await attendanceClient()

  const { error } = await supabase
    .from('lesson_sessions')
    .delete()
    .eq('member_id', input.memberId)
    .eq('session_date', sessionDate)
    .eq('notes', CENTER_TRAINING_SCHEDULE_ATTENDANCE_NOTE)
    .eq('session_deducted', false)
    .is('lesson_id', null)

  if (error) {
    console.error('clearCenterTrainingScheduleAttendance', error)
    return { ok: false, error: '출석 취소에 실패했습니다.' }
  }

  revalidateMemberAttendancePaths()
  return { ok: true }
}
