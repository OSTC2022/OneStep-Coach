'use server'

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/actions/auth'
import { ensureCenterPortalRankingLeague } from '@/lib/running-league/center-portal-ranking-league'
import {
  filterParticipantsForAdultRunningLeague,
} from '@/lib/running-league/adult-running-eligibility'
import {
  mapLeagueMileageLogRow,
  mapLeagueParticipantRow,
  runPortalParticipantSelectQuery,
} from '@/lib/running-league/league-row-mappers'
import { canManageAdultRunningPortal } from '@/lib/running-league/portal-manage-access'
import {
  listPortalManageMonthOptions,
  normalizePortalManageMonthKey,
} from '@/lib/running-league/portal-manage-month'
import { rankingPeriodFromMonthKey, type RankingPeriod } from '@/lib/running-league/ranking-period'
import { resolveAdultRunningMemberIdsFromParticipants } from '@/lib/running-league/resolve-adult-running-member-ids'
import type { ProfilesSupabase } from '@/lib/running-league/resolve-adult-running-member-ids'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'

export type AdultRunningPortalManageMonthData = {
  monthKey: string
  period: RankingPeriod
  participants: RunningLeagueParticipant[]
  mileageLogs: RunningLeagueMileageLog[]
  beatRivalMemberId: string | null
  tableReady: boolean
  error: string | null
  availableMonthKeys: string[]
}

function isMissingTableError(error: { code?: string } | null): boolean {
  return error?.code === '42P01'
}

async function manageClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

export async function requireAdultRunningPortalManageAccess() {
  const user = await requireRole(['admin', 'instructor'])
  if (!canManageAdultRunningPortal(user)) {
    redirect('/unauthorized')
  }
  return user
}

export async function getAdultRunningPortalManageMonthData(
  monthKeyInput?: string | null,
): Promise<AdultRunningPortalManageMonthData> {
  await requireAdultRunningPortalManageAccess()

  const availableMonthKeys = listPortalManageMonthOptions()
  const monthKey = normalizePortalManageMonthKey(monthKeyInput, availableMonthKeys[0])
  const period = rankingPeriodFromMonthKey(monthKey)

  const empty: AdultRunningPortalManageMonthData = {
    monthKey,
    period,
    participants: [],
    mileageLogs: [],
    beatRivalMemberId: null,
    tableReady: true,
    error: null,
    availableMonthKeys,
  }

  try {
    const league = await ensureCenterPortalRankingLeague()
    if (!league) {
      return { ...empty, tableReady: false, error: '포털 리그를 찾을 수 없습니다.' }
    }

    const supabase = await manageClient()
    const participantsResult = await runPortalParticipantSelectQuery((select) =>
      supabase
        .from('running_league_participants')
        .select(select)
        .eq('league_id', league.id)
        .order('created_at', { ascending: true }),
    )

    if (isMissingTableError(participantsResult.error)) {
      return { ...empty, tableReady: false }
    }
    if (participantsResult.error) {
      console.error(
        'getAdultRunningPortalManageMonthData.participants',
        participantsResult.error,
      )
      return { ...empty, error: '참가자 목록을 불러오지 못했습니다.' }
    }

    const participantRows = participantsResult.data ?? []
    const participants = participantRows.map((row) =>
      mapLeagueParticipantRow(row as unknown as Record<string, unknown>),
    )
    const adultMemberIds = await resolveAdultRunningMemberIdsFromParticipants(
      supabase as unknown as ProfilesSupabase,
      participantRows as unknown as Array<{
        member_id?: unknown
        member?: Record<string, unknown> | null
      }>,
    )
    const adultParticipants = filterParticipantsForAdultRunningLeague(
      participants,
      adultMemberIds,
    )
    const adultParticipantIds = new Set(adultParticipants.map((row) => row.id))

    const { data: mileageRows, error: mileageError } = await supabase
      .from('running_league_mileage_logs')
      .select('id, participant_id, league_id, member_id, distance_km, logged_at')
      .eq('league_id', league.id)
      .gte('logged_at', period.start)
      .lte('logged_at', period.end)

    if (mileageError && isMissingTableError(mileageError)) {
      return {
        ...empty,
        participants: adultParticipants,
        beatRivalMemberId: league.beat_rival_member_id ?? null,
        tableReady: false,
      }
    }
    if (mileageError) {
      console.error('getAdultRunningPortalManageMonthData.mileageLogs', mileageError)
      return {
        ...empty,
        participants: adultParticipants,
        beatRivalMemberId: league.beat_rival_member_id ?? null,
        error: '마일리지 로그를 불러오지 못했습니다.',
      }
    }

    const mileageLogs = (mileageRows ?? [])
      .map((row) => mapLeagueMileageLogRow(row as unknown as Record<string, unknown>))
      .filter((row) => adultParticipantIds.has(row.participant_id))

    return {
      monthKey,
      period,
      participants: adultParticipants,
      mileageLogs,
      beatRivalMemberId: league.beat_rival_member_id ?? null,
      tableReady: true,
      error: null,
      availableMonthKeys,
    }
  } catch (error) {
    console.error('getAdultRunningPortalManageMonthData', error)
    return { ...empty, error: '관리 데이터를 불러오지 못했습니다.' }
  }
}
