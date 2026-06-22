'use server'

import { requireRole } from '@/lib/actions/auth'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  buildAwardSlots,
  enrichAwardSlotsWithMemberNames,
  recommendRunningLeagueAwards,
  type RunningLeagueAwardSlot,
} from '@/lib/running-league/awards'
import {
  attendanceScoreFromLessonCounts,
  buildLeaderboard,
  clampScore,
  computeTotalScore,
  goalScoreFromAchievementRate,
  mileageScoreFromKm,
  recordImprovementScoreFromTimes,
  recoveryScoreFromChecks,
  type RunningLeagueRankRow,
} from '@/lib/running-league/scoring'
import {
  dailyRecoveryPoints,
  isDailyRecoveryComplete,
  monthlyRecoveryScoreFromEntries,
  type DailyRecoveryFormState,
} from '@/lib/running-league/recovery'
import {
  buildMemberRecordAnalysis,
  buildMemberReportNarrative,
  suggestNextGoal,
  summarizeRecoveryForMember,
} from '@/lib/running-league/member-portal'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import type {
  RunningLeague,
  RunningLeagueAward,
  RunningLeagueDailyRecovery,
  RunningLeagueDistanceEvent,
  RunningLeagueGoalType,
  RunningLeagueMemberLevel,
  RunningLeagueMileageLog,
  RunningLeagueParticipant,
  RunningLeagueRecord,
  RunningLeagueRecordPhase,
  RunningLeagueRecoveryCheckType,
  RunningLeagueRecoveryLog,
  RunningLeagueReport,
  RunningLeagueStatus,
  RunningLeagueTargetGroup,
} from '@/lib/types'
import { revalidatePath } from 'next/cache'
import { uploadMileageScreenshot } from '@/lib/running-league/mileage-screenshot-storage'

const LEAGUE_SELECT =
  'id, title, description, starts_at, ends_at, status, audience, target_group, board_post_id, created_by, created_at, updated_at'

const PARTICIPANT_SELECT =
  'id, league_id, member_id, goal_level, goal_type, personal_goal, goal_achievement_rate, attendance_score, goal_score, record_score, mileage_score, recovery_score, mileage_km, total_score, record_baseline, record_current, notes, coach_comment, created_at, updated_at, member:members(id, name, sport, phone)'

function mapLeague(row: Record<string, unknown>): RunningLeague {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    starts_at: String(row.starts_at),
    ends_at: String(row.ends_at),
    status: row.status as RunningLeagueStatus,
    audience: (row.audience as RunningLeague['audience']) ?? 'adult',
    target_group: (row.target_group as RunningLeagueTargetGroup) ?? 'all',
    board_post_id: (row.board_post_id as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function mapParticipant(row: Record<string, unknown>): RunningLeagueParticipant {
  const memberRaw = row.member
  const member =
    memberRaw && typeof memberRaw === 'object' && !Array.isArray(memberRaw)
      ? {
          id: String((memberRaw as Record<string, unknown>).id),
          name: String((memberRaw as Record<string, unknown>).name ?? ''),
          sport: ((memberRaw as Record<string, unknown>).sport as string | null) ?? null,
          phone: ((memberRaw as Record<string, unknown>).phone as string | null) ?? null,
        }
      : null

  const attendance_score = Number(row.attendance_score ?? 0)
  const goal_score = Number(row.goal_score ?? 0)
  const record_score = Number(row.record_score ?? 0)
  const mileage_score = Number(row.mileage_score ?? 0)
  const recovery_score = Number(row.recovery_score ?? 0)

  return {
    id: String(row.id),
    league_id: String(row.league_id),
    member_id: String(row.member_id),
    goal_level: (row.goal_level as string | null) ?? null,
    goal_type: (row.goal_type as RunningLeagueGoalType | null) ?? null,
    personal_goal: (row.personal_goal as string | null) ?? null,
    goal_achievement_rate:
      row.goal_achievement_rate != null ? Number(row.goal_achievement_rate) : null,
    attendance_score,
    goal_score,
    record_score,
    mileage_score,
    recovery_score,
    mileage_km: Number(row.mileage_km ?? 0),
    total_score: computeTotalScore({
      attendance_score,
      goal_score,
      record_score,
      mileage_score,
      recovery_score,
    }),
    record_baseline: (row.record_baseline as string | null) ?? null,
    record_current: (row.record_current as string | null) ?? null,
    notes: String(row.notes ?? ''),
    coach_comment: String(row.coach_comment ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    member,
  }
}

function mapMileageLog(row: Record<string, unknown>): RunningLeagueMileageLog {
  return {
    id: String(row.id),
    participant_id: String(row.participant_id),
    league_id: String(row.league_id),
    member_id: String(row.member_id),
    distance_km: Number(row.distance_km ?? 0),
    logged_at: String(row.logged_at),
    source: row.source as RunningLeagueMileageLog['source'],
    notes: String(row.notes ?? ''),
    duration: (row.duration as string | null) ?? null,
    pace: (row.pace as string | null) ?? null,
    heart_rate: row.heart_rate != null ? Number(row.heart_rate) : null,
    calories: row.calories != null ? Number(row.calories) : null,
    activity_time: (row.activity_time as string | null) ?? null,
    source_app: (row.source_app as string | null) ?? null,
    screenshot_url: (row.screenshot_url as string | null) ?? null,
    image_hash: (row.image_hash as string | null) ?? null,
    extraction_confidence:
      row.extraction_confidence != null ? Number(row.extraction_confidence) : null,
    extraction_raw_json: (row.extraction_raw_json as Record<string, unknown> | null) ?? null,
    verification_status: (row.verification_status as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function mapRecord(row: Record<string, unknown>): RunningLeagueRecord {
  return {
    id: String(row.id),
    participant_id: String(row.participant_id),
    league_id: String(row.league_id),
    member_id: String(row.member_id),
    distance_event: row.distance_event as RunningLeagueDistanceEvent,
    record_phase: row.record_phase as RunningLeagueRecordPhase,
    time_text: (row.time_text as string | null) ?? null,
    time_seconds: row.time_seconds != null ? Number(row.time_seconds) : null,
    measured_at: String(row.measured_at),
    notes: String(row.notes ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function mapRecoveryLog(row: Record<string, unknown>): RunningLeagueRecoveryLog {
  return {
    id: String(row.id),
    participant_id: String(row.participant_id),
    league_id: String(row.league_id),
    member_id: String(row.member_id),
    check_type: row.check_type as RunningLeagueRecoveryCheckType,
    completed: Boolean(row.completed),
    points: Number(row.points ?? 0),
    logged_at: String(row.logged_at),
    notes: String(row.notes ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function mapDailyRecovery(row: Record<string, unknown>): RunningLeagueDailyRecovery {
  return {
    id: String(row.id),
    participant_id: String(row.participant_id),
    league_id: String(row.league_id),
    member_id: String(row.member_id),
    logged_at: String(row.logged_at),
    condition: row.condition as RunningLeagueDailyRecovery['condition'],
    pain: row.pain as RunningLeagueDailyRecovery['pain'],
    stretching: row.stretching as RunningLeagueDailyRecovery['stretching'],
    intensity: row.intensity as RunningLeagueDailyRecovery['intensity'],
    coach_compliance: row.coach_compliance as RunningLeagueDailyRecovery['coach_compliance'],
    points: Number(row.points ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function mapAward(row: Record<string, unknown>): RunningLeagueAward {
  return {
    id: String(row.id),
    league_id: String(row.league_id),
    participant_id: String(row.participant_id),
    member_id: String(row.member_id),
    award_key: String(row.award_key),
    award_name: String(row.award_name),
    criteria: String(row.criteria ?? ''),
    reason: String(row.reason ?? ''),
    is_recommended: Boolean(row.is_recommended),
    is_confirmed: Boolean(row.is_confirmed),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function mapReport(row: Record<string, unknown>): RunningLeagueReport {
  const highlights = row.highlights
  return {
    id: String(row.id),
    participant_id: String(row.participant_id),
    league_id: String(row.league_id),
    member_id: String(row.member_id),
    rank: row.rank != null ? Number(row.rank) : null,
    total_score: row.total_score != null ? Number(row.total_score) : null,
    summary: String(row.summary ?? ''),
    highlights: Array.isArray(highlights)
      ? highlights.map((item) => String(item))
      : [],
    coach_comment: String(row.coach_comment ?? ''),
    is_published: Boolean(row.is_published),
    published_at: (row.published_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

async function syncParticipantTotalScore(
  supabase: Awaited<ReturnType<typeof leagueClient>>,
  participantId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('running_league_participants')
    .select(
      'attendance_score, goal_score, record_score, mileage_score, recovery_score',
    )
    .eq('id', participantId)
    .single()

  if (error || !data) return 0

  // total_score는 expand-running-league-schema.sql의 GENERATED 컬럼으로 자동 계산됩니다.
  return computeTotalScore({
    attendance_score: Number(data.attendance_score ?? 0),
    goal_score: Number(data.goal_score ?? 0),
    record_score: Number(data.record_score ?? 0),
    mileage_score: Number(data.mileage_score ?? 0),
    recovery_score: Number(data.recovery_score ?? 0),
  })
}

async function loadPriorFinishMemberIds(
  supabase: Awaited<ReturnType<typeof leagueClient>>,
  leagueId: string,
  memberIds: string[],
): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set()

  const { data, error } = await supabase
    .from('running_league_records')
    .select('member_id')
    .in('member_id', memberIds)
    .eq('record_phase', 'month_end')
    .in('distance_event', ['5km', '10km'])
    .neq('league_id', leagueId)

  if (error?.code === '42P01') return new Set()
  if (error) return new Set()

  return new Set((data ?? []).map((row) => String(row.member_id)))
}

async function leagueClient() {
  try {
    return createServiceRoleClient()
  } catch (error) {
    console.error(
      '[running-league] SUPABASE_SERVICE_ROLE_KEY 없음 — 세션 클라이언트로 대체 (RLS로 저장 실패 가능)',
      {
        error: error instanceof Error ? error.message : String(error),
        vercel_env: process.env.VERCEL_ENV ?? null,
      },
    )
    return createClient()
  }
}

function revalidateRunningLeaguePaths(leagueId?: string) {
  revalidatePath('/dashboard/settings/running-league')
  if (leagueId) {
    revalidatePath(`/dashboard/settings/running-league/${leagueId}`)
  }
  revalidatePath('/dashboard/settings/adult-center-board')
  revalidatePath('/dashboard/my/running-league')
  revalidatePath('/dashboard/my')
}

function isMissingTableError(error: { code?: string } | null): boolean {
  return error?.code === '42P01'
}

async function countMemberAttendanceInLeague(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string,
  startsAt: string,
  endsAt: string,
): Promise<number> {
  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('lesson_date')
    .eq('member_id', memberId)
    .gte('lesson_date', startsAt)
    .lte('lesson_date', endsAt)
    .in('attendance_status', ['present', 'makeup'])

  if (error) return 0
  return lessons?.length ?? 0
}

async function resolveMemberLeague(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string,
): Promise<RunningLeague | null> {
  const { data: activeLeagues, error: activeError } = await supabase
    .from('running_leagues')
    .select(LEAGUE_SELECT)
    .eq('status', 'active')
    .order('starts_at', { ascending: false })
    .limit(1)

  if (!activeError && activeLeagues?.[0]) {
    return mapLeague(activeLeagues[0] as Record<string, unknown>)
  }

  const { data: closedLeagues, error: closedError } = await supabase
    .from('running_leagues')
    .select(LEAGUE_SELECT)
    .eq('status', 'closed')
    .order('starts_at', { ascending: false })
    .limit(6)

  if (closedError || !closedLeagues?.length) return null

  for (const row of closedLeagues) {
    const league = mapLeague(row as Record<string, unknown>)
    const { data: participant } = await supabase
      .from('running_league_participants')
      .select('id')
      .eq('league_id', league.id)
      .eq('member_id', memberId)
      .maybeSingle()
    if (participant) return league
  }

  return null
}

export async function getRunningLeaguesForAdmin(status?: RunningLeagueStatus | 'all'): Promise<{
  leagues: RunningLeague[]
  tableReady: boolean
}> {
  await requireRole(['admin'])
  const supabase = await leagueClient()
  let query = supabase.from('running_leagues').select(LEAGUE_SELECT).order('starts_at', { ascending: false })
  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (isMissingTableError(error)) {
    return { leagues: [], tableReady: false }
  }
  if (error) throw error

  return {
    leagues: (data ?? []).map((row) => mapLeague(row as Record<string, unknown>)),
    tableReady: true,
  }
}

export async function getRunningLeagueDetail(leagueId: string): Promise<{
  league: RunningLeague | null
  participants: RunningLeagueParticipant[]
  leaderboard: RunningLeagueRankRow[]
  awardSlots: RunningLeagueAwardSlot[]
  savedAwards: RunningLeagueAward[]
  reports: RunningLeagueReport[]
  records: RunningLeagueRecord[]
  recoveryLogs: RunningLeagueRecoveryLog[]
  dailyRecoveries: RunningLeagueDailyRecovery[]
  tableReady: boolean
}> {
  await requireRole(['admin'])
  const supabase = await leagueClient()

  const [
    { data: leagueRow, error: leagueError },
    { data: participantRows, error: participantError },
    awardResult,
    reportResult,
    recordResult,
    recoveryResult,
    dailyRecoveryResult,
  ] = await Promise.all([
    supabase.from('running_leagues').select(LEAGUE_SELECT).eq('id', leagueId).maybeSingle(),
    supabase
      .from('running_league_participants')
      .select(PARTICIPANT_SELECT)
      .eq('league_id', leagueId)
      .order('created_at', { ascending: true }),
    supabase.from('running_league_awards').select('*').eq('league_id', leagueId),
    supabase.from('running_league_reports').select('*').eq('league_id', leagueId),
    supabase.from('running_league_records').select('*').eq('league_id', leagueId),
    supabase.from('running_league_recovery_logs').select('*').eq('league_id', leagueId),
    supabase.from('running_league_daily_recovery').select('*').eq('league_id', leagueId),
  ])

  function rowsOrEmpty<T>(
    result: { data: T[] | null; error: { code?: string } | null },
  ): T[] {
    if (isMissingTableError(result.error)) return []
    if (result.error) throw result.error
    return result.data ?? []
  }

  if (isMissingTableError(leagueError) || isMissingTableError(participantError)) {
    return {
      league: null,
      participants: [],
      leaderboard: [],
      awardSlots: [],
      savedAwards: [],
      reports: [],
      records: [],
      recoveryLogs: [],
      dailyRecoveries: [],
      tableReady: false,
    }
  }
  if (leagueError) throw leagueError
  if (participantError) throw participantError

  const participants = (participantRows ?? []).map((row) =>
    mapParticipant(row as Record<string, unknown>),
  )
  const leaderboard = buildLeaderboard(participants)
  const awardRows = rowsOrEmpty(awardResult)
  const reportRows = rowsOrEmpty(reportResult)
  const recordRows = rowsOrEmpty(recordResult)
  const recoveryRows = rowsOrEmpty(recoveryResult)
  const dailyRecoveryRows = rowsOrEmpty(dailyRecoveryResult)

  const records = recordRows.map((row) => mapRecord(row as Record<string, unknown>))
  const dailyRecoveries = dailyRecoveryRows.map((row) =>
    mapDailyRecovery(row as Record<string, unknown>),
  )

  const priorFinishMemberIds = await loadPriorFinishMemberIds(
    supabase,
    leagueId,
    participants.map((row) => row.member_id),
  )

  const recommendations = recommendRunningLeagueAwards({
    leaderboard,
    participants,
    records,
    dailyRecoveries,
    priorFinishMemberIds,
  })
  const savedAwards = awardRows.map((row) => mapAward(row as Record<string, unknown>))
  const awardSlots = enrichAwardSlotsWithMemberNames(
    buildAwardSlots(recommendations, savedAwards),
    participants,
  )

  return {
    league: leagueRow ? mapLeague(leagueRow as Record<string, unknown>) : null,
    participants,
    leaderboard,
    awardSlots,
    savedAwards,
    reports: reportRows.map((row) => mapReport(row as Record<string, unknown>)),
    records,
    recoveryLogs: recoveryRows.map((row) => mapRecoveryLog(row as Record<string, unknown>)),
    dailyRecoveries,
    tableReady: true,
  }
}

export async function createRunningLeague(input: {
  title: string
  description?: string
  starts_at: string
  ends_at: string
  status?: RunningLeagueStatus
  target_group?: RunningLeagueTargetGroup
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireRole(['admin'])
  const title = input.title.trim()
  if (!title) return { ok: false, error: '리그 이름을 입력해주세요.' }
  if (!input.starts_at || !input.ends_at) {
    return { ok: false, error: '시작일과 종료일을 입력해주세요.' }
  }

  const supabase = await leagueClient()
  const { data, error } = await supabase
    .from('running_leagues')
    .insert({
      title,
      description: input.description?.trim() ?? '',
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      status: input.status ?? 'draft',
      target_group: input.target_group ?? 'all',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: 'DB 테이블이 없습니다. add-running-league-tables.sql을 실행해주세요.' }
    }
    return { ok: false, error: error.message }
  }

  revalidateRunningLeaguePaths()
  return { ok: true, id: String(data.id) }
}

export async function getRunningLeagueById(leagueId: string): Promise<RunningLeague | null> {
  await requireRole(['admin'])
  const supabase = await leagueClient()
  const { data, error } = await supabase
    .from('running_leagues')
    .select(LEAGUE_SELECT)
    .eq('id', leagueId)
    .maybeSingle()
  if (error || !data) return null
  return mapLeague(data as Record<string, unknown>)
}

export async function updateRunningLeague(
  leagueId: string,
  input: {
    title?: string
    description?: string
    starts_at?: string
    ends_at?: string
    status?: RunningLeagueStatus
    target_group?: RunningLeagueTargetGroup
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.title != null) patch.title = input.title.trim()
  if (input.description != null) patch.description = input.description.trim()
  if (input.starts_at != null) patch.starts_at = input.starts_at
  if (input.ends_at != null) patch.ends_at = input.ends_at
  if (input.status != null) patch.status = input.status
  if (input.target_group != null) patch.target_group = input.target_group

  const supabase = await leagueClient()
  const { error } = await supabase.from('running_leagues').update(patch).eq('id', leagueId)
  if (error) return { ok: false, error: error.message }

  revalidateRunningLeaguePaths(leagueId)
  return { ok: true }
}

export async function deleteRunningLeague(
  leagueId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const supabase = await leagueClient()
  const { error } = await supabase.from('running_leagues').delete().eq('id', leagueId)
  if (error) return { ok: false, error: error.message }

  revalidateRunningLeaguePaths()
  return { ok: true }
}

async function syncPrimaryGoalRow(
  supabase: Awaited<ReturnType<typeof leagueClient>>,
  participant: {
    id: string
    league_id: string
    member_id: string
    goal_level?: string | null
    goal_type?: string | null
    personal_goal?: string | null
    goal_achievement_rate?: number | null
    goal_score?: number | null
  },
) {
  if (!participant.personal_goal?.trim() && !participant.goal_level && !participant.goal_type) {
    return
  }

  const { data: existing, error: existingError } = await supabase
    .from('running_league_goals')
    .select('id')
    .eq('participant_id', participant.id)
    .eq('is_primary', true)
    .maybeSingle()

  if (existingError?.code === '42P01') return

  const row = {
    participant_id: participant.id,
    league_id: participant.league_id,
    member_id: participant.member_id,
    goal_level: participant.goal_level ?? null,
    goal_type: participant.goal_type ?? null,
    personal_goal: participant.personal_goal?.trim() ?? '',
    achievement_rate: participant.goal_achievement_rate ?? null,
    goal_score: participant.goal_score ?? 0,
    is_primary: true,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    await supabase.from('running_league_goals').update(row).eq('id', existing.id)
    return
  }

  await supabase.from('running_league_goals').insert(row)
}

export async function addRunningLeagueParticipant(input: {
  league_id: string
  member_id: string
  goal_level?: string
  goal_type?: RunningLeagueGoalType | ''
  personal_goal?: string
  goal_achievement_rate?: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['admin'])
  if (!input.member_id) return { ok: false, error: '회원을 선택해주세요.' }

  const achievementRate = input.goal_achievement_rate ?? 0
  const goalScore = goalScoreFromAchievementRate(achievementRate)

  const supabase = await leagueClient()
  const { data: inserted, error } = await supabase
    .from('running_league_participants')
    .insert({
      league_id: input.league_id,
      member_id: input.member_id,
      goal_level: input.goal_level?.trim() || null,
      goal_type: input.goal_type || null,
      personal_goal: input.personal_goal?.trim() || null,
      goal_achievement_rate: achievementRate,
      goal_score: goalScore,
    })
    .select('id, league_id, member_id, goal_level, goal_type, personal_goal, goal_achievement_rate, goal_score')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, error: '이미 참가 등록된 회원입니다.' }
    return { ok: false, error: error.message }
  }

  await syncPrimaryGoalRow(supabase, inserted)
  await syncParticipantTotalScore(supabase, String(inserted.id))
  revalidateRunningLeaguePaths(input.league_id)
  return { ok: true }
}

export async function updateRunningLeagueParticipant(
  participantId: string,
  input: {
    goal_level?: string | null
    goal_type?: RunningLeagueGoalType | '' | null
    personal_goal?: string | null
    goal_achievement_rate?: number | null
    attendance_score?: number
    goal_score?: number
    record_score?: number
    mileage_score?: number
    recovery_score?: number
    mileage_km?: number
    record_baseline?: string | null
    record_current?: string | null
    notes?: string
    coach_comment?: string
  },
): Promise<{ ok: true; totalScore: number } | { ok: false; error: string }> {
  await requireRole(['admin'])

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.goal_level !== undefined) patch.goal_level = input.goal_level?.trim() || null
  if (input.goal_type !== undefined) patch.goal_type = input.goal_type || null
  if (input.personal_goal !== undefined) patch.personal_goal = input.personal_goal?.trim() || null
  if (input.goal_achievement_rate !== undefined) {
    patch.goal_achievement_rate =
      input.goal_achievement_rate == null ? null : clampScore(input.goal_achievement_rate)
    patch.goal_score = goalScoreFromAchievementRate(input.goal_achievement_rate ?? 0)
  } else if (input.goal_score !== undefined) {
    patch.goal_score = clampScore(input.goal_score)
  }
  if (input.attendance_score !== undefined) patch.attendance_score = clampScore(input.attendance_score)
  if (input.record_score !== undefined) patch.record_score = clampScore(input.record_score)
  if (input.recovery_score !== undefined) patch.recovery_score = clampScore(input.recovery_score)
  if (input.notes !== undefined) patch.notes = input.notes.trim()
  if (input.coach_comment !== undefined) patch.coach_comment = input.coach_comment.trim()
  if (input.record_baseline !== undefined) patch.record_baseline = input.record_baseline?.trim() || null
  if (input.record_current !== undefined) patch.record_current = input.record_current?.trim() || null

  if (input.mileage_km !== undefined) {
    const km = Math.max(0, Number(input.mileage_km) || 0)
    patch.mileage_km = km
    patch.mileage_score = mileageScoreFromKm(km)
  } else if (input.mileage_score !== undefined) {
    patch.mileage_score = clampScore(input.mileage_score)
  }

  const supabase = await leagueClient()
  const { data, error } = await supabase
    .from('running_league_participants')
    .update(patch)
    .eq('id', participantId)
    .select(
      'id, league_id, member_id, goal_level, goal_type, personal_goal, goal_achievement_rate, goal_score, attendance_score, record_score, mileage_score, recovery_score',
    )
    .single()

  if (error) return { ok: false, error: error.message }

  await syncPrimaryGoalRow(supabase, data)

  const totalScore = await syncParticipantTotalScore(supabase, participantId)

  revalidateRunningLeaguePaths(String(data.league_id))
  return { ok: true, totalScore }
}

export async function removeRunningLeagueParticipant(
  participantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const supabase = await leagueClient()
  const { error } = await supabase
    .from('running_league_participants')
    .delete()
    .eq('id', participantId)
  if (error) return { ok: false, error: error.message }

  revalidateRunningLeaguePaths()
  return { ok: true }
}

function countWeeksWithTwoPlus(dates: string[]): number {
  const weekMap = new Map<string, number>()
  for (const date of dates) {
    const d = new Date(`${date}T12:00:00`)
    const day = d.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    const monday = new Date(d)
    monday.setDate(d.getDate() + mondayOffset)
    const key = monday.toISOString().slice(0, 10)
    weekMap.set(key, (weekMap.get(key) ?? 0) + 1)
  }
  return [...weekMap.values()].filter((count) => count >= 2).length
}

export async function syncRunningLeagueAttendanceScore(
  participantId: string,
): Promise<{ ok: true; score: number } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const supabase = await leagueClient()

  const { data: participant, error: participantError } = await supabase
    .from('running_league_participants')
    .select('id, member_id, league_id')
    .eq('id', participantId)
    .single()
  if (participantError || !participant) {
    return { ok: false, error: participantError?.message ?? '참가자를 찾을 수 없습니다.' }
  }

  const { data: league, error: leagueError } = await supabase
    .from('running_leagues')
    .select('starts_at, ends_at')
    .eq('id', participant.league_id)
    .single()
  if (leagueError || !league) {
    return { ok: false, error: leagueError?.message ?? '리그를 찾을 수 없습니다.' }
  }

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('lesson_date, attendance_status')
    .eq('member_id', participant.member_id)
    .gte('lesson_date', league.starts_at)
    .lte('lesson_date', league.ends_at)
    .in('attendance_status', ['present', 'makeup'])

  if (lessonsError) return { ok: false, error: lessonsError.message }

  const dates = (lessons ?? []).map((lesson) => String(lesson.lesson_date))
  const presentSessions = dates.length
  const weeksWithTwoPlus = countWeeksWithTwoPlus(dates)

  const { count: scheduledCount } = await supabase
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', participant.member_id)
    .gte('lesson_date', league.starts_at)
    .lte('lesson_date', league.ends_at)
    .neq('attendance_status', 'cancelled')

  const perfectMonth =
    scheduledCount != null &&
    scheduledCount > 0 &&
    presentSessions >= scheduledCount

  const score = attendanceScoreFromLessonCounts({
    presentSessions,
    weeksWithTwoPlus,
    perfectMonth,
  })

  const { error: updateError } = await supabase
    .from('running_league_participants')
    .update({
      attendance_score: score,
      updated_at: new Date().toISOString(),
    })
    .eq('id', participantId)

  if (updateError) return { ok: false, error: updateError.message }

  await syncParticipantTotalScore(supabase, participantId)

  revalidateRunningLeaguePaths()
  return { ok: true, score }
}

export async function getMemberRunningLeagueView(): Promise<{
  league: RunningLeague | null
  participant: RunningLeagueParticipant | null
  records: RunningLeagueRecord[]
  dailyRecoveries: RunningLeagueDailyRecovery[]
  todayRecovery: RunningLeagueDailyRecovery | null
  memberAwards: RunningLeagueAward[]
  publishedReport: RunningLeagueReport | null
  attendanceCount: number
  myRank: number | null
  leaderboard: RunningLeagueRankRow[]
  tableReady: boolean
}> {
  const member = await getMemberForCurrentUser()
  if (!member) {
    return {
      league: null,
      participant: null,
      records: [],
      dailyRecoveries: [],
      todayRecovery: null,
      memberAwards: [],
      publishedReport: null,
      attendanceCount: 0,
      myRank: null,
      leaderboard: [],
      tableReady: true,
    }
  }

  const supabase = await createClient()

  let league: RunningLeague | null = null
  try {
    league = await resolveMemberLeague(supabase, member.id)
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === '42P01') {
      return {
        league: null,
        participant: null,
        records: [],
        dailyRecoveries: [],
        todayRecovery: null,
        memberAwards: [],
        publishedReport: null,
        attendanceCount: 0,
        myRank: null,
        leaderboard: [],
        tableReady: false,
      }
    }
    throw error
  }

  if (!league) {
    return {
      league: null,
      participant: null,
      records: [],
      dailyRecoveries: [],
      todayRecovery: null,
      memberAwards: [],
      publishedReport: null,
      attendanceCount: 0,
      myRank: null,
      leaderboard: [],
      tableReady: true,
    }
  }

  const [{ data: myRow }, { data: allRows }] = await Promise.all([
    supabase
      .from('running_league_participants')
      .select(PARTICIPANT_SELECT)
      .eq('league_id', league.id)
      .eq('member_id', member.id)
      .maybeSingle(),
    supabase
      .from('running_league_participants')
      .select(PARTICIPANT_SELECT)
      .eq('league_id', league.id),
  ])

  const participants = (allRows ?? []).map((row) =>
    mapParticipant(row as Record<string, unknown>),
  )
  const leaderboard = buildLeaderboard(participants)
  const participant = myRow ? mapParticipant(myRow as Record<string, unknown>) : null

  let records: RunningLeagueRecord[] = []
  let dailyRecoveries: RunningLeagueDailyRecovery[] = []
  let todayRecovery: RunningLeagueDailyRecovery | null = null
  let memberAwards: RunningLeagueAward[] = []
  let publishedReport: RunningLeagueReport | null = null
  let attendanceCount = 0
  const today = new Date().toISOString().slice(0, 10)
  const myRankRow = participant
    ? leaderboard.find((row) => row.participantId === participant.id)
    : null

  if (participant) {
    const [{ data: recordRows }, { data: recoveryRows }, { data: awardRows }, { data: reportRow }] =
      await Promise.all([
      supabase
        .from('running_league_records')
        .select(
          'id, league_id, participant_id, member_id, distance_event, record_phase, time_text, measured_at, created_at, updated_at',
        )
        .eq('participant_id', participant.id),
      supabase
        .from('running_league_daily_recovery')
        .select('*')
        .eq('participant_id', participant.id)
        .order('logged_at', { ascending: false }),
      supabase
        .from('running_league_awards')
        .select('*')
        .eq('league_id', league.id)
        .eq('member_id', participant.member_id)
        .eq('is_confirmed', true),
      supabase
        .from('running_league_reports')
        .select('*')
        .eq('participant_id', participant.id)
        .eq('is_published', true)
        .maybeSingle(),
    ])
    records = (recordRows ?? []).map((row) => mapRecord(row as Record<string, unknown>))
    dailyRecoveries = (recoveryRows ?? []).map((row) =>
      mapDailyRecovery(row as Record<string, unknown>),
    )
    memberAwards = (awardRows ?? []).map((row) => mapAward(row as Record<string, unknown>))
    publishedReport = reportRow ? mapReport(reportRow as Record<string, unknown>) : null
    todayRecovery = dailyRecoveries.find((row) => row.logged_at === today) ?? null
    attendanceCount = await countMemberAttendanceInLeague(
      supabase,
      participant.member_id,
      league.starts_at,
      league.ends_at,
    )
  }

  return {
    league,
    participant,
    records,
    dailyRecoveries,
    todayRecovery,
    memberAwards,
    publishedReport,
    attendanceCount,
    myRank: myRankRow?.rank ?? null,
    leaderboard,
    tableReady: true,
  }
}

export async function upsertRunningLeagueRecord(input: {
  participant_id: string
  league_id: string
  member_id: string
  distance_event: RunningLeagueDistanceEvent
  record_phase: RunningLeagueRecordPhase
  time_text: string
  measured_at?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const timeText = input.time_text.trim()
  if (!timeText) return { ok: false, error: '기록을 입력해주세요.' }

  const supabase = await leagueClient()
  const { error } = await supabase.from('running_league_records').upsert(
    {
      participant_id: input.participant_id,
      league_id: input.league_id,
      member_id: input.member_id,
      distance_event: input.distance_event,
      record_phase: input.record_phase,
      time_text: timeText,
      measured_at: input.measured_at ?? new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'participant_id,distance_event,record_phase' },
  )

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: '기록 테이블이 없습니다. expand-running-league-schema.sql을 실행해주세요.' }
    }
    return { ok: false, error: error.message }
  }

  const baselineKey = input.record_phase === 'month_start' ? 'record_baseline' : 'record_current'
  const recordText = `${input.distance_event} ${timeText}`

  if (input.record_phase === 'month_start' || input.record_phase === 'month_end') {
    const { data: participant } = await supabase
      .from('running_league_participants')
      .select('record_baseline, record_current')
      .eq('id', input.participant_id)
      .single()

    const baseline =
      input.record_phase === 'month_start'
        ? recordText
        : (participant?.record_baseline as string | null)
    const current =
      input.record_phase === 'month_end'
        ? recordText
        : (participant?.record_current as string | null)

    const recordScore = recordImprovementScoreFromTimes(baseline, current)

    await supabase
      .from('running_league_participants')
      .update({
        [baselineKey]: recordText,
        record_score: recordScore,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.participant_id)

    await syncParticipantTotalScore(supabase, input.participant_id)
  }

  revalidateRunningLeaguePaths(input.league_id)
  return { ok: true }
}

export async function saveDailyRecovery(input: {
  participant_id: string
  league_id: string
  member_id: string
  form: DailyRecoveryFormState
  logged_at?: string
}): Promise<{ ok: true; recoveryScore: number } | { ok: false; error: string }> {
  if (!isDailyRecoveryComplete(input.form)) {
    return { ok: false, error: '모든 회복관리 항목을 선택해주세요.' }
  }

  const profile = await getDashboardProfile()
  const member = await getMemberForCurrentUser()
  const isAdmin = profile?.role === 'admin'

  if (!isAdmin) {
    if (!member || member.id !== input.member_id) {
      return { ok: false, error: '본인 회복관리만 기록할 수 있습니다.' }
    }
  }

  const loggedAt = input.logged_at ?? new Date().toISOString().slice(0, 10)
  const entry = {
    condition: input.form.condition,
    pain: input.form.pain,
    stretching: input.form.stretching,
    intensity: input.form.intensity,
    coach_compliance: input.form.coach_compliance,
  }
  const points = dailyRecoveryPoints(entry)

  const supabase = await leagueClient()
  const { error } = await supabase.from('running_league_daily_recovery').upsert(
    {
      participant_id: input.participant_id,
      league_id: input.league_id,
      member_id: input.member_id,
      logged_at: loggedAt,
      condition: entry.condition,
      pain: entry.pain,
      stretching: entry.stretching,
      intensity: entry.intensity,
      coach_compliance: entry.coach_compliance,
      points,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'participant_id,logged_at' },
  )

  if (error) {
    if (isMissingTableError(error)) {
      return {
        ok: false,
        error: '회복관리 테이블이 없습니다. add-running-league-daily-recovery.sql을 실행해주세요.',
      }
    }
    return { ok: false, error: error.message }
  }

  const { data: allRows } = await supabase
    .from('running_league_daily_recovery')
    .select('points')
    .eq('participant_id', input.participant_id)

  const finalRecoveryScore = monthlyRecoveryScoreFromEntries(
    (allRows ?? []).map((row) => ({ points: Number(row.points ?? 0) })),
  )

  await supabase
    .from('running_league_participants')
    .update({
      recovery_score: finalRecoveryScore,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.participant_id)

  await syncParticipantTotalScore(supabase, input.participant_id)

  revalidateRunningLeaguePaths(input.league_id)
  return { ok: true, recoveryScore: finalRecoveryScore }
}

export async function saveParticipantRecoveryChecks(input: {
  participant_id: string
  league_id: string
  member_id: string
  checks: Array<{
    check_type: RunningLeagueRecoveryCheckType
    completed: boolean
    points: number
  }>
}): Promise<{ ok: true; recoveryScore: number } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const supabase = await leagueClient()
  const today = new Date().toISOString().slice(0, 10)

  const { error: deleteError } = await supabase
    .from('running_league_recovery_logs')
    .delete()
    .eq('participant_id', input.participant_id)
    .eq('logged_at', today)

  if (deleteError && !isMissingTableError(deleteError)) {
    return { ok: false, error: deleteError.message }
  }

  const insertRows = input.checks.map((check) => ({
    participant_id: input.participant_id,
    league_id: input.league_id,
    member_id: input.member_id,
    check_type: check.check_type,
    completed: check.completed,
    points: check.completed ? check.points : 0,
    logged_at: today,
  }))

  if (insertRows.length > 0) {
    const { error } = await supabase.from('running_league_recovery_logs').insert(insertRows)
    if (error && !isMissingTableError(error)) {
      return { ok: false, error: error.message }
    }
  }

  const { data: logs } = await supabase
    .from('running_league_recovery_logs')
    .select('points, completed')
    .eq('participant_id', input.participant_id)
    .eq('completed', true)

  const finalRecoveryScore = recoveryScoreFromChecks(
    (logs ?? []).map((row) => ({
      completed: Boolean(row.completed),
      points: Number(row.points ?? 0),
    })),
  )

  await supabase
    .from('running_league_participants')
    .update({
      recovery_score: finalRecoveryScore,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.participant_id)

  await syncParticipantTotalScore(supabase, input.participant_id)

  revalidateRunningLeaguePaths(input.league_id)
  return { ok: true, recoveryScore: finalRecoveryScore }
}

export async function saveRunningLeagueAwardSlots(input: {
  league_id: string
  slots: Array<{
    award_key: string
    award_name: string
    criteria: string
    participant_id: string
    member_id: string
    reason: string
    is_recommended?: boolean
    is_confirmed?: boolean
  }>
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const supabase = await leagueClient()

  const rows = input.slots
    .filter((slot) => slot.participant_id && slot.member_id)
    .map((slot) => ({
      league_id: input.league_id,
      participant_id: slot.participant_id,
      member_id: slot.member_id,
      award_key: slot.award_key,
      award_name: slot.award_name,
      criteria: slot.criteria,
      reason: slot.reason,
      is_recommended: slot.is_recommended ?? false,
      is_confirmed: slot.is_confirmed ?? false,
      updated_at: new Date().toISOString(),
    }))

  if (rows.length === 0) return { ok: true, count: 0 }

  const awardKeys = [...new Set(rows.map((row) => row.award_key))]
  const { error: deleteError } = await supabase
    .from('running_league_awards')
    .delete()
    .eq('league_id', input.league_id)
    .in('award_key', awardKeys)

  if (deleteError && !isMissingTableError(deleteError)) {
    return { ok: false, error: deleteError.message }
  }

  const { error } = await supabase.from('running_league_awards').insert(rows)

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: '수상 테이블이 없습니다. expand-running-league-schema.sql을 실행해주세요.' }
    }
    return { ok: false, error: error.message }
  }

  revalidateRunningLeaguePaths(input.league_id)
  return { ok: true, count: rows.length }
}

export async function confirmRunningLeagueAwards(
  leagueId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const supabase = await leagueClient()

  const { data, error } = await supabase
    .from('running_league_awards')
    .update({
      is_confirmed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('league_id', leagueId)
    .select('id')

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: '수상 테이블이 없습니다. expand-running-league-schema.sql을 실행해주세요.' }
    }
    return { ok: false, error: error.message }
  }

  revalidateRunningLeaguePaths(leagueId)
  return { ok: true, count: data?.length ?? 0 }
}

/** @deprecated saveRunningLeagueAwardSlots 사용 */
export async function syncRunningLeagueAwards(
  leagueId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const detail = await getRunningLeagueDetail(leagueId)
  if (!detail.league) return { ok: false, error: '리그를 찾을 수 없습니다.' }

  return saveRunningLeagueAwardSlots({
    league_id: leagueId,
    slots: detail.awardSlots
      .filter((slot) => slot.participantId && slot.memberId)
      .map((slot) => ({
        award_key: slot.award_key,
        award_name: slot.award,
        criteria: slot.criteria,
        participant_id: slot.participantId,
        member_id: slot.memberId,
        reason: slot.reason,
        is_recommended: slot.is_recommended,
        is_confirmed: slot.is_confirmed,
      })),
  })
}

export async function generateRunningLeagueReport(
  participantId: string,
): Promise<{ ok: true; reportId: string } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const supabase = await leagueClient()

  const { data: participant, error } = await supabase
    .from('running_league_participants')
    .select(PARTICIPANT_SELECT)
    .eq('id', participantId)
    .single()

  if (error || !participant) {
    return { ok: false, error: error?.message ?? '참가자를 찾을 수 없습니다.' }
  }

  const mapped = mapParticipant(participant as Record<string, unknown>)
  const detail = await getRunningLeagueDetail(mapped.league_id)
  const rankRow = detail.leaderboard.find((row) => row.participantId === participantId)
  const memberAwards = detail.savedAwards.filter(
    (award) => award.member_id === mapped.member_id && award.is_confirmed,
  )
  const recordInfo = buildMemberRecordAnalysis(mapped, detail.records)
  const recovery = summarizeRecoveryForMember(detail.dailyRecoveries, mapped.id)
  const attendanceCount = await countMemberAttendanceInLeague(
    supabase,
    mapped.member_id,
    detail.league?.starts_at ?? mapped.created_at.slice(0, 10),
    detail.league?.ends_at ?? mapped.updated_at.slice(0, 10),
  )
  const nextGoal = suggestNextGoal(
    mapped,
    recordInfo?.analysis ?? null,
    recordInfo?.distance ?? null,
  )
  const narrative = buildMemberReportNarrative({
    memberName: mapped.member?.name ?? '회원',
    leagueTitle: detail.league?.title ?? '러닝 리그',
    personalGoal: mapped.personal_goal,
    recordAnalysis: recordInfo?.analysis ?? null,
    recordDistance: recordInfo?.distance ?? null,
    attendanceCount,
    mileageKm: mapped.mileage_km,
    goalAchievementRate: mapped.goal_achievement_rate,
    recoverySummary: recovery.summary,
    coachComment: mapped.coach_comment || '',
    nextGoal,
  })

  const highlights = [
    mapped.personal_goal ? `개인 목표: ${mapped.personal_goal}` : null,
    `출석 ${attendanceCount}회`,
    mapped.mileage_km > 0 ? `누적 거리 ${mapped.mileage_km}km` : null,
    recordInfo?.analysis?.deltaLabel
      ? `가장 많이 향상된 기록: ${recordInfo.distance} ${recordInfo.analysis.deltaLabel}`
      : mapped.record_current
        ? `현재 기록 ${mapped.record_current}`
        : null,
    mapped.goal_achievement_rate != null ? `목표 달성률 ${mapped.goal_achievement_rate}%` : null,
    recovery.summary,
    `다음 달 추천 목표: ${nextGoal}`,
    ...memberAwards.map((award) => `🏅 ${award.award_name}: ${award.reason}`),
  ].filter(Boolean) as string[]

  const summary = narrative

  const { data: saved, error: saveError } = await supabase
    .from('running_league_reports')
    .upsert(
      {
        participant_id: participantId,
        league_id: mapped.league_id,
        member_id: mapped.member_id,
        rank: rankRow?.rank ?? null,
        total_score: mapped.total_score,
        summary,
        highlights,
        coach_comment: mapped.coach_comment || mapped.notes || '',
        is_published: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'participant_id' },
    )
    .select('id')
    .single()

  if (saveError) {
    if (isMissingTableError(saveError)) {
      return { ok: false, error: '리포트 테이블이 없습니다. expand-running-league-schema.sql을 실행해주세요.' }
    }
    return { ok: false, error: saveError.message }
  }

  revalidateRunningLeaguePaths(mapped.league_id)
  return { ok: true, reportId: String(saved.id) }
}

export async function publishRunningLeagueReport(
  reportId: string,
  publish = true,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const supabase = await leagueClient()
  const { data, error } = await supabase
    .from('running_league_reports')
    .update({
      is_published: publish,
      published_at: publish ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select('league_id')
    .single()

  if (error) return { ok: false, error: error.message }
  revalidateRunningLeaguePaths(String(data.league_id))
  return { ok: true }
}

function currentMonthDateRange(): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthText = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return {
    start: `${year}-${monthText}-01`,
    end: `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`,
  }
}

async function assertMemberOwnsParticipant(
  participantId: string,
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getDashboardProfile()
  if (profile?.role === 'admin') return { ok: true }

  const member = await getMemberForCurrentUser()
  if (!member || member.id !== memberId) {
    return { ok: false, error: '본인 기록만 저장할 수 있습니다.' }
  }

  const supabase = await leagueClient()
  const { data, error } = await supabase
    .from('running_league_participants')
    .select('id, member_id')
    .eq('id', participantId)
    .maybeSingle()

  if (error || !data || data.member_id !== memberId) {
    return { ok: false, error: '참가 정보를 찾을 수 없습니다.' }
  }

  return { ok: true }
}

async function syncParticipantMileageFromLogs(
  supabase: Awaited<ReturnType<typeof leagueClient>>,
  participantId: string,
): Promise<number> {
  const { start, end } = currentMonthDateRange()
  const { data, error } = await supabase
    .from('running_league_mileage_logs')
    .select('distance_km')
    .eq('participant_id', participantId)
    .gte('logged_at', start)
    .lte('logged_at', end)

  if (error) throw new Error(error.message)

  const mileageKm = (data ?? []).reduce(
    (sum, row) => sum + Number(row.distance_km ?? 0),
    0,
  )
  const mileageScore = mileageScoreFromKm(mileageKm)

  const { error: updateError } = await supabase
    .from('running_league_participants')
    .update({
      mileage_km: mileageKm,
      mileage_score: mileageScore,
      updated_at: new Date().toISOString(),
    })
    .eq('id', participantId)

  if (updateError) throw new Error(updateError.message)

  await syncParticipantTotalScore(supabase, participantId)
  return mileageKm
}

export type MemberRunningLeagueHome = {
  league: RunningLeague | null
  participant: RunningLeagueParticipant | null
  pbRecords: RunningLeagueRecord[]
  mileageLogs: RunningLeagueMileageLog[]
  tableReady: boolean
}

export async function getMemberRunningLeagueHome(): Promise<MemberRunningLeagueHome> {
  const member = await getMemberForCurrentUser()
  if (!member) {
    return { league: null, participant: null, pbRecords: [], mileageLogs: [], tableReady: true }
  }

  const supabase = await createClient()

  let league: RunningLeague | null = null
  try {
    league = await resolveMemberLeague(supabase, member.id)
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === '42P01') {
      return { league: null, participant: null, pbRecords: [], mileageLogs: [], tableReady: false }
    }
    throw error
  }

  if (!league) {
    return { league: null, participant: null, pbRecords: [], mileageLogs: [], tableReady: true }
  }

  const { data: myRow } = await supabase
    .from('running_league_participants')
    .select(PARTICIPANT_SELECT)
    .eq('league_id', league.id)
    .eq('member_id', member.id)
    .maybeSingle()

  const participant = myRow ? mapParticipant(myRow as Record<string, unknown>) : null
  if (!participant) {
    return { league, participant: null, pbRecords: [], mileageLogs: [], tableReady: true }
  }

  const { start, end } = currentMonthDateRange()
  const [recordResult, mileageResult] = await Promise.all([
    supabase
      .from('running_league_records')
      .select(
        'id, league_id, participant_id, member_id, distance_event, record_phase, time_text, measured_at, created_at, updated_at',
      )
      .eq('participant_id', participant.id)
      .eq('record_phase', 'other'),
    supabase
      .from('running_league_mileage_logs')
      .select(
        'id, participant_id, league_id, member_id, distance_km, logged_at, source, notes, duration, pace, heart_rate, calories, activity_time, source_app, screenshot_url, image_hash, extraction_confidence, extraction_raw_json, verification_status, created_at, updated_at',
      )
      .eq('participant_id', participant.id)
      .gte('logged_at', start)
      .lte('logged_at', end)
      .order('logged_at', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  const { data: recordRows, error } = recordResult
  const { data: mileageRows, error: mileageError } = mileageResult

  if (error && isMissingTableError(error)) {
    return { league, participant, pbRecords: [], mileageLogs: [], tableReady: false }
  }
  if (mileageError && isMissingTableError(mileageError)) {
    return { league, participant, pbRecords: [], mileageLogs: [], tableReady: false }
  }

  return {
    league,
    participant,
    pbRecords: (recordRows ?? []).map((row) => mapRecord(row as Record<string, unknown>)),
    mileageLogs: (mileageRows ?? []).map((row) => mapMileageLog(row as Record<string, unknown>)),
    tableReady: true,
  }
}

export async function saveMemberMileageLog(input: {
  distance_km: number
  logged_at?: string
  notes?: string
  source?: 'manual' | 'import' | 'lesson' | 'other'
  duration?: string | null
  pace?: string | null
  heart_rate?: number | null
  calories?: number | null
  activity_time?: string | null
  source_app?: string | null
  screenshot_url?: string | null
  image_hash?: string | null
  extraction_confidence?: number | null
  extraction_raw_json?: Record<string, unknown> | null
  verification_status?: 'pending' | 'confirmed' | 'manual' | 'rejected'
  skip_duplicate_check?: boolean
}): Promise<
  | { ok: true; mileageKm: number }
  | { ok: false; error: string; duplicate?: boolean }
> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const home = await getMemberRunningLeagueHome()
  if (!home.tableReady) {
    return { ok: false, error: '마일리지 테이블이 없습니다. expand-running-league-schema.sql을 실행해주세요.' }
  }
  if (!home.participant) {
    return { ok: false, error: '러닝 리그 참가 후 기록할 수 있습니다.' }
  }

  const distanceKm = Number(input.distance_km)
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return { ok: false, error: '거리(km)를 입력해주세요.' }
  }

  const access = await assertMemberOwnsParticipant(home.participant.id, member.id)
  if (!access.ok) return access

  const loggedAt = input.logged_at ?? new Date().toISOString().slice(0, 10)
  const supabase = await leagueClient()

  if (!input.skip_duplicate_check) {
    let duplicateRow: { id: string } | null = null

    if (input.image_hash?.trim()) {
      const { data } = await supabase
        .from('running_league_mileage_logs')
        .select('id')
        .eq('member_id', home.participant.member_id)
        .eq('league_id', home.participant.league_id)
        .eq('image_hash', input.image_hash.trim())
        .limit(1)
        .maybeSingle()
      duplicateRow = data
    } else {
      let query = supabase
        .from('running_league_mileage_logs')
        .select('id')
        .eq('member_id', home.participant.member_id)
        .eq('league_id', home.participant.league_id)
        .eq('logged_at', loggedAt)
        .eq('distance_km', Math.round(distanceKm * 100) / 100)

      if (input.duration?.trim()) {
        query = query.eq('duration', input.duration.trim())
      }

      const { data } = await query.limit(1).maybeSingle()
      duplicateRow = data
    }

    if (duplicateRow) {
      return {
        ok: false,
        duplicate: true,
        error: '이미 비슷한 러닝 기록이 있습니다. 그래도 저장할까요?',
      }
    }
  }

  const { error } = await supabase.from('running_league_mileage_logs').insert({
    participant_id: home.participant.id,
    league_id: home.participant.league_id,
    member_id: home.participant.member_id,
    distance_km: Math.round(distanceKm * 100) / 100,
    logged_at: loggedAt,
    source: input.source ?? 'manual',
    notes: input.notes?.trim() ?? '',
    duration: input.duration?.trim() || null,
    pace: input.pace?.trim() || null,
    heart_rate: input.heart_rate ?? null,
    calories: input.calories ?? null,
    activity_time: input.activity_time?.trim() || null,
    source_app: input.source_app?.trim() || null,
    screenshot_url: input.screenshot_url?.trim() || null,
    image_hash: input.image_hash?.trim() || null,
    extraction_confidence: input.extraction_confidence ?? null,
    extraction_raw_json: input.extraction_raw_json ?? null,
    verification_status: input.verification_status ?? (input.source === 'import' ? 'confirmed' : 'manual'),
    updated_at: new Date().toISOString(),
  })

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: '마일리지 테이블이 없습니다. expand-running-league-schema.sql을 실행해주세요.' }
    }
    return { ok: false, error: error.message }
  }

  try {
    const mileageKm = await syncParticipantMileageFromLogs(supabase, home.participant.id)
    revalidateRunningLeaguePaths(home.participant.league_id)
    return { ok: true, mileageKm }
  } catch (syncError) {
    return {
      ok: false,
      error: syncError instanceof Error ? syncError.message : '마일리지 합산에 실패했습니다.',
    }
  }
}

export async function saveMemberMileageLogForm(
  formData: FormData,
): Promise<
  | { ok: true; mileageKm: number }
  | { ok: false; error: string; duplicate?: boolean }
> {
  const payloadRaw = formData.get('payload')
  if (typeof payloadRaw !== 'string' || !payloadRaw.trim()) {
    return { ok: false, error: '저장 데이터가 없습니다.' }
  }

  let payload: Parameters<typeof saveMemberMileageLog>[0]
  try {
    payload = JSON.parse(payloadRaw) as Parameters<typeof saveMemberMileageLog>[0]
  } catch {
    return { ok: false, error: '저장 데이터 형식이 올바르지 않습니다.' }
  }

  const screenshot = formData.get('screenshot')
  if (screenshot instanceof File && screenshot.size > 0) {
    const member = await getMemberForCurrentUser()
    const home = await getMemberRunningLeagueHome()
    if (member && home.participant) {
      const uploaded = await uploadMileageScreenshot({
        memberId: member.id,
        leagueId: home.participant.league_id,
        file: screenshot,
      })
      if (uploaded.url) {
        payload.screenshot_url = uploaded.url
      }
    }
  }

  return saveMemberMileageLog(payload)
}

async function assertMemberOwnsMileageLog(
  logId: string,
  memberId: string,
): Promise<
  | { ok: true; log: { id: string; participant_id: string; league_id: string } }
  | { ok: false; error: string }
> {
  const supabase = await leagueClient()
  const { data, error } = await supabase
    .from('running_league_mileage_logs')
    .select('id, participant_id, league_id, member_id')
    .eq('id', logId)
    .maybeSingle()

  if (error || !data || data.member_id !== memberId) {
    return { ok: false, error: '기록을 찾을 수 없습니다.' }
  }

  return {
    ok: true,
    log: {
      id: String(data.id),
      participant_id: String(data.participant_id),
      league_id: String(data.league_id),
    },
  }
}

export async function updateMemberMileageLog(
  logId: string,
  input: Omit<Parameters<typeof saveMemberMileageLog>[0], 'skip_duplicate_check'> & {
    skip_duplicate_check?: boolean
  },
): Promise<
  | { ok: true; mileageKm: number }
  | { ok: false; error: string; duplicate?: boolean }
> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const access = await assertMemberOwnsMileageLog(logId, member.id)
  if (!access.ok) return access

  const distanceKm = Number(input.distance_km)
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return { ok: false, error: '거리(km)를 입력해주세요.' }
  }

  const loggedAt = input.logged_at ?? new Date().toISOString().slice(0, 10)
  const supabase = await leagueClient()

  if (!input.skip_duplicate_check) {
    let duplicateQuery = supabase
      .from('running_league_mileage_logs')
      .select('id')
      .eq('member_id', member.id)
      .eq('league_id', access.log.league_id)
      .eq('logged_at', loggedAt)
      .eq('distance_km', Math.round(distanceKm * 100) / 100)
      .neq('id', logId)

    if (input.duration?.trim()) {
      duplicateQuery = duplicateQuery.eq('duration', input.duration.trim())
    }

    const { data: duplicateRow } = await duplicateQuery.limit(1).maybeSingle()
    if (duplicateRow) {
      return {
        ok: false,
        duplicate: true,
        error: '이미 비슷한 러닝 기록이 있습니다. 그래도 저장할까요?',
      }
    }
  }

  const { error } = await supabase
    .from('running_league_mileage_logs')
    .update({
      distance_km: Math.round(distanceKm * 100) / 100,
      logged_at: loggedAt,
      notes: input.notes?.trim() ?? '',
      duration: input.duration?.trim() || null,
      pace: input.pace?.trim() || null,
      heart_rate: input.heart_rate ?? null,
      calories: input.calories ?? null,
      activity_time: input.activity_time?.trim() || null,
      source_app: input.source_app?.trim() || null,
      verification_status: input.verification_status ?? 'manual',
      updated_at: new Date().toISOString(),
    })
    .eq('id', logId)

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: '마일리지 테이블이 없습니다. expand-running-league-schema.sql을 실행해주세요.' }
    }
    return { ok: false, error: error.message }
  }

  try {
    const mileageKm = await syncParticipantMileageFromLogs(supabase, access.log.participant_id)
    revalidateRunningLeaguePaths(access.log.league_id)
    return { ok: true, mileageKm }
  } catch (syncError) {
    return {
      ok: false,
      error: syncError instanceof Error ? syncError.message : '마일리지 합산에 실패했습니다.',
    }
  }
}

export async function deleteMemberMileageLog(
  logId: string,
): Promise<{ ok: true; mileageKm: number } | { ok: false; error: string }> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const access = await assertMemberOwnsMileageLog(logId, member.id)
  if (!access.ok) return access

  const supabase = await leagueClient()
  const { error } = await supabase.from('running_league_mileage_logs').delete().eq('id', logId)

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: '마일리지 테이블이 없습니다. expand-running-league-schema.sql을 실행해주세요.' }
    }
    return { ok: false, error: error.message }
  }

  try {
    const mileageKm = await syncParticipantMileageFromLogs(supabase, access.log.participant_id)
    revalidateRunningLeaguePaths(access.log.league_id)
    return { ok: true, mileageKm }
  } catch (syncError) {
    return {
      ok: false,
      error: syncError instanceof Error ? syncError.message : '마일리지 합산에 실패했습니다.',
    }
  }
}

export async function updateMemberMileageLogForm(
  logId: string,
  formData: FormData,
): Promise<
  | { ok: true; mileageKm: number }
  | { ok: false; error: string; duplicate?: boolean }
> {
  const payloadRaw = formData.get('payload')
  if (typeof payloadRaw !== 'string' || !payloadRaw.trim()) {
    return { ok: false, error: '저장 데이터가 없습니다.' }
  }

  let payload: Parameters<typeof updateMemberMileageLog>[1]
  try {
    payload = JSON.parse(payloadRaw) as Parameters<typeof updateMemberMileageLog>[1]
  } catch {
    return { ok: false, error: '저장 데이터 형식이 올바르지 않습니다.' }
  }

  return updateMemberMileageLog(logId, payload)
}

export async function saveMemberRunningPb(input: {
  distance_event: RunningLeagueDistanceEvent
  time_text: string
  measured_at?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const home = await getMemberRunningLeagueHome()
  if (!home.tableReady) {
    return { ok: false, error: '기록 테이블이 없습니다. expand-running-league-schema.sql을 실행해주세요.' }
  }
  if (!home.participant) {
    return { ok: false, error: '러닝 리그 참가 후 기록할 수 있습니다.' }
  }

  const timeText = input.time_text.trim()
  if (!timeText) return { ok: false, error: '기록을 입력해주세요.' }

  const access = await assertMemberOwnsParticipant(home.participant.id, member.id)
  if (!access.ok) return access

  const measuredAt = input.measured_at ?? new Date().toISOString().slice(0, 10)
  const supabase = await leagueClient()
  const { error } = await supabase.from('running_league_records').upsert(
    {
      participant_id: home.participant.id,
      league_id: home.participant.league_id,
      member_id: home.participant.member_id,
      distance_event: input.distance_event,
      record_phase: 'other',
      time_text: timeText,
      measured_at: measuredAt,
      notes: '개인 PB',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'participant_id,distance_event,record_phase' },
  )

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: '기록 테이블이 없습니다. expand-running-league-schema.sql을 실행해주세요.' }
    }
    return { ok: false, error: error.message }
  }

  revalidateRunningLeaguePaths(home.participant.league_id)
  return { ok: true }
}
