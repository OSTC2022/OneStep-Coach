'use server'

import {
  clearOfflineClassAttendanceForDate,
  recordOfflineClassAttendanceForMember,
} from '@/lib/actions/offline-class-attendance'
import { clearCenterTrainingScheduleAttendance } from '@/lib/actions/center-training-schedule-attendance'
import { getCurrentUser, requireRole } from '@/lib/actions/auth'
import { getRunningPortalMemberForCurrentUser } from '@/lib/actions/staff-running-portal-member'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { trainingScheduleAttendanceNotesForQuery } from '@/lib/running-league/center-training-schedule-attendance'
import {
  createEmptyTrainingScheduleDays,
  formatTrainingScheduleDateLabel,
  getKstTrainingWeekMondayDateKey,
  getMondayDateKeyForDateKey,
  getTrainingWeekStartFromDays,
  addDaysToDateKey,
  normalizeTrainingScheduleDate,
  propagateTrainingWeekDatesFromMonday,
  resolveTrainingScheduleMapHref,
  shouldResetCenterTrainingSignups,
  trainingSignupMatchesScheduleDate,
  trainingWeekdayLabel,
  type RunningLeagueTrainingScheduleDayInput,
  type RunningLeagueTrainingScheduleDayView,
  type RunningLeagueTrainingScheduleSignup,
  type TrainingWeekday,
} from '@/lib/running-league/training-schedule'
import {
  fetchCenterTrainingScheduleWeekSnapshotsByStarts,
  saveCenterTrainingScheduleWeekSnapshot,
} from '@/lib/actions/center-running-training-schedule-library'
import {
  parseTrainingScheduleDayId,
  trainingScheduleConfig,
  trainingScheduleDayId,
  type TrainingScheduleAudience,
} from '@/lib/training-schedule-audience'
import {
  isTrainingScheduleSignupClosed,
  trainingScheduleSignupClosedMessage,
} from '@/lib/running-league/training-schedule-signup-deadline'
import { isYouthAthleticsClassSport } from '@/lib/youth-athletics-class'
import { memberMatchesTrainingScheduleAudience } from '@/lib/running-league/training-schedule-audience-match'
import type { MemberPickerOption } from '@/lib/actions/members'
import { getMembers } from '@/lib/actions/members'
import { revalidatePath } from 'next/cache'

async function fetchMemberSportsById(
  supabase: Awaited<ReturnType<typeof scheduleClient>>,
  memberIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  const unique = [...new Set(memberIds.filter(Boolean))]
  if (unique.length === 0) return map

  const { data, error } = await supabase
    .from('members')
    .select('id, sport')
    .in('id', unique)

  if (error) {
    console.error('fetchMemberSportsById', error)
    return map
  }

  for (const row of data ?? []) {
    if (!row.id) continue
    map.set(String(row.id), typeof row.sport === 'string' ? row.sport : null)
  }
  return map
}

const CENTER_SCHEDULE_DAY_SELECT =
  'weekday, training_summary, location_label, naver_map_url, is_hidden, schedule_date, created_at, updated_at'

const CENTER_SCHEDULE_DAY_SELECT_LEGACY =
  'weekday, training_summary, location_label, naver_map_url, is_hidden, created_at, updated_at'

function isMissingColumnError(
  error: { code?: string; message?: string } | null,
  column = 'schedule_date',
): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  const message = error.message?.toLowerCase() ?? ''
  return (
    message.includes('could not find') &&
    message.includes('column') &&
    (column === '*' || message.includes(column.toLowerCase()))
  )
}

type CenterScheduleDayUpsertRow = {
  weekday: number
  training_summary: string
  location_label: string
  naver_map_url: string | null
  is_hidden: boolean
  schedule_date: string | null
  updated_at: string
}

function stripScheduleDateFromRows(
  rows: CenterScheduleDayUpsertRow[],
): Omit<CenterScheduleDayUpsertRow, 'schedule_date'>[] {
  return rows.map(({ schedule_date: _scheduleDate, ...row }) => row)
}

function formatSaveScheduleError(error: { message?: string }): string {
  const message = error.message?.toLowerCase() ?? ''
  if (
    message.includes('row-level security') ||
    message.includes('permission denied')
  ) {
    return '저장 권한이 없습니다. 관리자 계정인지 확인하거나 SUPABASE_SERVICE_ROLE_KEY 설정을 확인해주세요.'
  }
  if (isMissingColumnError(error)) {
    return '요일 날짜 컬럼이 DB에 없습니다. Supabase SQL Editor에서 add-center-running-training-schedule-dates.sql을 실행한 뒤 다시 저장해주세요.'
  }
  return '스케줄 저장에 실패했습니다.'
}

async function fetchCenterScheduleDayRows(
  supabase: Awaited<ReturnType<typeof scheduleClient>>,
  audience: TrainingScheduleAudience = 'adult_running',
) {
  const daysTable = trainingScheduleConfig(audience).daysTable
  const primary = await supabase
    .from(daysTable)
    .select(CENTER_SCHEDULE_DAY_SELECT)
    .order('weekday', { ascending: true })

  if (!isMissingColumnError(primary.error)) {
    return primary
  }

  return supabase
    .from(daysTable)
    .select(CENTER_SCHEDULE_DAY_SELECT_LEGACY)
    .order('weekday', { ascending: true })
}

type CenterScheduleDayRow = {
  weekday: number
  training_summary: string
  location_label: string
  naver_map_url: string | null
  is_hidden: boolean
  schedule_date?: string | null
}

type CenterSignupRow = {
  id: string
  weekday: number
  member_id: string
  created_at: string
  schedule_date?: string | null
  member: { name: string } | { name: string }[] | null
}

export type CenterRunningTrainingScheduleBundle = {
  days: RunningLeagueTrainingScheduleDayView[]
  /** 직전 주 (스냅샷). 없으면 빈 배열 */
  previousWeekDays: RunningLeagueTrainingScheduleDayView[]
  /**
   * 다음 주 미리보기 — 관리자가 다음 주로 저장한 경우
   * (이번 주와 동시에 펼치지 않고, UI에서 칸을 눌러 확인)
   */
  nextWeekDays?: RunningLeagueTrainingScheduleDayView[]
  weekStartDate: string | null
  previousWeekStartDate: string | null
  nextWeekStartDate?: string | null
  tableReady: boolean
}

function centerDayId(
  weekday: number,
  scheduleDate?: string | null,
  audience: TrainingScheduleAudience = 'adult_running',
): string {
  return trainingScheduleDayId(
    audience,
    weekday,
    normalizeTrainingScheduleDate(scheduleDate),
  )
}

function parseCenterDayId(id: string): {
  audience: TrainingScheduleAudience
  weekday: number
  scheduleDate: string | null
} | null {
  return parseTrainingScheduleDayId(id)
}

async function scheduleClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function isMissingTableError(error: { code?: string } | null): boolean {
  return error?.code === '42P01'
}

function revalidateCenterTrainingSchedulePaths() {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/my/running-league')
  revalidatePath('/dashboard/settings/running-schedule')
  revalidatePath('/dashboard/settings/youth-athletics-schedule')
}

function mapSignupRow(row: CenterSignupRow): RunningLeagueTrainingScheduleSignup {
  const memberRaw = row.member
  const memberName = Array.isArray(memberRaw) ? memberRaw[0]?.name : memberRaw?.name
  return {
    member_id: row.member_id,
    member_name: memberName?.trim() || '회원',
    signed_at: row.created_at,
  }
}

function buildCenterDayView(
  row: CenterScheduleDayRow,
  signups: RunningLeagueTrainingScheduleSignup[],
  currentMemberId: string | null,
  audience: TrainingScheduleAudience = 'adult_running',
): RunningLeagueTrainingScheduleDayView {
  const weekday = row.weekday as TrainingWeekday
  const scheduleDate = row.schedule_date?.slice(0, 10) ?? null
  return {
    id: centerDayId(weekday, scheduleDate, audience),
    league_id: '',
    weekday,
    weekday_label: trainingWeekdayLabel(weekday),
    schedule_date: scheduleDate,
    schedule_date_label: formatTrainingScheduleDateLabel(scheduleDate),
    training_summary: row.training_summary ?? '',
    location_label: row.location_label ?? '',
    naver_map_url: row.naver_map_url,
    map_href: resolveTrainingScheduleMapHref({
      naver_map_url: row.naver_map_url,
      location_label: row.location_label ?? '',
    }),
    is_hidden: Boolean(row.is_hidden),
    signup_count: signups.length,
    signups,
    is_signed_up:
      currentMemberId != null
        ? signups.some((signup) => signup.member_id === currentMemberId)
        : false,
  }
}

function buildCenterDayViewFromInput(
  day: RunningLeagueTrainingScheduleDayInput,
  signups: RunningLeagueTrainingScheduleSignup[],
  currentMemberId: string | null,
  audience: TrainingScheduleAudience = 'adult_running',
): RunningLeagueTrainingScheduleDayView {
  return buildCenterDayView(
    {
      weekday: day.weekday,
      training_summary: day.training_summary,
      location_label: day.location_label,
      naver_map_url: day.naver_map_url?.trim() || null,
      is_hidden: day.is_hidden,
      schedule_date: day.schedule_date,
    },
    signups,
    currentMemberId,
    audience,
  )
}

function emptyPortalBundle(tableReady: boolean): CenterRunningTrainingScheduleBundle {
  return {
    days: [],
    previousWeekDays: [],
    nextWeekDays: [],
    weekStartDate: null,
    previousWeekStartDate: null,
    nextWeekStartDate: null,
    tableReady,
  }
}

function isVotableCenterDay(day: {
  is_hidden: boolean
  training_summary: string | null
}): boolean {
  return !day.is_hidden && Boolean(day.training_summary?.trim())
}

/** 같은 주 내용 변경 시에만 — 해당 주 날짜의 참여만 지우고 다른 주 기록은 유지 */
async function clearCenterTrainingScheduleSignupsForWeekDates(
  supabase: Awaited<ReturnType<typeof scheduleClient>>,
  days: Array<{ schedule_date?: string | null }>,
  audience: TrainingScheduleAudience = 'adult_running',
) {
  const signupsTable = trainingScheduleConfig(audience).signupsTable
  const dates = [
    ...new Set(
      days
        .map((day) => normalizeTrainingScheduleDate(day.schedule_date))
        .filter((value): value is string => Boolean(value)),
    ),
  ]

  if (dates.length > 0) {
    const { error } = await supabase
      .from(signupsTable)
      .delete()
      .in('schedule_date', dates)

    if (error && !isMissingTableError(error)) {
      console.error('clearCenterTrainingScheduleSignupsForWeekDates', error)
    }
    return
  }

  // 날짜 컬럼 없는 레거시 — null schedule_date만 삭제 (날짜 있는 과거 주 보존)
  const { error } = await supabase
    .from(signupsTable)
    .delete()
    .is('schedule_date', null)

  if (error && !isMissingTableError(error)) {
    console.error('clearCenterTrainingScheduleSignupsForWeekDates.null', error)
  }
}

function filterSignupsForDay(
  rawRows: CenterSignupRow[],
  scheduleDate: string | null,
): RunningLeagueTrainingScheduleSignup[] {
  return rawRows
    .filter((row) =>
      trainingSignupMatchesScheduleDate(
        row.schedule_date,
        scheduleDate,
        row.created_at,
      ),
    )
    .map((row) => mapSignupRow(row))
}

function mergeTrainingSignups(
  ...groups: RunningLeagueTrainingScheduleSignup[][]
): RunningLeagueTrainingScheduleSignup[] {
  const byMember = new Map<string, RunningLeagueTrainingScheduleSignup>()
  for (const group of groups) {
    for (const signup of group) {
      if (!signup.member_id) continue
      byMember.set(signup.member_id, signup)
    }
  }
  return Array.from(byMember.values()).sort((a, b) =>
    a.signed_at.localeCompare(b.signed_at),
  )
}

function weekDatesFromMonday(weekStart: string | null): string[] {
  if (!weekStart) return []
  return propagateTrainingWeekDatesFromMonday(
    createEmptyTrainingScheduleDays(),
    weekStart,
  )
    .map((day) => normalizeTrainingScheduleDate(day.schedule_date))
    .filter((value): value is string => Boolean(value))
}

/** 훈련 스케줄 참여 시 남긴 출석 기록 — 성인/육상 notes 로 분리 조회 */
async function fetchTrainingSignupsFromAttendance(
  supabase: Awaited<ReturnType<typeof scheduleClient>>,
  dates: string[],
  audience: TrainingScheduleAudience = 'adult_running',
): Promise<Map<string, RunningLeagueTrainingScheduleSignup[]>> {
  const result = new Map<string, RunningLeagueTrainingScheduleSignup[]>()
  const uniqueDates = [...new Set(dates.filter(Boolean))]
  if (uniqueDates.length === 0) return result

  const notes = trainingScheduleAttendanceNotesForQuery(audience)
  const { data, error } = await supabase
    .from('lesson_sessions')
    .select('member_id, session_date, checked_in_at, member:members(name)')
    .in('notes', notes)
    .in('session_date', uniqueDates)

  if (error) {
    console.error('fetchTrainingSignupsFromAttendance', error)
    return result
  }

  for (const row of data ?? []) {
    const sessionDate = normalizeTrainingScheduleDate(row.session_date)
    if (!sessionDate || !row.member_id) continue
    const memberRaw = row.member as { name?: string } | { name?: string }[] | null
    const memberName = Array.isArray(memberRaw) ? memberRaw[0]?.name : memberRaw?.name
    const list = result.get(sessionDate) ?? []
    list.push({
      member_id: row.member_id,
      member_name: memberName?.trim() || '회원',
      signed_at:
        typeof row.checked_in_at === 'string' && row.checked_in_at
          ? row.checked_in_at
          : new Date(0).toISOString(),
    })
    result.set(sessionDate, list)
  }

  for (const [date, list] of result) {
    result.set(date, mergeTrainingSignups(list))
  }

  return result
}

export async function fetchCenterRunningTrainingSchedule(
  currentMemberId: string | null = null,
  options: {
    includeHidden?: boolean
    portalWeeks?: boolean
    audience?: TrainingScheduleAudience
  } = {},
): Promise<CenterRunningTrainingScheduleBundle> {
  const supabase = await scheduleClient()
  const includeHidden = options.includeHidden ?? false
  const portalWeeks = options.portalWeeks ?? true
  const audience = options.audience ?? 'adult_running'
  const tables = trainingScheduleConfig(audience)

  const { data: dayRows, error: dayError } = await fetchCenterScheduleDayRows(
    supabase,
    audience,
  )

  if (isMissingTableError(dayError)) {
    return emptyPortalBundle(false)
  }
  if (dayError) {
    console.error('fetchCenterRunningTrainingSchedule.days', dayError)
    return emptyPortalBundle(true)
  }

  const liveRows = (dayRows ?? []) as CenterScheduleDayRow[]
  if (liveRows.length === 0) {
    return emptyPortalBundle(true)
  }

  const weekdays = liveRows.map((day) => day.weekday)
  let signupSelect =
    'id, weekday, member_id, created_at, schedule_date, member:members(name, sport)'
  let signupResult = await supabase
    .from(tables.signupsTable)
    .select(signupSelect)
    .in('weekday', weekdays)
    .order('created_at', { ascending: true })

  if (isMissingColumnError(signupResult.error, 'schedule_date')) {
    signupSelect = 'id, weekday, member_id, created_at, member:members(name, sport)'
    signupResult = await supabase
      .from(tables.signupsTable)
      .select(signupSelect)
      .in('weekday', weekdays)
      .order('created_at', { ascending: true })
  }

  const { data: signupRows, error: signupError } = signupResult

  if (signupError && !isMissingTableError(signupError)) {
    console.error('fetchCenterRunningTrainingSchedule.signups', signupError)
  }

  const signupsByWeekday = new Map<number, CenterSignupRow[]>()
  for (const row of (signupRows ?? []) as CenterSignupRow[]) {
    const list = signupsByWeekday.get(row.weekday) ?? []
    list.push(row)
    signupsByWeekday.set(row.weekday, list)
  }

  const liveWeekStart = getTrainingWeekStartFromDays(liveRows)
  const currentMonday = getKstTrainingWeekMondayDateKey()
  const previousMonday = addDaysToDateKey(currentMonday, -7)

  const snapshotsNeeded = portalWeeks
    ? [currentMonday, previousMonday].filter((weekStart) => weekStart !== liveWeekStart)
    : []
  const snapshots = portalWeeks
    ? await fetchCenterTrainingScheduleWeekSnapshotsByStarts(snapshotsNeeded, audience)
    : new Map<string, RunningLeagueTrainingScheduleDayInput[]>()

  const attendanceDates = [
    ...weekDatesFromMonday(liveWeekStart),
    ...weekDatesFromMonday(currentMonday),
    ...weekDatesFromMonday(previousMonday),
  ]
  for (const snapshotDays of snapshots.values()) {
    for (const day of snapshotDays) {
      const date = normalizeTrainingScheduleDate(day.schedule_date)
      if (date) attendanceDates.push(date)
    }
  }

  // 육상 스케줄은 성인 출석 복원 합치기를 쓰지 않음 (반 섞임 방지)
  const attendanceByDate =
    audience === 'youth_athletics'
      ? new Map<string, RunningLeagueTrainingScheduleSignup[]>()
      : await fetchTrainingSignupsFromAttendance(supabase, attendanceDates, audience)

  const candidateMemberIds = new Set<string>()
  for (const rows of signupsByWeekday.values()) {
    for (const row of rows) candidateMemberIds.add(row.member_id)
  }
  for (const list of attendanceByDate.values()) {
    for (const signup of list) candidateMemberIds.add(signup.member_id)
  }
  for (const snapshotDays of snapshots.values()) {
    for (const day of snapshotDays) {
      for (const signup of day.signups ?? []) {
        candidateMemberIds.add(signup.member_id)
      }
    }
  }
  const sportsByMemberId = await fetchMemberSportsById(
    supabase,
    [...candidateMemberIds],
  )

  const resolveDaySignups = (
    weekday: number,
    dayDate: string | null,
    snapshotSignups: RunningLeagueTrainingScheduleSignup[] = [],
  ) =>
    mergeTrainingSignups(
      filterSignupsForDay(signupsByWeekday.get(weekday) ?? [], dayDate),
      snapshotSignups,
      dayDate ? (attendanceByDate.get(dayDate) ?? []) : [],
    ).filter((signup) =>
      memberMatchesTrainingScheduleAudience(
        sportsByMemberId.get(signup.member_id) ?? null,
        audience,
      ),
    )

  const buildViewsFromRows = (rows: CenterScheduleDayRow[]) =>
    rows
      .map((row) => {
        const dayDate = normalizeTrainingScheduleDate(row.schedule_date)
        const daySignups = resolveDaySignups(row.weekday, dayDate)
        return buildCenterDayView(row, daySignups, currentMemberId, audience)
      })
      .filter((day) => includeHidden || !day.is_hidden)

  const buildViewsFromInputs = (inputs: RunningLeagueTrainingScheduleDayInput[]) =>
    inputs
      .map((day) => {
        const dayDate = normalizeTrainingScheduleDate(day.schedule_date)
        const daySignups = resolveDaySignups(day.weekday, dayDate, day.signups ?? [])
        return buildCenterDayViewFromInput(day, daySignups, currentMemberId, audience)
      })
      .filter((day) => includeHidden || !day.is_hidden)

  const liveViews = buildViewsFromRows(liveRows)

  if (!portalWeeks) {
    return {
      days: liveViews,
      previousWeekDays: [],
      nextWeekDays: [],
      weekStartDate: liveWeekStart,
      previousWeekStartDate: liveWeekStart
        ? addDaysToDateKey(liveWeekStart, -7)
        : null,
      nextWeekStartDate: null,
      tableReady: true,
    }
  }

  const resolveWeekDays = (weekStart: string): RunningLeagueTrainingScheduleDayView[] => {
    if (liveWeekStart === weekStart) return liveViews
    const snapshotDays = snapshots.get(weekStart)
    if (snapshotDays && snapshotDays.length > 0) {
      return buildViewsFromInputs(snapshotDays)
    }
    return []
  }

  // 라이브가 미래 주로 넘어가도 이번 주는 스냅샷으로 유지 (토요에 다음 주 저장해도 일요 일정 유지)
  let currentWeekDays = resolveWeekDays(currentMonday)
  if (currentWeekDays.length === 0 && liveWeekStart && liveWeekStart <= currentMonday) {
    currentWeekDays = liveViews
  }

  const previousWeekDays = resolveWeekDays(previousMonday)

  // 관리자가 다음 주로 저장해 두면 미리보기 칸에만 노출 (이번 주와 동시 펼침 없음)
  const nextMonday = addDaysToDateKey(currentMonday, 7)
  const nextWeekDays =
    liveWeekStart === nextMonday && liveViews.length > 0 ? liveViews : []

  return {
    days: currentWeekDays,
    previousWeekDays,
    nextWeekDays,
    weekStartDate: currentWeekDays.length
      ? getTrainingWeekStartFromDays(currentWeekDays) ?? currentMonday
      : currentMonday,
    previousWeekStartDate: previousWeekDays.length
      ? getTrainingWeekStartFromDays(previousWeekDays) ?? previousMonday
      : previousMonday,
    nextWeekStartDate: nextWeekDays.length ? nextMonday : null,
    tableReady: true,
  }
}

export async function getCenterRunningTrainingScheduleForAdmin(
  audience: TrainingScheduleAudience = 'adult_running',
): Promise<{
  days: RunningLeagueTrainingScheduleDayInput[]
  tableReady: boolean
}> {
  await requireRole(['admin'])
  const bundle = await fetchCenterRunningTrainingSchedule(null, {
    includeHidden: true,
    portalWeeks: false,
    audience,
  })

  if (!bundle.tableReady) {
    return { days: createEmptyTrainingScheduleDays(), tableReady: false }
  }

  if (bundle.days.length === 0) {
    return { days: createEmptyTrainingScheduleDays(), tableReady: true }
  }

  return {
    tableReady: true,
    days: bundle.days.map((day) => ({
      weekday: day.weekday,
      training_summary: day.training_summary,
      location_label: day.location_label,
      naver_map_url: day.naver_map_url ?? '',
      is_hidden: day.is_hidden,
      schedule_date: day.schedule_date,
    })),
  }
}

export async function saveCenterRunningTrainingSchedule(
  days: RunningLeagueTrainingScheduleDayInput[],
  audience: TrainingScheduleAudience = 'adult_running',
): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const tables = trainingScheduleConfig(audience)

  const normalized: CenterScheduleDayUpsertRow[] = createEmptyTrainingScheduleDays().map(
    (emptyDay) => {
      const found = days.find((day) => day.weekday === emptyDay.weekday)
      return {
        weekday: emptyDay.weekday,
        training_summary: found?.training_summary?.trim() ?? '',
        location_label: found?.location_label?.trim() ?? '',
        naver_map_url: found?.naver_map_url?.trim() || null,
        is_hidden: Boolean(found?.is_hidden),
        schedule_date: found?.schedule_date?.trim().slice(0, 10) || null,
        updated_at: new Date().toISOString(),
      }
    },
  )

  const supabase = await scheduleClient()

  const { data: existingDayRows, error: existingDayError } =
    await fetchCenterScheduleDayRows(supabase, audience)
  if (existingDayError && !isMissingTableError(existingDayError)) {
    console.error('saveCenterRunningTrainingSchedule.existing', existingDayError)
  }

  const shouldResetSignups = shouldResetCenterTrainingSignups(
    (existingDayRows ?? []) as CenterScheduleDayRow[],
    normalized,
  )

  // 다음 주로 덮어쓰기 전에 현재 라이브 주를 스냅샷으로 보존 (일요일 일정 유실 방지)
  const existingWeekStart = getTrainingWeekStartFromDays(
    (existingDayRows ?? []) as CenterScheduleDayRow[],
  )
  const nextWeekStart = getTrainingWeekStartFromDays(normalized)
  if (
    existingWeekStart &&
    nextWeekStart &&
    existingWeekStart !== nextWeekStart &&
    (existingDayRows?.length ?? 0) > 0
  ) {
    await saveCenterTrainingScheduleWeekSnapshot(
      ((existingDayRows ?? []) as CenterScheduleDayRow[]).map((row) => ({
        weekday: row.weekday as TrainingWeekday,
        training_summary: row.training_summary ?? '',
        location_label: row.location_label ?? '',
        naver_map_url: row.naver_map_url ?? '',
        is_hidden: Boolean(row.is_hidden),
        schedule_date: normalizeTrainingScheduleDate(row.schedule_date),
      })),
      audience,
    )
  }

  let warning: string | undefined
  let result = await supabase
    .from(tables.daysTable)
    .upsert(normalized, { onConflict: 'weekday' })

  if (isMissingColumnError(result.error)) {
    const retry = await supabase
      .from(tables.daysTable)
      .upsert(stripScheduleDateFromRows(normalized), { onConflict: 'weekday' })

    if (!retry.error) {
      result = retry
      warning =
        '훈련 내용은 저장됐지만 요일 날짜는 DB 컬럼이 없어 저장되지 않았습니다. Supabase에서 add-center-running-training-schedule-dates.sql을 실행한 뒤 다시 저장해주세요.'
    } else {
      result = retry
    }
  }

  const { error } = result

  if (isMissingTableError(error)) {
    return {
      ok: false,
      error:
        '러닝 스케줄 테이블이 없습니다. ' +
        `${tables.missingSql} 을 실행해주세요.`,
    }
  }
  if (error) {
    console.error('saveCenterRunningTrainingSchedule', error)
    return { ok: false, error: formatSaveScheduleError(error) }
  }

  if (shouldResetSignups) {
    const existingStart = getTrainingWeekStartFromDays(
      (existingDayRows ?? []) as CenterScheduleDayRow[],
    )
    const nextStart = getTrainingWeekStartFromDays(normalized)
    // 주가 바뀌면 지난·이번 주 참여 기록은 유지. 같은 주 내용만 바뀌면 그 주 날짜만 초기화
    if (!existingStart || !nextStart || existingStart === nextStart) {
      await clearCenterTrainingScheduleSignupsForWeekDates(
        supabase,
        (existingDayRows ?? []) as CenterScheduleDayRow[],
        audience,
      )
    }
  }

  revalidateCenterTrainingSchedulePaths()
  revalidatePath(tables.settingsPath)
  await saveCenterTrainingScheduleWeekSnapshot(days, audience)
  return warning ? { ok: true, warning } : { ok: true }
}

export async function getCenterRunningTrainingScheduleForMember(
  audience?: TrainingScheduleAudience,
): Promise<CenterRunningTrainingScheduleBundle> {
  const member = await getRunningPortalMemberForCurrentUser()
  const resolvedAudience =
    audience ??
    (isYouthAthleticsClassSport(member?.sport) ? 'youth_athletics' : 'adult_running')
  return fetchCenterRunningTrainingSchedule(member?.id ?? null, {
    includeHidden: true,
    audience: resolvedAudience,
  })
}

export async function getCenterRunningTrainingScheduleAdminPreview(): Promise<CenterRunningTrainingScheduleBundle> {
  await requireRole(['admin'])
  return fetchCenterRunningTrainingSchedule(null, { includeHidden: true })
}

/** 캘린더·수업현황 툴바 팝업용 — admin/instructor */
export async function getCenterRunningTrainingScheduleForStaff(
  audience: TrainingScheduleAudience = 'adult_running',
): Promise<CenterRunningTrainingScheduleBundle> {
  await requireRole(['admin', 'instructor'])
  return fetchCenterRunningTrainingSchedule(null, { includeHidden: true, audience })
}

export async function toggleCenterRunningTrainingScheduleSignup(
  scheduleDayId: string,
): Promise<
  | { ok: true; signedUp: boolean; signupCount: number }
  | { ok: false; error: string }
> {
  const [member, user] = await Promise.all([getRunningPortalMemberForCurrentUser(), getCurrentUser()])
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const parsed = parseCenterDayId(scheduleDayId)
  if (parsed == null) return { ok: false, error: '스케줄을 찾을 수 없습니다.' }
  const { weekday, audience } = parsed
  const tables = trainingScheduleConfig(audience)

  if (!memberMatchesTrainingScheduleAudience(member.sport, audience)) {
    return {
      ok: false,
      error:
        audience === 'youth_athletics'
          ? '육상선수반 스케줄은 육상선수반 회원만 참여할 수 있습니다.'
          : '성인 러닝 스케줄은 육상선수반 회원이 참여할 수 없습니다.',
    }
  }

  const supabase = await scheduleClient()

  let dayResult = await supabase
    .from(tables.daysTable)
    .select('weekday, is_hidden, training_summary, schedule_date')
    .eq('weekday', weekday)
    .maybeSingle()

  if (isMissingColumnError(dayResult.error)) {
    dayResult = await supabase
      .from(tables.daysTable)
      .select('weekday, is_hidden, training_summary')
      .eq('weekday', weekday)
      .maybeSingle()
  }

  const { data: dayRow, error: dayError } = dayResult

  if (isMissingTableError(dayError)) {
    return { ok: false, error: '러닝 스케줄 기능이 준비되지 않았습니다.' }
  }
  if (dayError || !dayRow) {
    return { ok: false, error: '스케줄을 찾을 수 없습니다.' }
  }

  const liveScheduleDate = normalizeTrainingScheduleDate(
    (dayRow as { schedule_date?: string | null }).schedule_date,
  )
  const scheduleDate = parsed.scheduleDate ?? liveScheduleDate

  // 라이브가 다른 주여도(다음 주 선반영) 요청한 날짜의 스냅샷으로 운영 여부 확인
  let votable =
    isVotableCenterDay(dayRow) &&
    (!scheduleDate || !liveScheduleDate || liveScheduleDate === scheduleDate)

  if (!votable && scheduleDate) {
    const weekStart = getMondayDateKeyForDateKey(scheduleDate)
    const snapshots = await fetchCenterTrainingScheduleWeekSnapshotsByStarts(
      [weekStart],
      audience,
    )
    const snapshotDay = snapshots.get(weekStart)?.find((day) => day.weekday === weekday)
    if (snapshotDay) {
      votable = isVotableCenterDay(snapshotDay)
    }
  }

  if (!votable) {
    return { ok: false, error: '휴강 또는 미운영 요일입니다.' }
  }

  let existingQuery = supabase
    .from(tables.signupsTable)
    .select('id')
    .eq('weekday', weekday)
    .eq('member_id', member.id)

  if (scheduleDate) {
    existingQuery = existingQuery.eq('schedule_date', scheduleDate)
  } else {
    existingQuery = existingQuery.is('schedule_date', null)
  }

  const { data: existing, error: existingError } = await existingQuery.maybeSingle()

  if (existingError && !isMissingTableError(existingError)) {
    console.error('toggleCenterRunningTrainingScheduleSignup.existing', existingError)
    return { ok: false, error: '참여 상태를 확인하지 못했습니다.' }
  }

  if (existing) {
    // 참여 취소는 마감 후에도 항상 가능
    const { error: deleteError } = await supabase
      .from(tables.signupsTable)
      .delete()
      .eq('id', existing.id)

    if (deleteError) {
      console.error('toggleCenterRunningTrainingScheduleSignup.delete', deleteError)
      return { ok: false, error: '참여 취소에 실패했습니다.' }
    }

    if (audience === 'adult_running') {
      const attendanceResult = await clearCenterTrainingScheduleAttendance({
        memberId: member.id,
        weekday,
        scheduleDate,
        audience,
      })
      if (!attendanceResult.ok) {
        console.error(
          'toggleCenterRunningTrainingScheduleSignup.clearAttendance',
          attendanceResult.error,
        )
      }
      await clearOfflineClassAttendanceForDate({
        memberId: member.id,
        scheduleDate,
      })
    }
  } else {
    if (
      isTrainingScheduleSignupClosed({
        weekday,
        scheduleDate,
      })
    ) {
      return {
        ok: false,
        error: trainingScheduleSignupClosedMessage(weekday),
      }
    }

    const insertPayload: {
      weekday: number
      member_id: string
      schedule_date?: string | null
    } = {
      weekday,
      member_id: member.id,
    }
    if (scheduleDate) {
      insertPayload.schedule_date = scheduleDate
    }

    let insertResult = await supabase
      .from(tables.signupsTable)
      .insert(insertPayload)

    if (isMissingColumnError(insertResult.error, 'schedule_date')) {
      insertResult = await supabase
        .from(tables.signupsTable)
        .insert({
          weekday,
          member_id: member.id,
        })
    }

    const { error: insertError } = insertResult

    if (insertError) {
      console.error('toggleCenterRunningTrainingScheduleSignup.insert', insertError)
      return { ok: false, error: '참여 신청에 실패했습니다.' }
    }

    // 성인 오프라인 수업 참여 = 출석왕 1회 자동 반영 (마일리지 무관)
    if (audience === 'adult_running' && scheduleDate && user?.id) {
      const autoAttendance = await recordOfflineClassAttendanceForMember({
        memberId: member.id,
        scheduleDate,
        checkedInBy: user.id,
        weekday,
      })
      if (!autoAttendance.ok) {
        console.error(
          'toggleCenterRunningTrainingScheduleSignup.autoAttendance',
          autoAttendance.error,
        )
      }
    }
  }

  let countQuery = supabase
    .from(tables.signupsTable)
    .select('id', { count: 'exact', head: true })
    .eq('weekday', weekday)

  if (scheduleDate) {
    countQuery = countQuery.eq('schedule_date', scheduleDate)
  } else {
    countQuery = countQuery.is('schedule_date', null)
  }

  const { count, error: countError } = await countQuery

  if (countError) {
    console.error('toggleCenterRunningTrainingScheduleSignup.count', countError)
  }

  // 참여 토글은 클라이언트 낙관적 UI로 반영. revalidate하면 메뉴·스크롤이 초기화됨.
  if (scheduleDate) {
    const weekStart = getMondayDateKeyForDateKey(scheduleDate)
    const snapshots = await fetchCenterTrainingScheduleWeekSnapshotsByStarts(
      [weekStart],
      audience,
    )
    const snapshotDays = snapshots.get(weekStart)
    if (snapshotDays && snapshotDays.length > 0) {
      void saveCenterTrainingScheduleWeekSnapshot(snapshotDays, audience)
    }
  }

  return {
    ok: true,
    signedUp: !existing,
    signupCount: count ?? 0,
  }
}

/** 마감 후 관리자·강사 대리 참여 — 선택한 회원을 해당 일정에 참여 처리 */
export async function staffAddCenterRunningTrainingScheduleSignup(
  scheduleDayId: string,
  memberId: string,
): Promise<
  | {
      ok: true
      signupCount: number
      signup: RunningLeagueTrainingScheduleSignup
      alreadySignedUp: boolean
    }
  | { ok: false; error: string }
> {
  await requireRole(['admin', 'instructor'])

  const targetMemberId = memberId.trim()
  if (!targetMemberId) return { ok: false, error: '회원을 선택해 주세요.' }

  const parsed = parseCenterDayId(scheduleDayId)
  if (parsed == null) return { ok: false, error: '스케줄을 찾을 수 없습니다.' }
  const { weekday, audience } = parsed
  const tables = trainingScheduleConfig(audience)

  const supabase = await scheduleClient()

  let dayResult = await supabase
    .from(tables.daysTable)
    .select('weekday, is_hidden, training_summary, schedule_date')
    .eq('weekday', weekday)
    .maybeSingle()

  if (isMissingColumnError(dayResult.error)) {
    dayResult = await supabase
      .from(tables.daysTable)
      .select('weekday, is_hidden, training_summary')
      .eq('weekday', weekday)
      .maybeSingle()
  }

  const { data: dayRow, error: dayError } = dayResult

  if (isMissingTableError(dayError)) {
    return { ok: false, error: '러닝 스케줄 기능이 준비되지 않았습니다.' }
  }
  if (dayError || !dayRow) {
    return { ok: false, error: '스케줄을 찾을 수 없습니다.' }
  }

  const liveScheduleDate = normalizeTrainingScheduleDate(
    (dayRow as { schedule_date?: string | null }).schedule_date,
  )
  const scheduleDate = parsed.scheduleDate ?? liveScheduleDate

  let votable =
    isVotableCenterDay(dayRow) &&
    (!scheduleDate || !liveScheduleDate || liveScheduleDate === scheduleDate)

  if (!votable && scheduleDate) {
    const weekStart = getMondayDateKeyForDateKey(scheduleDate)
    const snapshots = await fetchCenterTrainingScheduleWeekSnapshotsByStarts(
      [weekStart],
      audience,
    )
    const snapshotDay = snapshots.get(weekStart)?.find((day) => day.weekday === weekday)
    if (snapshotDay) {
      votable = isVotableCenterDay(snapshotDay)
    }
  }

  if (!votable) {
    return { ok: false, error: '휴강 또는 미운영 요일입니다.' }
  }

  const { data: memberRow, error: memberError } = await supabase
    .from('members')
    .select('id, name, sport')
    .eq('id', targetMemberId)
    .maybeSingle()

  if (memberError || !memberRow) {
    return { ok: false, error: '회원을 찾을 수 없습니다.' }
  }

  if (!memberMatchesTrainingScheduleAudience(memberRow.sport, audience)) {
    return {
      ok: false,
      error:
        audience === 'youth_athletics'
          ? '육상선수반 스케줄에는 육상선수반 회원만 등록할 수 있습니다.'
          : '성인 러닝 스케줄에는 육상선수반 회원을 등록할 수 없습니다.',
    }
  }

  let existingQuery = supabase
    .from(tables.signupsTable)
    .select('id, created_at')
    .eq('weekday', weekday)
    .eq('member_id', targetMemberId)

  if (scheduleDate) {
    existingQuery = existingQuery.eq('schedule_date', scheduleDate)
  } else {
    existingQuery = existingQuery.is('schedule_date', null)
  }

  const { data: existing, error: existingError } = await existingQuery.maybeSingle()

  if (existingError && !isMissingTableError(existingError)) {
    console.error('staffAddCenterRunningTrainingScheduleSignup.existing', existingError)
    return { ok: false, error: '참여 상태를 확인하지 못했습니다.' }
  }

  if (!existing) {
    const insertPayload: {
      weekday: number
      member_id: string
      schedule_date?: string | null
    } = {
      weekday,
      member_id: targetMemberId,
    }
    if (scheduleDate) {
      insertPayload.schedule_date = scheduleDate
    }

    let insertResult = await supabase.from(tables.signupsTable).insert(insertPayload)

    if (isMissingColumnError(insertResult.error, 'schedule_date')) {
      insertResult = await supabase.from(tables.signupsTable).insert({
        weekday,
        member_id: targetMemberId,
      })
    }

    if (insertResult.error) {
      console.error('staffAddCenterRunningTrainingScheduleSignup.insert', insertResult.error)
      return { ok: false, error: '참여 등록에 실패했습니다.' }
    }
  }

  // 성인 오프라인 수업 참여 = 출석왕 1회 자동 반영
  if (audience === 'adult_running' && scheduleDate) {
    const staffUser = await getCurrentUser()
    if (staffUser?.id) {
      const autoAttendance = await recordOfflineClassAttendanceForMember({
        memberId: targetMemberId,
        scheduleDate,
        checkedInBy: staffUser.id,
        weekday,
      })
      if (!autoAttendance.ok) {
        console.error(
          'staffAddCenterRunningTrainingScheduleSignup.autoAttendance',
          autoAttendance.error,
        )
      }
    }
  }

  let countQuery = supabase
    .from(tables.signupsTable)
    .select('id', { count: 'exact', head: true })
    .eq('weekday', weekday)

  if (scheduleDate) {
    countQuery = countQuery.eq('schedule_date', scheduleDate)
  } else {
    countQuery = countQuery.is('schedule_date', null)
  }

  const { count, error: countError } = await countQuery
  if (countError) {
    console.error('staffAddCenterRunningTrainingScheduleSignup.count', countError)
  }

  if (scheduleDate) {
    const weekStart = getMondayDateKeyForDateKey(scheduleDate)
    const snapshots = await fetchCenterTrainingScheduleWeekSnapshotsByStarts(
      [weekStart],
      audience,
    )
    const snapshotDays = snapshots.get(weekStart)
    if (snapshotDays && snapshotDays.length > 0) {
      void saveCenterTrainingScheduleWeekSnapshot(snapshotDays, audience)
    }
  }

  return {
    ok: true,
    signupCount: count ?? 0,
    alreadySignedUp: Boolean(existing),
    signup: {
      member_id: targetMemberId,
      member_name: (memberRow.name as string)?.trim() || '회원',
      signed_at: existing?.created_at ?? new Date().toISOString(),
    },
  }
}

/** 관리자·강사 — 참여 명단에서 특정 회원 참여 취소 */
export async function staffRemoveCenterRunningTrainingScheduleSignup(
  scheduleDayId: string,
  memberId: string,
): Promise<
  | { ok: true; signupCount: number }
  | { ok: false; error: string }
> {
  await requireRole(['admin', 'instructor'])

  const targetMemberId = memberId.trim()
  if (!targetMemberId) return { ok: false, error: '회원을 선택해 주세요.' }

  const parsed = parseCenterDayId(scheduleDayId)
  if (parsed == null) return { ok: false, error: '스케줄을 찾을 수 없습니다.' }
  const { weekday, audience } = parsed
  const tables = trainingScheduleConfig(audience)

  const supabase = await scheduleClient()

  let dayResult = await supabase
    .from(tables.daysTable)
    .select('weekday, schedule_date')
    .eq('weekday', weekday)
    .maybeSingle()

  if (isMissingColumnError(dayResult.error)) {
    dayResult = await supabase
      .from(tables.daysTable)
      .select('weekday')
      .eq('weekday', weekday)
      .maybeSingle()
  }

  if (isMissingTableError(dayResult.error)) {
    return { ok: false, error: '러닝 스케줄 기능이 준비되지 않았습니다.' }
  }

  const liveScheduleDate = normalizeTrainingScheduleDate(
    (dayResult.data as { schedule_date?: string | null } | null)?.schedule_date,
  )
  const scheduleDate = parsed.scheduleDate ?? liveScheduleDate

  let existingQuery = supabase
    .from(tables.signupsTable)
    .select('id')
    .eq('weekday', weekday)
    .eq('member_id', targetMemberId)

  if (scheduleDate) {
    existingQuery = existingQuery.eq('schedule_date', scheduleDate)
  } else {
    existingQuery = existingQuery.is('schedule_date', null)
  }

  const { data: existing, error: existingError } = await existingQuery.maybeSingle()

  if (existingError && !isMissingTableError(existingError)) {
    console.error('staffRemoveCenterRunningTrainingScheduleSignup.existing', existingError)
    return { ok: false, error: '참여 상태를 확인하지 못했습니다.' }
  }

  if (!existing) {
    return { ok: false, error: '참여 신청 내역이 없습니다.' }
  }

  const { error: deleteError } = await supabase
    .from(tables.signupsTable)
    .delete()
    .eq('id', existing.id)

  if (deleteError) {
    console.error('staffRemoveCenterRunningTrainingScheduleSignup.delete', deleteError)
    return { ok: false, error: '참여 취소에 실패했습니다.' }
  }

  const attendanceResult = await clearCenterTrainingScheduleAttendance({
    memberId: targetMemberId,
    weekday,
    scheduleDate,
    audience,
  })
  if (!attendanceResult.ok) {
    console.error(
      'staffRemoveCenterRunningTrainingScheduleSignup.clearAttendance',
      attendanceResult.error,
    )
  }
  await clearOfflineClassAttendanceForDate({
    memberId: targetMemberId,
    scheduleDate,
  })

  let countQuery = supabase
    .from(tables.signupsTable)
    .select('id', { count: 'exact', head: true })
    .eq('weekday', weekday)

  if (scheduleDate) {
    countQuery = countQuery.eq('schedule_date', scheduleDate)
  } else {
    countQuery = countQuery.is('schedule_date', null)
  }

  const { count, error: countError } = await countQuery
  if (countError) {
    console.error('staffRemoveCenterRunningTrainingScheduleSignup.count', countError)
  }

  if (scheduleDate) {
    const weekStart = getMondayDateKeyForDateKey(scheduleDate)
    const snapshots = await fetchCenterTrainingScheduleWeekSnapshotsByStarts(
      [weekStart],
      audience,
    )
    const snapshotDays = snapshots.get(weekStart)
    if (snapshotDays && snapshotDays.length > 0) {
      void saveCenterTrainingScheduleWeekSnapshot(snapshotDays, audience)
    }
  }

  return {
    ok: true,
    signupCount: count ?? 0,
  }
}

/** 대리 참여용 회원 명단 (강사·해당 반 회원 포함) */
export async function listMembersForTrainingScheduleStaffSignup(
  audience: TrainingScheduleAudience = 'adult_running',
): Promise<MemberPickerOption[]> {
  await requireRole(['admin', 'instructor'])

  const { data } = await getMembers({
    isActive: true,
    limit: 800,
    orderBy: 'name',
    orderAsc: true,
  })

  const mapped: MemberPickerOption[] = data.map((m) => ({
    id: m.id,
    name: m.name,
    sport: m.sport,
    age: m.age,
    birth_date: m.birth_date,
  }))

  if (audience === 'youth_athletics') {
    const youth = mapped.filter((member) => isYouthAthleticsClassSport(member.sport))
    const instructors = mapped.filter((member) => {
      const sport = (member.sport ?? '').toLowerCase()
      return sport.includes('강사') || sport.includes('instructor') || sport.includes('코치')
    })
    const byId = new Map<string, MemberPickerOption>()
    for (const row of [...youth, ...instructors]) {
      if (!byId.has(row.id)) byId.set(row.id, row)
    }
    const preferred = [...byId.values()]
    if (preferred.length > 0) {
      return preferred.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    }
    return mapped
  }

  const running = mapped.filter((member) => {
    const sport = (member.sport ?? '').toLowerCase()
    if (sport.includes('일반')) return false
    return (
      sport.includes('러닝') ||
      sport.includes('running') ||
      sport.includes('성인') ||
      sport.includes('마라톤') ||
      sport.includes('강사') ||
      sport.includes('instructor') ||
      sport.includes('코치') ||
      sport.includes('10k') ||
      sport.includes('5k')
    )
  })

  const source = running.length > 0 ? running : mapped
  return source
}

export async function saveMemberCenterTrainingScheduleVote(
  signedUpDayIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getRunningPortalMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const inferred = signedUpDayIds
    .map((id) => parseCenterDayId(id))
    .find((parsed) => parsed != null)
  const audience = inferred?.audience ?? 'adult_running'
  const tables = trainingScheduleConfig(audience)

  const supabase = await scheduleClient()

  const { data: dayRows, error: dayError } = await fetchCenterScheduleDayRows(
    supabase,
    audience,
  )

  if (isMissingTableError(dayError)) {
    return { ok: false, error: '러닝 스케줄 기능이 준비되지 않았습니다.' }
  }
  if (dayError) {
    console.error('saveMemberCenterTrainingScheduleVote.days', dayError)
    return { ok: false, error: '스케줄을 불러오지 못했습니다.' }
  }

  const scheduleDays = (dayRows ?? []) as CenterScheduleDayRow[]
  const dayByWeekday = new Map(scheduleDays.map((day) => [day.weekday, day]))

  const votableWeekdays = new Set(
    scheduleDays.filter(isVotableCenterDay).map((day) => day.weekday),
  )

  const targetWeekdays = new Set(
    signedUpDayIds
      .map((id) => parseCenterDayId(id)?.weekday)
      .filter((weekday): weekday is number => weekday != null && votableWeekdays.has(weekday)),
  )

  let existingSelect = 'id, weekday, schedule_date'
  let existingResult = await supabase
    .from(tables.signupsTable)
    .select(existingSelect)
    .eq('member_id', member.id)

  if (isMissingColumnError(existingResult.error, 'schedule_date')) {
    existingSelect = 'id, weekday'
    existingResult = await supabase
      .from(tables.signupsTable)
      .select(existingSelect)
      .eq('member_id', member.id)
  }

  const { data: existingRows, error: existingError } = existingResult

  if (existingError && !isMissingTableError(existingError)) {
    console.error('saveMemberCenterTrainingScheduleVote.existing', existingError)
    return { ok: false, error: '참여 상태를 확인하지 못했습니다.' }
  }

  const existingByWeekday = new Map(
    ((existingRows ?? []) as Array<{ id: string; weekday: number; schedule_date?: string | null }>)
      .filter((row) => {
        const day = dayByWeekday.get(row.weekday)
        if (!day) return false
        return trainingSignupMatchesScheduleDate(
          row.schedule_date,
          day.schedule_date ?? null,
        )
      })
      .map((row) => [row.weekday, row.id] as const),
  )

  const toDelete = [...existingByWeekday.entries()]
    .filter(([weekday]) => !targetWeekdays.has(weekday))
    .map(([, signupId]) => signupId)

  const toInsert = [...targetWeekdays].filter((weekday) => !existingByWeekday.has(weekday))

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from(tables.signupsTable)
      .delete()
      .in('id', toDelete)

    if (deleteError) {
      console.error('saveMemberCenterTrainingScheduleVote.delete', deleteError)
      return { ok: false, error: '참여 취소에 실패했습니다.' }
    }
  }

  if (toInsert.length > 0) {
    const closedWeekday = toInsert.find((weekday) => {
      const day = dayByWeekday.get(weekday)
      return isTrainingScheduleSignupClosed({
        weekday,
        scheduleDate: day?.schedule_date ?? null,
      })
    })
    if (closedWeekday != null) {
      return {
        ok: false,
        error: trainingScheduleSignupClosedMessage(closedWeekday),
      }
    }

    const insertRows = toInsert.map((weekday) => {
      const day = dayByWeekday.get(weekday)
      const scheduleDate = normalizeTrainingScheduleDate(day?.schedule_date)
      const row: {
        weekday: number
        member_id: string
        schedule_date?: string | null
      } = {
        weekday,
        member_id: member.id,
      }
      if (scheduleDate) row.schedule_date = scheduleDate
      return row
    })

    let insertResult = await supabase
      .from(tables.signupsTable)
      .insert(insertRows)

    if (isMissingColumnError(insertResult.error, 'schedule_date')) {
      insertResult = await supabase
        .from(tables.signupsTable)
        .insert(
          toInsert.map((weekday) => ({
            weekday,
            member_id: member.id,
          })),
        )
    }

    const { error: insertError } = insertResult

    if (insertError) {
      console.error('saveMemberCenterTrainingScheduleVote.insert', insertError)
      return { ok: false, error: '참여 저장에 실패했습니다.' }
    }
  }

  revalidateCenterTrainingSchedulePaths()
  return { ok: true }
}
