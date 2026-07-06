'use server'

import {
  clearCenterTrainingScheduleAttendance,
  recordCenterTrainingScheduleAttendance,
} from '@/lib/actions/center-training-schedule-attendance'
import { getCurrentUser, requireRole } from '@/lib/actions/auth'
import { getRunningPortalMemberForCurrentUser } from '@/lib/actions/staff-running-portal-member'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  createEmptyTrainingScheduleDays,
  formatTrainingScheduleDateLabel,
  normalizeTrainingScheduleDate,
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
  saveCenterTrainingScheduleWeekSnapshot,
} from '@/lib/actions/center-running-training-schedule-library'
import { revalidatePath } from 'next/cache'

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
) {
  const primary = await supabase
    .from('center_running_training_schedule_days')
    .select(CENTER_SCHEDULE_DAY_SELECT)
    .order('weekday', { ascending: true })

  if (!isMissingColumnError(primary.error)) {
    return primary
  }

  return supabase
    .from('center_running_training_schedule_days')
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
  tableReady: boolean
}

function centerDayId(weekday: number): string {
  return `center-weekday-${weekday}`
}

function parseCenterDayId(id: string): number | null {
  const match = /^center-weekday-(\d)$/.exec(id)
  if (!match) return null
  const weekday = Number(match[1])
  return weekday >= 0 && weekday <= 6 ? weekday : null
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
): RunningLeagueTrainingScheduleDayView {
  const weekday = row.weekday as TrainingWeekday
  const scheduleDate = row.schedule_date?.slice(0, 10) ?? null
  return {
    id: centerDayId(weekday),
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

function isVotableCenterDay(day: {
  is_hidden: boolean
  training_summary: string | null
}): boolean {
  return !day.is_hidden && Boolean(day.training_summary?.trim())
}

async function clearAllCenterTrainingScheduleSignups(
  supabase: Awaited<ReturnType<typeof scheduleClient>>,
) {
  const { error } = await supabase
    .from('center_running_training_schedule_signups')
    .delete()
    .gte('weekday', 0)

  if (error && !isMissingTableError(error)) {
    console.error('clearAllCenterTrainingScheduleSignups', error)
  }
}

function filterSignupsForDay(
  rawRows: CenterSignupRow[],
  scheduleDate: string | null,
): RunningLeagueTrainingScheduleSignup[] {
  return rawRows
    .filter((row) =>
      trainingSignupMatchesScheduleDate(row.schedule_date, scheduleDate),
    )
    .map((row) => mapSignupRow(row))
}

export async function fetchCenterRunningTrainingSchedule(
  currentMemberId: string | null = null,
  options: { includeHidden?: boolean } = {},
): Promise<CenterRunningTrainingScheduleBundle> {
  const supabase = await scheduleClient()
  const includeHidden = options.includeHidden ?? false

  const { data: dayRows, error: dayError } = await fetchCenterScheduleDayRows(supabase)

  if (isMissingTableError(dayError)) {
    return { days: [], tableReady: false }
  }
  if (dayError) {
    console.error('fetchCenterRunningTrainingSchedule.days', dayError)
    return { days: [], tableReady: true }
  }

  const days = (dayRows ?? []) as CenterScheduleDayRow[]
  if (days.length === 0) {
    return { days: [], tableReady: true }
  }

  const weekdays = days.map((day) => day.weekday)
  let signupSelect =
    'id, weekday, member_id, created_at, schedule_date, member:members(name)'
  let signupResult = await supabase
    .from('center_running_training_schedule_signups')
    .select(signupSelect)
    .in('weekday', weekdays)
    .order('created_at', { ascending: true })

  if (isMissingColumnError(signupResult.error, 'schedule_date')) {
    signupSelect = 'id, weekday, member_id, created_at, member:members(name)'
    signupResult = await supabase
      .from('center_running_training_schedule_signups')
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

  const views = days
    .map((row) => {
      const dayDate = normalizeTrainingScheduleDate(row.schedule_date)
      const daySignups = filterSignupsForDay(
        signupsByWeekday.get(row.weekday) ?? [],
        dayDate,
      )
      return buildCenterDayView(row, daySignups, currentMemberId)
    })
    .filter((day) => includeHidden || !day.is_hidden)

  return { days: views, tableReady: true }
}

export async function getCenterRunningTrainingScheduleForAdmin(): Promise<{
  days: RunningLeagueTrainingScheduleDayInput[]
  tableReady: boolean
}> {
  await requireRole(['admin'])
  const bundle = await fetchCenterRunningTrainingSchedule(null, { includeHidden: true })

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
): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  await requireRole(['admin'])

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
    await fetchCenterScheduleDayRows(supabase)
  if (existingDayError && !isMissingTableError(existingDayError)) {
    console.error('saveCenterRunningTrainingSchedule.existing', existingDayError)
  }

  const shouldResetSignups = shouldResetCenterTrainingSignups(
    (existingDayRows ?? []) as CenterScheduleDayRow[],
    normalized,
  )

  let warning: string | undefined
  let result = await supabase
    .from('center_running_training_schedule_days')
    .upsert(normalized, { onConflict: 'weekday' })

  if (isMissingColumnError(result.error)) {
    const retry = await supabase
      .from('center_running_training_schedule_days')
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
        '러닝 스케줄 테이블이 없습니다. add-center-running-training-schedule.sql을 실행해주세요.',
    }
  }
  if (error) {
    console.error('saveCenterRunningTrainingSchedule', error)
    return { ok: false, error: formatSaveScheduleError(error) }
  }

  if (shouldResetSignups) {
    await clearAllCenterTrainingScheduleSignups(supabase)
  }

  revalidateCenterTrainingSchedulePaths()
  revalidatePath('/dashboard/settings/running-schedule')
  await saveCenterTrainingScheduleWeekSnapshot(days)
  return warning ? { ok: true, warning } : { ok: true }
}

export async function getCenterRunningTrainingScheduleForMember(): Promise<CenterRunningTrainingScheduleBundle> {
  const member = await getRunningPortalMemberForCurrentUser()
  return fetchCenterRunningTrainingSchedule(member?.id ?? null, { includeHidden: true })
}

export async function getCenterRunningTrainingScheduleAdminPreview(): Promise<CenterRunningTrainingScheduleBundle> {
  await requireRole(['admin'])
  return fetchCenterRunningTrainingSchedule(null, { includeHidden: true })
}

export async function toggleCenterRunningTrainingScheduleSignup(
  scheduleDayId: string,
): Promise<
  | { ok: true; signedUp: boolean; signupCount: number }
  | { ok: false; error: string }
> {
  const [member, user] = await Promise.all([getRunningPortalMemberForCurrentUser(), getCurrentUser()])
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const weekday = parseCenterDayId(scheduleDayId)
  if (weekday == null) return { ok: false, error: '스케줄을 찾을 수 없습니다.' }

  const supabase = await scheduleClient()
  const isAdultMember = user?.role === 'adult_member'

  let dayResult = await supabase
    .from('center_running_training_schedule_days')
    .select('weekday, is_hidden, training_summary, schedule_date')
    .eq('weekday', weekday)
    .maybeSingle()

  if (isMissingColumnError(dayResult.error)) {
    dayResult = await supabase
      .from('center_running_training_schedule_days')
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
  if (!isVotableCenterDay(dayRow)) {
    return { ok: false, error: '휴강 또는 미운영 요일입니다.' }
  }

  const scheduleDate = normalizeTrainingScheduleDate(
    (dayRow as { schedule_date?: string | null }).schedule_date,
  )

  let existingQuery = supabase
    .from('center_running_training_schedule_signups')
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
    const { error: deleteError } = await supabase
      .from('center_running_training_schedule_signups')
      .delete()
      .eq('id', existing.id)

    if (deleteError) {
      console.error('toggleCenterRunningTrainingScheduleSignup.delete', deleteError)
      return { ok: false, error: '참여 취소에 실패했습니다.' }
    }

    if (isAdultMember) {
      const attendanceResult = await clearCenterTrainingScheduleAttendance({
        memberId: member.id,
        weekday,
        scheduleDate,
      })
      if (!attendanceResult.ok) {
        console.error(
          'toggleCenterRunningTrainingScheduleSignup.clearAttendance',
          attendanceResult.error,
        )
      }
    }
  } else {
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
      .from('center_running_training_schedule_signups')
      .insert(insertPayload)

    if (isMissingColumnError(insertResult.error, 'schedule_date')) {
      insertResult = await supabase
        .from('center_running_training_schedule_signups')
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

    if (isAdultMember && user) {
      const attendanceResult = await recordCenterTrainingScheduleAttendance({
        member,
        weekday,
        scheduleDate,
        checkedInBy: user.id,
      })

      if (!attendanceResult.ok) {
        await supabase
          .from('center_running_training_schedule_signups')
          .delete()
          .eq('weekday', weekday)
          .eq('member_id', member.id)
        return { ok: false, error: attendanceResult.error }
      }
    }
  }

  let countQuery = supabase
    .from('center_running_training_schedule_signups')
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

  revalidateCenterTrainingSchedulePaths()
  return {
    ok: true,
    signedUp: !existing,
    signupCount: count ?? 0,
  }
}

export async function saveMemberCenterTrainingScheduleVote(
  signedUpDayIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getRunningPortalMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const supabase = await scheduleClient()

  const { data: dayRows, error: dayError } = await fetchCenterScheduleDayRows(supabase)

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
      .map((id) => parseCenterDayId(id))
      .filter((weekday): weekday is number => weekday != null && votableWeekdays.has(weekday)),
  )

  let existingSelect = 'id, weekday, schedule_date'
  let existingResult = await supabase
    .from('center_running_training_schedule_signups')
    .select(existingSelect)
    .eq('member_id', member.id)

  if (isMissingColumnError(existingResult.error, 'schedule_date')) {
    existingSelect = 'id, weekday'
    existingResult = await supabase
      .from('center_running_training_schedule_signups')
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
      .from('center_running_training_schedule_signups')
      .delete()
      .in('id', toDelete)

    if (deleteError) {
      console.error('saveMemberCenterTrainingScheduleVote.delete', deleteError)
      return { ok: false, error: '참여 취소에 실패했습니다.' }
    }
  }

  if (toInsert.length > 0) {
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
      .from('center_running_training_schedule_signups')
      .insert(insertRows)

    if (isMissingColumnError(insertResult.error, 'schedule_date')) {
      insertResult = await supabase
        .from('center_running_training_schedule_signups')
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
