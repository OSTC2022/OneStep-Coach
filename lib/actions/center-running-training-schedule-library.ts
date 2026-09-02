'use server'

import { requireRole } from '@/lib/actions/auth'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { CENTER_TRAINING_SCHEDULE_ATTENDANCE_NOTE } from '@/lib/running-league/center-training-schedule-attendance'
import {
  formatTrainingScheduleDateLabel,
  normalizeTrainingScheduleDate,
  trainingSignupMatchesScheduleDate,
  type RunningLeagueTrainingScheduleDayInput,
  type RunningLeagueTrainingScheduleSignup,
} from '@/lib/running-league/training-schedule'

export type CenterTrainingScheduleWeekSnapshot = {
  id: string
  week_start_date: string | null
  label: string
  saved_at: string
  days: RunningLeagueTrainingScheduleDayInput[]
}

export type CenterTrainingScheduleLocationPreset = {
  id: string
  location_label: string
  naver_map_url: string
  saved_at: string
}

export type CenterTrainingScheduleLibrary = {
  tableReady: boolean
  weekSnapshots: CenterTrainingScheduleWeekSnapshot[]
  locationPresets: CenterTrainingScheduleLocationPreset[]
}

async function libraryClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function isMissingLibraryTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = error.message?.toLowerCase() ?? ''
  return message.includes('center_running_training_schedule_week_snapshots') ||
    message.includes('center_running_training_schedule_location_presets')
}

function normalizeSnapshotSignups(raw: unknown): RunningLeagueTrainingScheduleSignup[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const memberId = typeof row.member_id === 'string' ? row.member_id.trim() : ''
      if (!memberId) return null
      return {
        member_id: memberId,
        member_name:
          typeof row.member_name === 'string' && row.member_name.trim()
            ? row.member_name.trim()
            : '회원',
        signed_at:
          typeof row.signed_at === 'string' && row.signed_at
            ? row.signed_at
            : new Date(0).toISOString(),
      }
    })
    .filter((item): item is RunningLeagueTrainingScheduleSignup => item != null)
}

function normalizeSnapshotDays(raw: unknown): RunningLeagueTrainingScheduleDayInput[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const weekday = Number(row.weekday)
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null
      const signups = normalizeSnapshotSignups(row.signups)
      return {
        weekday: weekday as RunningLeagueTrainingScheduleDayInput['weekday'],
        training_summary: String(row.training_summary ?? ''),
        location_label: String(row.location_label ?? ''),
        naver_map_url: String(row.naver_map_url ?? ''),
        is_hidden: Boolean(row.is_hidden),
        schedule_date:
          typeof row.schedule_date === 'string' ? row.schedule_date.slice(0, 10) : null,
        ...(signups.length > 0 ? { signups } : {}),
      }
    })
    .filter((day): day is RunningLeagueTrainingScheduleDayInput => day != null)
    .sort((a, b) => a.weekday - b.weekday)
}

function formatWeekSnapshotLabel(
  days: RunningLeagueTrainingScheduleDayInput[],
  weekStartDate: string | null,
): string {
  const dated = days
    .filter((day) => day.schedule_date)
    .sort((a, b) => a.weekday - b.weekday)

  if (dated.length > 0) {
    const start = formatTrainingScheduleDateLabel(dated[0].schedule_date)
    const end = formatTrainingScheduleDateLabel(dated[dated.length - 1].schedule_date)
    if (start && end) return `${start} ~ ${end}`
  }

  if (weekStartDate) {
    const monday = formatTrainingScheduleDateLabel(weekStartDate)
    if (monday) return `${monday} 주차`
  }

  return '저장된 주간 스케줄'
}

function serializeSnapshotDays(
  days: RunningLeagueTrainingScheduleDayInput[],
): RunningLeagueTrainingScheduleDayInput[] {
  return days.map((day) => ({
    weekday: day.weekday,
    training_summary: day.training_summary?.trim() ?? '',
    location_label: day.location_label?.trim() ?? '',
    naver_map_url: day.naver_map_url?.trim() ?? '',
    is_hidden: Boolean(day.is_hidden),
    schedule_date: day.schedule_date?.trim().slice(0, 10) || null,
    ...(day.signups && day.signups.length > 0
      ? {
          signups: day.signups.map((signup) => ({
            member_id: signup.member_id,
            member_name: signup.member_name,
            signed_at: signup.signed_at,
          })),
        }
      : {}),
  }))
}

async function attachSignupsToSnapshotDays(
  days: RunningLeagueTrainingScheduleDayInput[],
): Promise<RunningLeagueTrainingScheduleDayInput[]> {
  const dates = [
    ...new Set(
      days
        .map((day) => normalizeTrainingScheduleDate(day.schedule_date))
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  if (dates.length === 0) return days

  const supabase = await libraryClient()
  const weekdays = days.map((day) => day.weekday)

  let signupSelect =
    'id, weekday, member_id, created_at, schedule_date, member:members(name)'
  let signupResult = await supabase
    .from('center_running_training_schedule_signups')
    .select(signupSelect)
    .in('weekday', weekdays)
    .order('created_at', { ascending: true })

  if (
    signupResult.error &&
    (signupResult.error.message?.includes('schedule_date') ||
      signupResult.error.code === '42703')
  ) {
    signupSelect = 'id, weekday, member_id, created_at, member:members(name)'
    signupResult = await supabase
      .from('center_running_training_schedule_signups')
      .select(signupSelect)
      .in('weekday', weekdays)
      .order('created_at', { ascending: true })
  }

  if (signupResult.error) {
    console.error('attachSignupsToSnapshotDays', signupResult.error)
  }

  type SignupRow = {
    weekday: number
    member_id: string
    created_at: string
    schedule_date?: string | null
    member: { name: string } | { name: string }[] | null
  }

  const rows = (signupResult.data ?? []) as SignupRow[]

  const attendanceResult = await supabase
    .from('lesson_sessions')
    .select('member_id, session_date, checked_in_at, member:members(name)')
    .eq('notes', CENTER_TRAINING_SCHEDULE_ATTENDANCE_NOTE)
    .in('session_date', dates)

  if (attendanceResult.error) {
    console.error('attachSignupsToSnapshotDays.attendance', attendanceResult.error)
  }

  const attendanceByDate = new Map<string, RunningLeagueTrainingScheduleSignup[]>()
  for (const row of attendanceResult.data ?? []) {
    const sessionDate = normalizeTrainingScheduleDate(row.session_date)
    if (!sessionDate || !row.member_id) continue
    const memberRaw = row.member as { name?: string } | { name?: string }[] | null
    const memberName = Array.isArray(memberRaw) ? memberRaw[0]?.name : memberRaw?.name
    const list = attendanceByDate.get(sessionDate) ?? []
    list.push({
      member_id: row.member_id,
      member_name: memberName?.trim() || '회원',
      signed_at:
        typeof row.checked_in_at === 'string' && row.checked_in_at
          ? row.checked_in_at
          : new Date(0).toISOString(),
    })
    attendanceByDate.set(sessionDate, list)
  }

  return days.map((day) => {
    const dayDate = normalizeTrainingScheduleDate(day.schedule_date)
    const matched = rows.filter(
      (row) =>
        row.weekday === day.weekday &&
        trainingSignupMatchesScheduleDate(
          row.schedule_date,
          dayDate,
          row.created_at,
        ),
    )

    const fromLive: RunningLeagueTrainingScheduleSignup[] = matched.map((row) => {
      const memberRaw = row.member
      const memberName = Array.isArray(memberRaw) ? memberRaw[0]?.name : memberRaw?.name
      return {
        member_id: row.member_id,
        member_name: memberName?.trim() || '회원',
        signed_at: row.created_at,
      }
    })

    const fromAttendance = dayDate ? (attendanceByDate.get(dayDate) ?? []) : []
    const existing = day.signups ?? []

    const byMember = new Map<string, RunningLeagueTrainingScheduleSignup>()
    for (const signup of [...existing, ...fromAttendance, ...fromLive]) {
      if (!signup.member_id) continue
      byMember.set(signup.member_id, signup)
    }
    const signups = Array.from(byMember.values()).sort((a, b) =>
      a.signed_at.localeCompare(b.signed_at),
    )

    if (signups.length === 0) return day
    return { ...day, signups }
  })
}

export async function fetchCenterTrainingScheduleLibrary(): Promise<CenterTrainingScheduleLibrary> {
  await requireRole(['admin'])
  const supabase = await libraryClient()

  const [snapshotsResult, presetsResult] = await Promise.all([
    supabase
      .from('center_running_training_schedule_week_snapshots')
      .select('id, week_start_date, days, saved_at')
      .order('saved_at', { ascending: false })
      .limit(20),
    supabase
      .from('center_running_training_schedule_location_presets')
      .select('id, location_label, naver_map_url, saved_at')
      .order('saved_at', { ascending: false })
      .limit(30),
  ])

  if (
    isMissingLibraryTableError(snapshotsResult.error) ||
    isMissingLibraryTableError(presetsResult.error)
  ) {
    return { tableReady: false, weekSnapshots: [], locationPresets: [] }
  }

  if (snapshotsResult.error) {
    console.error('fetchCenterTrainingScheduleLibrary.snapshots', snapshotsResult.error)
  }
  if (presetsResult.error) {
    console.error('fetchCenterTrainingScheduleLibrary.presets', presetsResult.error)
  }

  const weekSnapshots: CenterTrainingScheduleWeekSnapshot[] = (snapshotsResult.data ?? []).map(
    (row) => {
      const days = normalizeSnapshotDays(row.days)
      const weekStart = row.week_start_date?.slice(0, 10) ?? null
      return {
        id: row.id,
        week_start_date: weekStart,
        label: formatWeekSnapshotLabel(days, weekStart),
        saved_at: row.saved_at,
        days,
      }
    },
  )

  const locationPresets: CenterTrainingScheduleLocationPreset[] = (
    presetsResult.data ?? []
  ).map((row) => ({
    id: row.id,
    location_label: row.location_label?.trim() ?? '',
    naver_map_url: row.naver_map_url?.trim() ?? '',
    saved_at: row.saved_at,
  }))

  return { tableReady: true, weekSnapshots, locationPresets }
}

export async function fetchCenterTrainingScheduleWeekSnapshotsByStarts(
  weekStartDates: string[],
): Promise<Map<string, RunningLeagueTrainingScheduleDayInput[]>> {
  const unique = [
    ...new Set(
      weekStartDates
        .map((value) => value.trim().slice(0, 10))
        .filter(Boolean),
    ),
  ]
  const result = new Map<string, RunningLeagueTrainingScheduleDayInput[]>()
  if (unique.length === 0) return result

  const supabase = await libraryClient()
  const { data, error } = await supabase
    .from('center_running_training_schedule_week_snapshots')
    .select('week_start_date, days, saved_at')
    .in('week_start_date', unique)
    .order('saved_at', { ascending: false })

  if (error) {
    if (!isMissingLibraryTableError(error)) {
      console.error('fetchCenterTrainingScheduleWeekSnapshotsByStarts', error)
    }
    return result
  }

  for (const row of data ?? []) {
    const weekStart = row.week_start_date?.slice(0, 10)
    if (!weekStart || result.has(weekStart)) continue
    result.set(weekStart, normalizeSnapshotDays(row.days))
  }

  return result
}

export async function saveCenterTrainingScheduleWeekSnapshot(
  days: RunningLeagueTrainingScheduleDayInput[],
): Promise<void> {
  const supabase = await libraryClient()
  const withSignups = await attachSignupsToSnapshotDays(days)
  const normalized = serializeSnapshotDays(withSignups)
  const weekStartDate = normalized.find((day) => day.weekday === 0)?.schedule_date ?? null
  const now = new Date().toISOString()

  if (weekStartDate) {
    const { data: existing, error: existingError } = await supabase
      .from('center_running_training_schedule_week_snapshots')
      .select('id')
      .eq('week_start_date', weekStartDate)
      .maybeSingle()

    if (existingError && !isMissingLibraryTableError(existingError)) {
      console.error('saveCenterTrainingScheduleWeekSnapshot.lookup', existingError)
      return
    }

    if (existing?.id) {
      const { error } = await supabase
        .from('center_running_training_schedule_week_snapshots')
        .update({
          days: normalized,
          saved_at: now,
        })
        .eq('id', existing.id)

      if (error && !isMissingLibraryTableError(error)) {
        console.error('saveCenterTrainingScheduleWeekSnapshot.update', error)
      }
      return
    }
  }

  const { error } = await supabase.from('center_running_training_schedule_week_snapshots').insert({
    week_start_date: weekStartDate,
    days: normalized,
    saved_at: now,
  })

  if (error && !isMissingLibraryTableError(error)) {
    console.error('saveCenterTrainingScheduleWeekSnapshot.insert', error)
  }
}

export async function saveCenterTrainingScheduleLocationPreset(input: {
  location_label: string
  naver_map_url: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['admin'])

  const locationLabel = input.location_label.trim()
  const naverMapUrl = input.naver_map_url.trim()

  if (!locationLabel) {
    return { ok: false, error: '장소 이름을 입력해주세요.' }
  }

  const supabase = await libraryClient()
  const { error } = await supabase.from('center_running_training_schedule_location_presets').upsert(
    {
      location_label: locationLabel,
      naver_map_url: naverMapUrl,
      saved_at: new Date().toISOString(),
    },
    { onConflict: 'location_label,naver_map_url' },
  )

  if (isMissingLibraryTableError(error)) {
    return {
      ok: false,
      error:
        '장소 저장 테이블이 없습니다. add-center-running-training-schedule-library.sql을 실행해주세요.',
    }
  }
  if (error) {
    console.error('saveCenterTrainingScheduleLocationPreset', error)
    return { ok: false, error: '장소 저장에 실패했습니다.' }
  }

  return { ok: true }
}

export async function deleteCenterTrainingScheduleLocationPreset(
  presetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const supabase = await libraryClient()

  const { error } = await supabase
    .from('center_running_training_schedule_location_presets')
    .delete()
    .eq('id', presetId)

  if (error) {
    console.error('deleteCenterTrainingScheduleLocationPreset', error)
    return { ok: false, error: '장소 삭제에 실패했습니다.' }
  }

  return { ok: true }
}
