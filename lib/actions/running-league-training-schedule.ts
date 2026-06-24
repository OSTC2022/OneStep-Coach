'use server'

import { requireRole } from '@/lib/actions/auth'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  createEmptyTrainingScheduleDays,
  resolveTrainingScheduleMapHref,
  trainingWeekdayLabel,
  type RunningLeagueTrainingScheduleDayInput,
  type RunningLeagueTrainingScheduleDayView,
  type RunningLeagueTrainingScheduleSignup,
  type TrainingWeekday,
} from '@/lib/running-league/training-schedule'
import { revalidatePath } from 'next/cache'

const SCHEDULE_DAY_SELECT =
  'id, league_id, weekday, training_summary, location_label, naver_map_url, is_hidden, created_at, updated_at'

type ScheduleDayRow = {
  id: string
  league_id: string
  weekday: number
  training_summary: string
  location_label: string
  naver_map_url: string | null
  is_hidden: boolean
}

type SignupRow = {
  id: string
  schedule_day_id: string
  member_id: string
  created_at: string
  member: { name: string } | { name: string }[] | null
}

async function leagueClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function isMissingTableError(error: { code?: string } | null): boolean {
  return error?.code === '42P01'
}

function revalidateTrainingSchedulePaths(leagueId?: string) {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/my/running-league')
  revalidatePath('/dashboard/settings/running-league')
  if (leagueId) {
    revalidatePath(`/dashboard/settings/running-league/${leagueId}`)
  }
}

function mapSignupRow(row: SignupRow): RunningLeagueTrainingScheduleSignup {
  const memberRaw = row.member
  const memberName = Array.isArray(memberRaw)
    ? memberRaw[0]?.name
    : memberRaw?.name
  return {
    member_id: row.member_id,
    member_name: memberName?.trim() || '회원',
    signed_at: row.created_at,
  }
}

function buildDayView(
  row: ScheduleDayRow,
  signups: RunningLeagueTrainingScheduleSignup[],
  currentMemberId: string | null,
): RunningLeagueTrainingScheduleDayView {
  const weekday = row.weekday as TrainingWeekday
  return {
    id: row.id,
    league_id: row.league_id,
    weekday,
    weekday_label: trainingWeekdayLabel(weekday),
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

export type RunningLeagueTrainingScheduleBundle = {
  days: RunningLeagueTrainingScheduleDayView[]
  tableReady: boolean
}

export async function fetchRunningLeagueTrainingSchedule(
  leagueId: string,
  currentMemberId: string | null = null,
  options: { includeHidden?: boolean } = {},
): Promise<RunningLeagueTrainingScheduleBundle> {
  const supabase = await leagueClient()
  const includeHidden = options.includeHidden ?? false

  const { data: dayRows, error: dayError } = await supabase
    .from('running_league_training_schedule_days')
    .select(SCHEDULE_DAY_SELECT)
    .eq('league_id', leagueId)
    .order('weekday', { ascending: true })

  if (isMissingTableError(dayError)) {
    return { days: [], tableReady: false }
  }
  if (dayError) {
    console.error('fetchRunningLeagueTrainingSchedule.days', dayError)
    return { days: [], tableReady: true }
  }

  const days = (dayRows ?? []) as ScheduleDayRow[]
  if (days.length === 0) {
    return { days: [], tableReady: true }
  }

  const dayIds = days.map((day) => day.id)
  const { data: signupRows, error: signupError } = await supabase
    .from('running_league_training_schedule_signups')
    .select('id, schedule_day_id, member_id, created_at, member:members(name)')
    .eq('league_id', leagueId)
    .in('schedule_day_id', dayIds)
    .order('created_at', { ascending: true })

  if (signupError && !isMissingTableError(signupError)) {
    console.error('fetchRunningLeagueTrainingSchedule.signups', signupError)
  }

  const signupsByDay = new Map<string, RunningLeagueTrainingScheduleSignup[]>()
  for (const row of (signupRows ?? []) as SignupRow[]) {
    const mapped = mapSignupRow(row)
    const list = signupsByDay.get(row.schedule_day_id) ?? []
    list.push(mapped)
    signupsByDay.set(row.schedule_day_id, list)
  }

  const views = days
    .map((row) => buildDayView(row, signupsByDay.get(row.id) ?? [], currentMemberId))
    .filter((day) => includeHidden || !day.is_hidden)

  return { days: views, tableReady: true }
}

export async function getRunningLeagueTrainingScheduleForAdmin(leagueId: string): Promise<{
  days: RunningLeagueTrainingScheduleDayInput[]
  tableReady: boolean
}> {
  await requireRole(['admin'])
  const bundle = await fetchRunningLeagueTrainingSchedule(leagueId, null, {
    includeHidden: true,
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
    })),
  }
}

export async function saveRunningLeagueTrainingSchedule(
  leagueId: string,
  days: RunningLeagueTrainingScheduleDayInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['admin'])
  if (!leagueId) return { ok: false, error: '리그 정보가 없습니다.' }

  const normalized = createEmptyTrainingScheduleDays().map((emptyDay) => {
    const found = days.find((day) => day.weekday === emptyDay.weekday)
    return {
      league_id: leagueId,
      weekday: emptyDay.weekday,
      training_summary: found?.training_summary?.trim() ?? '',
      location_label: found?.location_label?.trim() ?? '',
      naver_map_url: found?.naver_map_url?.trim() || null,
      is_hidden: Boolean(found?.is_hidden),
      updated_at: new Date().toISOString(),
    }
  })

  const supabase = await leagueClient()
  const { error } = await supabase
    .from('running_league_training_schedule_days')
    .upsert(normalized, { onConflict: 'league_id,weekday' })

  if (isMissingTableError(error)) {
    return {
      ok: false,
      error: '훈련 스케줄 테이블이 없습니다. add-running-league-training-schedule.sql을 실행해주세요.',
    }
  }
  if (error) {
    console.error('saveRunningLeagueTrainingSchedule', error)
    return { ok: false, error: '스케줄 저장에 실패했습니다.' }
  }

  revalidateTrainingSchedulePaths(leagueId)
  return { ok: true }
}

export async function toggleRunningLeagueTrainingScheduleSignup(
  scheduleDayId: string,
): Promise<
  | { ok: true; signedUp: boolean; signupCount: number }
  | { ok: false; error: string }
> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const supabase = await leagueClient()

  const { data: dayRow, error: dayError } = await supabase
    .from('running_league_training_schedule_days')
    .select('id, league_id, is_hidden')
    .eq('id', scheduleDayId)
    .maybeSingle()

  if (isMissingTableError(dayError)) {
    return { ok: false, error: '훈련 스케줄 기능이 준비되지 않았습니다.' }
  }
  if (dayError || !dayRow) {
    return { ok: false, error: '스케줄을 찾을 수 없습니다.' }
  }
  if (dayRow.is_hidden) {
    return { ok: false, error: '휴강 또는 미운영 요일입니다.' }
  }

  const { data: participant, error: participantError } = await supabase
    .from('running_league_participants')
    .select('id')
    .eq('league_id', dayRow.league_id)
    .eq('member_id', member.id)
    .maybeSingle()

  if (participantError) {
    console.error('toggleRunningLeagueTrainingScheduleSignup.participant', participantError)
    return { ok: false, error: '참가 정보를 확인하지 못했습니다.' }
  }
  if (!participant) {
    return { ok: false, error: '리그 참가 후 참여 신청할 수 있습니다.' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('running_league_training_schedule_signups')
    .select('id')
    .eq('schedule_day_id', scheduleDayId)
    .eq('member_id', member.id)
    .maybeSingle()

  if (existingError && !isMissingTableError(existingError)) {
    console.error('toggleRunningLeagueTrainingScheduleSignup.existing', existingError)
    return { ok: false, error: '참여 상태를 확인하지 못했습니다.' }
  }

  if (existing) {
    const { error: deleteError } = await supabase
      .from('running_league_training_schedule_signups')
      .delete()
      .eq('id', existing.id)

    if (deleteError) {
      console.error('toggleRunningLeagueTrainingScheduleSignup.delete', deleteError)
      return { ok: false, error: '참여 취소에 실패했습니다.' }
    }
  } else {
    const { error: insertError } = await supabase
      .from('running_league_training_schedule_signups')
      .insert({
        league_id: dayRow.league_id,
        schedule_day_id: scheduleDayId,
        member_id: member.id,
        participant_id: participant.id,
      })

    if (insertError) {
      console.error('toggleRunningLeagueTrainingScheduleSignup.insert', insertError)
      return { ok: false, error: '참여 신청에 실패했습니다.' }
    }
  }

  const { count, error: countError } = await supabase
    .from('running_league_training_schedule_signups')
    .select('id', { count: 'exact', head: true })
    .eq('schedule_day_id', scheduleDayId)

  if (countError) {
    console.error('toggleRunningLeagueTrainingScheduleSignup.count', countError)
  }

  revalidateTrainingSchedulePaths(dayRow.league_id)
  return {
    ok: true,
    signedUp: !existing,
    signupCount: count ?? 0,
  }
}

function isVotableTrainingScheduleDay(day: {
  is_hidden: boolean
  training_summary: string | null
}): boolean {
  return !day.is_hidden && Boolean(day.training_summary?.trim())
}

export async function saveMemberTrainingScheduleVote(
  leagueId: string,
  signedUpDayIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }
  if (!leagueId) return { ok: false, error: '리그 정보가 없습니다.' }

  const supabase = await leagueClient()

  const { data: dayRows, error: dayError } = await supabase
    .from('running_league_training_schedule_days')
    .select('id, is_hidden, training_summary')
    .eq('league_id', leagueId)

  if (isMissingTableError(dayError)) {
    return { ok: false, error: '훈련 스케줄 기능이 준비되지 않았습니다.' }
  }
  if (dayError) {
    console.error('saveMemberTrainingScheduleVote.days', dayError)
    return { ok: false, error: '스케줄을 불러오지 못했습니다.' }
  }

  const votableDayIds = new Set(
    ((dayRows ?? []) as Array<{ id: string; is_hidden: boolean; training_summary: string }>)
      .filter(isVotableTrainingScheduleDay)
      .map((day) => day.id),
  )
  const targetDayIds = new Set(signedUpDayIds.filter((id) => votableDayIds.has(id)))

  const { data: participant, error: participantError } = await supabase
    .from('running_league_participants')
    .select('id')
    .eq('league_id', leagueId)
    .eq('member_id', member.id)
    .maybeSingle()

  if (participantError) {
    console.error('saveMemberTrainingScheduleVote.participant', participantError)
    return { ok: false, error: '참가 정보를 확인하지 못했습니다.' }
  }
  if (!participant) {
    return { ok: false, error: '리그 참가 후 참여 투표할 수 있습니다.' }
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('running_league_training_schedule_signups')
    .select('id, schedule_day_id')
    .eq('league_id', leagueId)
    .eq('member_id', member.id)

  if (existingError && !isMissingTableError(existingError)) {
    console.error('saveMemberTrainingScheduleVote.existing', existingError)
    return { ok: false, error: '참여 상태를 확인하지 못했습니다.' }
  }

  const existingByDayId = new Map(
    ((existingRows ?? []) as Array<{ id: string; schedule_day_id: string }>).map((row) => [
      row.schedule_day_id,
      row.id,
    ]),
  )

  const toDelete = [...existingByDayId.entries()]
    .filter(([dayId]) => !targetDayIds.has(dayId))
    .map(([, signupId]) => signupId)

  const toInsert = [...targetDayIds].filter((dayId) => !existingByDayId.has(dayId))

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('running_league_training_schedule_signups')
      .delete()
      .in('id', toDelete)

    if (deleteError) {
      console.error('saveMemberTrainingScheduleVote.delete', deleteError)
      return { ok: false, error: '참여 취소에 실패했습니다.' }
    }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from('running_league_training_schedule_signups').insert(
      toInsert.map((scheduleDayId) => ({
        league_id: leagueId,
        schedule_day_id: scheduleDayId,
        member_id: member.id,
        participant_id: participant.id,
      })),
    )

    if (insertError) {
      console.error('saveMemberTrainingScheduleVote.insert', insertError)
      return { ok: false, error: '참여 저장에 실패했습니다.' }
    }
  }

  revalidateTrainingSchedulePaths(leagueId)
  return { ok: true }
}
