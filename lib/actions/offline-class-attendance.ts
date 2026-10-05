'use server'

import { getCurrentUser } from '@/lib/actions/auth'
import {
  clearCenterTrainingScheduleAttendance,
  recordCenterTrainingScheduleAttendance,
} from '@/lib/actions/center-training-schedule-attendance'
import {
  ensurePortalParticipantForMember,
  syncPortalParticipantMileage,
} from '@/lib/actions/running-league'
import { getRunningPortalMemberForCurrentUser } from '@/lib/actions/staff-running-portal-member'
import { getKstDateKey } from '@/lib/member-backup/kst-date'
import {
  isMileageLogAttendanceQualified,
  isOfflineClassAttendanceLog,
  OFFLINE_CLASS_ATTENDANCE_DISTANCE_KM,
  OFFLINE_CLASS_ATTENDANCE_NOTE,
} from '@/lib/running-league/attendance-king'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  formatTrainingScheduleDateLabel,
  normalizeTrainingScheduleDate,
  TRAINING_WEEKDAY_LABELS,
} from '@/lib/running-league/training-schedule'
import { revalidatePath, revalidateTag } from 'next/cache'
import { CENTER_PORTAL_RANKINGS_CACHE_TAG } from '@/lib/running-league/center-portal-rankings-data'

export type OfflineClassAttendanceStatus = {
  today: string
  signedUp: boolean
  checkedIn: boolean
  canCheckIn: boolean
  trainingSummary: string | null
  scheduleDate: string | null
  weekday: number | null
}

export type OfflineAttendanceCheckInOption = {
  scheduleDate: string
  weekday: number
  label: string
  trainingSummary: string | null
  checkedIn: boolean
  signedUp: boolean
}

const MEMBER_CHECK_IN_LOOKBACK_DAYS = 21

type ScheduleDayCandidate = {
  scheduleDate: string
  weekday: number
  trainingSummary: string | null
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

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + deltaDays))
  return next.toISOString().slice(0, 10)
}

function formatCheckInOptionLabel(scheduleDate: string, weekday: number): string {
  const dateLabel =
    formatTrainingScheduleDateLabel(scheduleDate) ?? scheduleDate.slice(5).replace('-', '/')
  const weekdayLabel = TRAINING_WEEKDAY_LABELS[weekday] ?? ''
  return weekdayLabel ? `${dateLabel} (${weekdayLabel})` : dateLabel
}

function isOperableScheduleDay(day: {
  is_hidden?: boolean
  training_summary?: string | null
}): boolean {
  return !day.is_hidden && Boolean(day.training_summary?.trim())
}

function upsertScheduleDay(
  byDate: Map<string, ScheduleDayCandidate>,
  candidate: ScheduleDayCandidate,
) {
  const existing = byDate.get(candidate.scheduleDate)
  if (!existing) {
    byDate.set(candidate.scheduleDate, candidate)
    return
  }
  if (!existing.trainingSummary && candidate.trainingSummary) {
    byDate.set(candidate.scheduleDate, candidate)
  }
}

/** 훈련 일정(라이브·스냅샷)에 올라온 날짜인지 — 참여 신청 불필요 */
async function findScheduleDayForDate(
  scheduleDate: string,
): Promise<ScheduleDayCandidate | null> {
  const supabase = await attendanceDb()
  const weekday = weekdayFromDateKey(scheduleDate)

  let dayResult = await supabase
    .from('center_running_training_schedule_days')
    .select('weekday, training_summary, schedule_date, is_hidden')
    .eq('schedule_date', scheduleDate)
    .maybeSingle()

  if (
    dayResult.error &&
    (dayResult.error.code === '42703' ||
      dayResult.error.message?.includes('schedule_date'))
  ) {
    dayResult = await supabase
      .from('center_running_training_schedule_days')
      .select('weekday, training_summary, is_hidden')
      .eq('weekday', weekday)
      .maybeSingle()
    if (!dayResult.error && dayResult.data && isOperableScheduleDay(dayResult.data)) {
      const today = getKstDateKey()
      // 레거시: 날짜 컬럼 없으면 오늘만
      if (scheduleDate === today) {
        return {
          scheduleDate,
          weekday: Number(dayResult.data.weekday ?? weekday),
          trainingSummary: dayResult.data.training_summary?.trim() || null,
        }
      }
    }
  } else if (!dayResult.error && dayResult.data && isOperableScheduleDay(dayResult.data)) {
    return {
      scheduleDate,
      weekday: Number(dayResult.data.weekday ?? weekday),
      trainingSummary: dayResult.data.training_summary?.trim() || null,
    }
  }

  const weekStart = shiftDateKey(scheduleDate, -weekday)
  const { data: snapshots, error: snapshotError } = await supabase
    .from('center_running_training_schedule_week_snapshots')
    .select('days, saved_at')
    .eq('week_start_date', weekStart)
    .order('saved_at', { ascending: false })
    .limit(3)

  if (snapshotError) {
    if (snapshotError.code !== '42P01') {
      console.error('findScheduleDayForDate.snapshot', snapshotError)
    }
    return null
  }

  for (const snapshot of snapshots ?? []) {
    const days = Array.isArray(snapshot.days) ? snapshot.days : []
    for (const rawDay of days) {
      if (!rawDay || typeof rawDay !== 'object') continue
      const day = rawDay as {
        weekday?: number
        schedule_date?: string | null
        training_summary?: string | null
        is_hidden?: boolean
      }
      const dayDate = normalizeTrainingScheduleDate(day.schedule_date)
      if (dayDate !== scheduleDate) continue
      if (!isOperableScheduleDay(day)) continue
      return {
        scheduleDate,
        weekday: Number(day.weekday ?? weekday),
        trainingSummary: day.training_summary?.trim() || null,
      }
    }
  }

  return null
}

async function memberSignedUpForDate(
  memberId: string,
  scheduleDate: string,
): Promise<boolean> {
  const supabase = await attendanceDb()
  const { data, error } = await supabase
    .from('center_running_training_schedule_signups')
    .select('id')
    .eq('member_id', memberId)
    .eq('schedule_date', scheduleDate)
    .maybeSingle()

  if (
    error &&
    (error.code === '42703' || error.message?.includes('schedule_date'))
  ) {
    const today = getKstDateKey()
    if (scheduleDate !== today) return false
    const weekday = weekdayFromDateKey(scheduleDate)
    const legacy = await supabase
      .from('center_running_training_schedule_signups')
      .select('id')
      .eq('member_id', memberId)
      .eq('weekday', weekday)
      .maybeSingle()
    return Boolean(legacy.data?.id)
  }

  if (!error && data?.id) return true

  const weekday = weekdayFromDateKey(scheduleDate)
  const weekStart = shiftDateKey(scheduleDate, -weekday)
  const { data: snapshots } = await supabase
    .from('center_running_training_schedule_week_snapshots')
    .select('days, saved_at')
    .eq('week_start_date', weekStart)
    .order('saved_at', { ascending: false })
    .limit(3)

  for (const snapshot of snapshots ?? []) {
    const days = Array.isArray(snapshot.days) ? snapshot.days : []
    for (const rawDay of days) {
      if (!rawDay || typeof rawDay !== 'object') continue
      const day = rawDay as {
        schedule_date?: string | null
        signups?: Array<{ member_id?: string }>
      }
      if (normalizeTrainingScheduleDate(day.schedule_date) !== scheduleDate) continue
      if ((day.signups ?? []).some((signup) => signup.member_id === memberId)) {
        return true
      }
    }
  }

  return false
}

/** 훈련 일정에 떠 있는 수업 날짜 (참여 신청 여부와 무관) */
async function listScheduleCheckInDates(
  today: string,
): Promise<ScheduleDayCandidate[]> {
  const supabase = await attendanceDb()
  const lookbackStart = shiftDateKey(today, -MEMBER_CHECK_IN_LOOKBACK_DAYS)
  const byDate = new Map<string, ScheduleDayCandidate>()

  let liveResult = await supabase
    .from('center_running_training_schedule_days')
    .select('weekday, training_summary, schedule_date, is_hidden')
    .gte('schedule_date', lookbackStart)
    .lte('schedule_date', today)

  if (
    liveResult.error &&
    (liveResult.error.code === '42703' ||
      liveResult.error.message?.includes('schedule_date'))
  ) {
    liveResult = await supabase
      .from('center_running_training_schedule_days')
      .select('weekday, training_summary, is_hidden')
    const todayWeekday = weekdayFromDateKey(today)
    for (const row of liveResult.data ?? []) {
      if (Number(row.weekday) !== todayWeekday) continue
      if (!isOperableScheduleDay(row)) continue
      upsertScheduleDay(byDate, {
        scheduleDate: today,
        weekday: todayWeekday,
        trainingSummary: row.training_summary?.trim() || null,
      })
    }
  } else if (!liveResult.error) {
    for (const row of liveResult.data ?? []) {
      if (!isOperableScheduleDay(row)) continue
      const scheduleDate = normalizeTrainingScheduleDate(row.schedule_date)
      if (!scheduleDate || scheduleDate > today || scheduleDate < lookbackStart) continue
      upsertScheduleDay(byDate, {
        scheduleDate,
        weekday: Number(row.weekday),
        trainingSummary: row.training_summary?.trim() || null,
      })
    }
  }

  const { data: snapshots, error: snapshotError } = await supabase
    .from('center_running_training_schedule_week_snapshots')
    .select('week_start_date, days, saved_at')
    .gte('week_start_date', shiftDateKey(lookbackStart, -7))
    .order('saved_at', { ascending: false })
    .limit(12)

  if (snapshotError) {
    if (snapshotError.code !== '42P01') {
      console.error('listScheduleCheckInDates.snapshot', snapshotError)
    }
  } else {
    for (const snapshot of snapshots ?? []) {
      const days = Array.isArray(snapshot.days) ? snapshot.days : []
      for (const rawDay of days) {
        if (!rawDay || typeof rawDay !== 'object') continue
        const day = rawDay as {
          weekday?: number
          schedule_date?: string | null
          training_summary?: string | null
          is_hidden?: boolean
        }
        if (!isOperableScheduleDay(day)) continue
        const scheduleDate = normalizeTrainingScheduleDate(day.schedule_date)
        if (!scheduleDate || scheduleDate > today || scheduleDate < lookbackStart) continue
        upsertScheduleDay(byDate, {
          scheduleDate,
          weekday: Number(day.weekday ?? weekdayFromDateKey(scheduleDate)),
          trainingSummary: day.training_summary?.trim() || null,
        })
      }
    }
  }

  return [...byDate.values()].sort((a, b) => b.scheduleDate.localeCompare(a.scheduleDate))
}

async function hasOfflineAttendanceLog(
  memberId: string,
  scheduleDate: string,
): Promise<boolean> {
  const supabase = await attendanceDb()
  const { data, error } = await supabase
    .from('running_league_mileage_logs')
    .select('id')
    .eq('member_id', memberId)
    .eq('logged_at', scheduleDate)
    .eq('notes', OFFLINE_CLASS_ATTENDANCE_NOTE)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('hasOfflineAttendanceLog', error)
    return false
  }
  return Boolean(data?.id)
}

/**
 * 성인 러닝 오프라인 수업 출석 1회 기록 (출석왕 + lesson_sessions).
 * 마일리지 km와 무관 · 이미 있으면 건너뜀.
 */
export async function recordOfflineClassAttendanceForMember(input: {
  memberId: string
  scheduleDate: string
  checkedInBy: string
  weekday?: number
}): Promise<
  | { ok: true; alreadyCheckedIn?: boolean; sessionDate: string }
  | { ok: false; error: string }
> {
  const date = normalizeTrainingScheduleDate(input.scheduleDate)
  if (!date) return { ok: false, error: '날짜가 올바르지 않습니다.' }

  const supabase = await attendanceDb()
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, name, primary_instructor_id')
    .eq('id', input.memberId)
    .maybeSingle()

  if (memberError || !member) {
    return { ok: false, error: '회원을 찾을 수 없습니다.' }
  }

  if (await hasOfflineAttendanceLog(member.id, date)) {
    return { ok: true, alreadyCheckedIn: true, sessionDate: date }
  }

  const ensured = await ensurePortalParticipantForMember(member.id)
  if (!ensured.ok) return ensured

  const participant = ensured.participant
  const { error: insertError } = await supabase.from('running_league_mileage_logs').insert({
    participant_id: participant.id,
    league_id: participant.league_id,
    member_id: member.id,
    distance_km: OFFLINE_CLASS_ATTENDANCE_DISTANCE_KM,
    logged_at: date,
    source: 'lesson',
    notes: OFFLINE_CLASS_ATTENDANCE_NOTE,
    verification_status: 'confirmed',
    updated_at: new Date().toISOString(),
  })

  if (insertError) {
    console.error('recordOfflineClassAttendanceForMember.insert', insertError)
    return { ok: false, error: '출석 기록 저장에 실패했습니다.' }
  }

  const weekday = input.weekday ?? weekdayFromDateKey(date)
  const attendanceResult = await recordCenterTrainingScheduleAttendance({
    member: {
      id: member.id,
      primary_instructor_id: member.primary_instructor_id,
    },
    weekday,
    scheduleDate: date,
    checkedInBy: input.checkedInBy,
    audience: 'adult_running',
  })
  if (!attendanceResult.ok) {
    console.error(
      'recordOfflineClassAttendanceForMember.lessonSession',
      attendanceResult.error,
    )
  }

  try {
    await syncPortalParticipantMileage(participant.id)
  } catch (error) {
    console.error('recordOfflineClassAttendanceForMember.sync', error)
  }

  revalidateTag(CENTER_PORTAL_RANKINGS_CACHE_TAG, 'max')
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/running-portal')
  revalidatePath('/dashboard/running-portal/league')

  return { ok: true, sessionDate: date }
}

/** 해당 날짜 성인 스케줄 참여자 중 출석 없는 회원에 자동 출석 보정 */
export async function backfillOfflineAttendanceFromAdultScheduleSignups(
  scheduleDate: string,
): Promise<
  | { ok: true; total: number; recorded: number; skipped: number }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user || !isStaffAttendanceManager(user.role)) {
    return { ok: false, error: '관리자 또는 강사만 보정할 수 있습니다.' }
  }

  const date = normalizeTrainingScheduleDate(scheduleDate)
  if (!date) return { ok: false, error: '날짜가 올바르지 않습니다.' }

  const supabase = await attendanceDb()
  const { data: signups, error } = await supabase
    .from('center_running_training_schedule_signups')
    .select('member_id, weekday')
    .eq('schedule_date', date)

  if (error) {
    console.error('backfillOfflineAttendanceFromAdultScheduleSignups', error)
    return { ok: false, error: '참여 명단을 불러오지 못했습니다.' }
  }

  const rows = signups ?? []
  let recorded = 0
  let skipped = 0

  for (const row of rows) {
    if (!row.member_id) continue
    const result = await recordOfflineClassAttendanceForMember({
      memberId: row.member_id,
      scheduleDate: date,
      checkedInBy: user.id,
      weekday: typeof row.weekday === 'number' ? row.weekday : undefined,
    })
    if (!result.ok) {
      console.error(
        'backfillOfflineAttendanceFromAdultScheduleSignups.member',
        row.member_id,
        result.error,
      )
      continue
    }
    if (result.alreadyCheckedIn) skipped += 1
    else recorded += 1
  }

  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/my/running-league')
  revalidatePath('/dashboard/running-portal')
  revalidatePath('/dashboard/running-portal/league')

  return { ok: true, total: rows.length, recorded, skipped }
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
  if (!member || !canSelfOfflineCheckIn(user?.role)) return empty

  const options = await listMyOfflineAttendanceCheckInOptionsForMember(member.id, today)
  const open = options.find((option) => !option.checkedIn)
  const todayOption = options.find((option) => option.scheduleDate === today) ?? null
  const preferred = todayOption ?? open ?? options[0] ?? null
  if (!preferred) return empty

  return {
    today,
    signedUp: true,
    checkedIn: preferred.checkedIn && preferred.scheduleDate === today,
    canCheckIn: options.some((option) => !option.checkedIn),
    trainingSummary: preferred.trainingSummary,
    scheduleDate: preferred.scheduleDate,
    weekday: preferred.weekday,
  }
}

async function listMyOfflineAttendanceCheckInOptionsForMember(
  memberId: string,
  today = getKstDateKey(),
): Promise<OfflineAttendanceCheckInOption[]> {
  const scheduleDays = await listScheduleCheckInDates(today)
  const options: OfflineAttendanceCheckInOption[] = []
  for (const day of scheduleDays) {
    const [checkedIn, signedUp] = await Promise.all([
      hasOfflineAttendanceLog(memberId, day.scheduleDate),
      memberSignedUpForDate(memberId, day.scheduleDate),
    ])
    options.push({
      scheduleDate: day.scheduleDate,
      weekday: day.weekday,
      label: formatCheckInOptionLabel(day.scheduleDate, day.weekday),
      trainingSummary: day.trainingSummary,
      checkedIn,
      signedUp,
    })
  }
  return options
}

/** 회원 — 출석 가능한 참여 수업 날짜 목록 (오늘 포함 최근 수업) */
export async function listMyOfflineAttendanceCheckInOptions(): Promise<
  | { ok: true; today: string; options: OfflineAttendanceCheckInOption[] }
  | { ok: false; error: string }
> {
  const [member, user] = await Promise.all([
    getRunningPortalMemberForCurrentUser(),
    getCurrentUser(),
  ])
  if (!member || !user) return { ok: false, error: '로그인이 필요합니다.' }
  if (!canSelfOfflineCheckIn(user.role)) {
    return { ok: false, error: '출석 권한이 없습니다.' }
  }

  const today = getKstDateKey()
  const options = await listMyOfflineAttendanceCheckInOptionsForMember(member.id, today)
  return { ok: true, today, options }
}

export async function checkInOfflineClassAttendance(input?: {
  scheduleDate?: string | null
}): Promise<
  | { ok: true; alreadyCheckedIn?: boolean; sessionDate: string }
  | { ok: false; error: string }
> {
  const [member, user] = await Promise.all([
    getRunningPortalMemberForCurrentUser(),
    getCurrentUser(),
  ])
  if (!member || !user) return { ok: false, error: '로그인이 필요합니다.' }
  if (!canSelfOfflineCheckIn(user.role)) {
    return { ok: false, error: '출석 권한이 없습니다.' }
  }

  const today = getKstDateKey()
  const requestedDate = normalizeTrainingScheduleDate(input?.scheduleDate) ?? today
  if (requestedDate > today) {
    return { ok: false, error: '미래 날짜에는 출석할 수 없습니다.' }
  }
  const lookbackStart = shiftDateKey(today, -MEMBER_CHECK_IN_LOOKBACK_DAYS)
  if (requestedDate < lookbackStart) {
    return {
      ok: false,
      error: `최근 ${MEMBER_CHECK_IN_LOOKBACK_DAYS}일 이내 수업에만 출석할 수 있습니다.`,
    }
  }

  const scheduleDay = await findScheduleDayForDate(requestedDate)
  if (!scheduleDay) {
    return {
      ok: false,
      error: '해당 날짜에 훈련 일정이 없습니다. 훈련 일정에 있는 수업만 출석할 수 있습니다.',
    }
  }

  const result = await recordOfflineClassAttendanceForMember({
    memberId: member.id,
    scheduleDate: scheduleDay.scheduleDate,
    checkedInBy: user.id,
    weekday: scheduleDay.weekday,
  })

  if (!result.ok) return result

  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/my/running-league')
  revalidatePath('/dashboard/running-portal')

  return result
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

function isStaffAttendanceManager(role: string | undefined): boolean {
  return role === 'admin' || role === 'instructor'
}

/** 본인 포털 출석 — 성인회원 + 러닝포털 쓰는 관리자·강사 */
function canSelfOfflineCheckIn(role: string | undefined): boolean {
  return role === 'adult_member' || isStaffAttendanceManager(role)
}

export type StaffMemberDayAttendanceStatus = {
  date: string
  memberId: string
  memberName: string
  offlineCheckedIn: boolean
  mileageQualified: boolean
  attended: boolean
}

export type StaffMemberAttendanceHistoryItem = {
  date: string
  offlineCheckedIn: boolean
  mileageQualified: boolean
  attended: boolean
}

const STAFF_ATTENDANCE_HISTORY_LOOKBACK_DAYS = 120

/** 관리자·강사 — 회원이 출석한 날짜 목록 */
export async function staffListMemberAttendanceHistory(input: {
  memberId: string
}): Promise<
  | {
      ok: true
      memberId: string
      memberName: string
      today: string
      items: StaffMemberAttendanceHistoryItem[]
    }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user || !isStaffAttendanceManager(user.role)) {
    return { ok: false, error: '관리자 또는 강사만 확인할 수 있습니다.' }
  }

  const memberId = input.memberId.trim()
  if (!memberId) return { ok: false, error: '회원 정보가 없습니다.' }

  const supabase = await attendanceDb()
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, name')
    .eq('id', memberId)
    .maybeSingle()

  if (memberError || !member) {
    return { ok: false, error: '회원을 찾을 수 없습니다.' }
  }

  const today = getKstDateKey()
  const lookbackStart = shiftDateKey(today, -STAFF_ATTENDANCE_HISTORY_LOOKBACK_DAYS)

  const { data: logs, error: logsError } = await supabase
    .from('running_league_mileage_logs')
    .select('distance_km, notes, logged_at')
    .eq('member_id', memberId)
    .gte('logged_at', lookbackStart)
    .lte('logged_at', today)
    .order('logged_at', { ascending: false })

  if (logsError) {
    return { ok: false, error: '출석 기록을 불러오지 못했습니다.' }
  }

  const byDate = new Map<
    string,
    { offlineCheckedIn: boolean; mileageQualified: boolean }
  >()

  for (const row of logs ?? []) {
    const date = normalizeTrainingScheduleDate(String(row.logged_at ?? ''))
    if (!date) continue
    const current = byDate.get(date) ?? {
      offlineCheckedIn: false,
      mileageQualified: false,
    }
    if (isOfflineClassAttendanceLog(row)) {
      current.offlineCheckedIn = true
    } else if (isMileageLogAttendanceQualified(Number(row.distance_km ?? 0))) {
      current.mileageQualified = true
    }
    byDate.set(date, current)
  }

  const items = [...byDate.entries()]
    .filter(([, value]) => value.offlineCheckedIn || value.mileageQualified)
    .map(([date, value]) => ({
      date,
      offlineCheckedIn: value.offlineCheckedIn,
      mileageQualified: value.mileageQualified,
      attended: true,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  return {
    ok: true,
    memberId: member.id,
    memberName: member.name?.trim() || '회원',
    today,
    items,
  }
}

/** 관리자·강사 — 회원 특정 날짜 출석 상태 */
export async function staffGetMemberDayAttendance(input: {
  memberId: string
  date: string
}): Promise<
  | { ok: true; status: StaffMemberDayAttendanceStatus }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user || !isStaffAttendanceManager(user.role)) {
    return { ok: false, error: '관리자 또는 강사만 확인할 수 있습니다.' }
  }

  const date = normalizeTrainingScheduleDate(input.date)
  if (!date) return { ok: false, error: '날짜가 올바르지 않습니다.' }

  const supabase = await attendanceDb()
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, name')
    .eq('id', input.memberId)
    .maybeSingle()

  if (memberError || !member) {
    return { ok: false, error: '회원을 찾을 수 없습니다.' }
  }

  const { data: logs, error: logsError } = await supabase
    .from('running_league_mileage_logs')
    .select('distance_km, notes, logged_at')
    .eq('member_id', input.memberId)
    .eq('logged_at', date)

  if (logsError) {
    return { ok: false, error: '출석 기록을 불러오지 못했습니다.' }
  }

  const rows = logs ?? []
  const offlineCheckedIn = rows.some((row) => isOfflineClassAttendanceLog(row))
  const mileageQualified = rows.some(
    (row) =>
      !isOfflineClassAttendanceLog(row) &&
      isMileageLogAttendanceQualified(Number(row.distance_km ?? 0)),
  )

  return {
    ok: true,
    status: {
      date,
      memberId: member.id,
      memberName: member.name?.trim() || '회원',
      offlineCheckedIn,
      mileageQualified,
      attended: offlineCheckedIn || mileageQualified,
    },
  }
}

/**
 * 관리자·강사 — 회원 특정 날짜 오프라인 출석 처리/취소
 * (참여 신청 없이도 출석왕 반영용 출석 로그를 넣을 수 있음)
 */
export async function staffSetMemberOfflineAttendance(input: {
  memberId: string
  date: string
  attended: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user || !isStaffAttendanceManager(user.role)) {
    return { ok: false, error: '관리자 또는 강사만 출석을 수정할 수 있습니다.' }
  }

  const date = normalizeTrainingScheduleDate(input.date)
  if (!date) return { ok: false, error: '날짜가 올바르지 않습니다.' }

  const supabase = await attendanceDb()
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, name, primary_instructor_id')
    .eq('id', input.memberId)
    .maybeSingle()

  if (memberError || !member) {
    return { ok: false, error: '회원을 찾을 수 없습니다.' }
  }

  const weekday = weekdayFromDateKey(date)

  if (!input.attended) {
    await clearOfflineClassAttendanceForDate({
      memberId: member.id,
      scheduleDate: date,
    })
    await clearCenterTrainingScheduleAttendance({
      memberId: member.id,
      weekday,
      scheduleDate: date,
      audience: 'adult_running',
    })

    const ensured = await ensurePortalParticipantForMember(member.id)
    if (ensured.ok) {
      try {
        await syncPortalParticipantMileage(ensured.participant.id)
      } catch (error) {
        console.error('staffSetMemberOfflineAttendance.syncClear', error)
      }
    }

    revalidatePath('/dashboard/my')
    revalidatePath('/dashboard/my/running-league')
    revalidatePath('/dashboard/running-portal')
    revalidatePath('/dashboard/running-portal/league')
    revalidatePath(`/dashboard/members/${member.id}/running-portal`)
    return { ok: true }
  }

  const result = await recordOfflineClassAttendanceForMember({
    memberId: member.id,
    scheduleDate: date,
    checkedInBy: user.id,
    weekday,
  })
  if (!result.ok) return result

  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/my/running-league')
  revalidatePath('/dashboard/running-portal')
  revalidatePath('/dashboard/running-portal/league')
  revalidatePath(`/dashboard/members/${member.id}/running-portal`)
  return { ok: true }
}
