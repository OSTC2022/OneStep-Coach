'use server'

import { getCurrentUser } from '@/lib/actions/auth'
import {
  clearCenterTrainingScheduleAttendance,
  recordCenterTrainingScheduleAttendance,
} from '@/lib/actions/center-training-schedule-attendance'
import { saveMemberMileageLog } from '@/lib/actions/running-league'
import { getRunningPortalMemberForCurrentUser } from '@/lib/actions/staff-running-portal-member'
import { getKstDateKey } from '@/lib/member-backup/kst-date'
import {
  OFFLINE_CLASS_ATTENDANCE_DISTANCE_KM,
  OFFLINE_CLASS_ATTENDANCE_NOTE,
} from '@/lib/running-league/attendance-king'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { normalizeTrainingScheduleDate } from '@/lib/running-league/training-schedule'
import { revalidatePath } from 'next/cache'

export type OfflineClassAttendanceStatus = {
  today: string
  signedUp: boolean
  checkedIn: boolean
  canCheckIn: boolean
  trainingSummary: string | null
  scheduleDate: string | null
  weekday: number | null
}

async function attendanceDb() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

/** KST 날짜 키 → 훈련 스케줄 weekday (월=0 … 일=6) */
function weekdayFromDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  const utcDay = new Date(Date.UTC(year, month - 1, day, 3, 0, 0)).getUTCDay()
  return utcDay === 0 ? 6 : utcDay - 1
}

async function findTodaySignup(
  memberId: string,
  today: string,
): Promise<{
  weekday: number
  scheduleDate: string | null
  trainingSummary: string | null
} | null> {
  const supabase = await attendanceDb()
  const weekday = weekdayFromDateKey(today)

  let signupResult = await supabase
    .from('center_running_training_schedule_signups')
    .select('id, weekday, schedule_date')
    .eq('member_id', memberId)
    .eq('schedule_date', today)
    .maybeSingle()

  if (
    signupResult.error &&
    (signupResult.error.code === '42703' ||
      signupResult.error.message?.includes('schedule_date'))
  ) {
    signupResult = await supabase
      .from('center_running_training_schedule_signups')
      .select('id, weekday')
      .eq('member_id', memberId)
      .eq('weekday', weekday)
      .maybeSingle()
  }

  if (signupResult.error || !signupResult.data) {
    return null
  }

  const signupWeekday = Number(signupResult.data.weekday)
  const scheduleDate =
    normalizeTrainingScheduleDate(
      (signupResult.data as { schedule_date?: string | null }).schedule_date,
    ) ?? today

  let dayResult = await supabase
    .from('center_running_training_schedule_days')
    .select('training_summary, schedule_date, is_hidden')
    .eq('weekday', signupWeekday)
    .maybeSingle()

  if (dayResult.error?.message?.includes('schedule_date')) {
    dayResult = await supabase
      .from('center_running_training_schedule_days')
      .select('training_summary, is_hidden')
      .eq('weekday', signupWeekday)
      .maybeSingle()
  }

  const summary = dayResult.data?.training_summary?.trim() || null
  const liveDate = normalizeTrainingScheduleDate(
    (dayResult.data as { schedule_date?: string | null } | null)?.schedule_date,
  )

  // 라이브가 다른 주면 요약만 비울 수 있음 — 스냅샷 조회는 출석 가능 여부와 무관
  if (liveDate && liveDate !== scheduleDate) {
    return {
      weekday: signupWeekday,
      scheduleDate,
      trainingSummary: summary,
    }
  }

  if (dayResult.data && (dayResult.data as { is_hidden?: boolean }).is_hidden) {
    return null
  }

  return {
    weekday: signupWeekday,
    scheduleDate,
    trainingSummary: summary,
  }
}

async function hasOfflineAttendanceLog(
  memberId: string,
  today: string,
): Promise<boolean> {
  const supabase = await attendanceDb()
  const { data, error } = await supabase
    .from('running_league_mileage_logs')
    .select('id')
    .eq('member_id', memberId)
    .eq('logged_at', today)
    .eq('notes', OFFLINE_CLASS_ATTENDANCE_NOTE)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('hasOfflineAttendanceLog', error)
    return false
  }
  return Boolean(data?.id)
}

export async function getOfflineClassAttendanceStatus(): Promise<OfflineClassAttendanceStatus> {
  const today = getKstDateKey()
  const empty: OfflineClassAttendanceStatus = {
    today,
    signedUp: false,
    checkedIn: false,
    canCheckIn: false,
    trainingSummary: null,
    scheduleDate: null,
    weekday: null,
  }

  const [member, user] = await Promise.all([
    getRunningPortalMemberForCurrentUser(),
    getCurrentUser(),
  ])
  if (!member || user?.role !== 'adult_member') return empty

  const signup = await findTodaySignup(member.id, today)
  if (!signup) return empty

  const checkedIn = await hasOfflineAttendanceLog(member.id, today)
  return {
    today,
    signedUp: true,
    checkedIn,
    canCheckIn: !checkedIn,
    trainingSummary: signup.trainingSummary,
    scheduleDate: signup.scheduleDate,
    weekday: signup.weekday,
  }
}

export async function checkInOfflineClassAttendance(): Promise<
  | { ok: true; alreadyCheckedIn?: boolean; sessionDate: string }
  | { ok: false; error: string }
> {
  const [member, user] = await Promise.all([
    getRunningPortalMemberForCurrentUser(),
    getCurrentUser(),
  ])
  if (!member || !user) return { ok: false, error: '로그인이 필요합니다.' }
  if (user.role !== 'adult_member') {
    return { ok: false, error: '성인회원(육상)만 오프라인 출석할 수 있습니다.' }
  }

  const today = getKstDateKey()
  const signup = await findTodaySignup(member.id, today)
  if (!signup) {
    return {
      ok: false,
      error:
        '오늘 참여 신청한 오프라인 수업이 없습니다. 훈련 일정에서 먼저 참여해 주세요.',
    }
  }

  if (await hasOfflineAttendanceLog(member.id, today)) {
    return { ok: true, alreadyCheckedIn: true, sessionDate: today }
  }

  const mileageResult = await saveMemberMileageLog({
    distance_km: OFFLINE_CLASS_ATTENDANCE_DISTANCE_KM,
    logged_at: today,
    source: 'lesson',
    notes: OFFLINE_CLASS_ATTENDANCE_NOTE,
    skip_duplicate_check: true,
    verification_status: 'confirmed',
  })

  if (!mileageResult.ok) {
    return { ok: false, error: mileageResult.error }
  }

  const attendanceResult = await recordCenterTrainingScheduleAttendance({
    member,
    weekday: signup.weekday,
    scheduleDate: signup.scheduleDate ?? today,
    checkedInBy: user.id,
  })

  if (!attendanceResult.ok) {
    // 출석왕 로그는 남기고 센터 출석만 실패 — 사용자에게는 안내
    console.error(
      'checkInOfflineClassAttendance.lessonSession',
      attendanceResult.error,
    )
  }

  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/my/running-league')
  revalidatePath('/dashboard/running-portal')

  return { ok: true, sessionDate: today }
}

/** 참여 취소 시 같은 날짜 오프라인 출석왕 로그 제거 */
export async function clearOfflineClassAttendanceForDate(input: {
  memberId: string
  scheduleDate: string | null | undefined
}): Promise<void> {
  const date = normalizeTrainingScheduleDate(input.scheduleDate)
  if (!date) return

  const supabase = await attendanceDb()
  const { error } = await supabase
    .from('running_league_mileage_logs')
    .delete()
    .eq('member_id', input.memberId)
    .eq('logged_at', date)
    .eq('notes', OFFLINE_CLASS_ATTENDANCE_NOTE)

  if (error) {
    console.error('clearOfflineClassAttendanceForDate', error)
  }
}
