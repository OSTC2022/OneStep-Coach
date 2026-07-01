import 'server-only'

import { format, subMonths } from 'date-fns'
import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { MemberRunningLeagueRankingBundle } from '@/lib/running-league/member-ranking-types'
import {
  filterParticipantsForAdultRunningLeague,
  filterRecordsForAdultParticipants,
} from '@/lib/running-league/adult-running-eligibility'
import { buildPbDistanceLeaderboard } from '@/lib/running-league/pb-leaderboard'
import {
  buildMileageDistanceLeaderboard,
  type MileageDistanceLeaderboard,
} from '@/lib/running-league/mileage-leaderboard'
import {
  expandPbTrendRecordsWithSnapshots,
  mapPbSnapshotRow,
} from '@/lib/running-league/pb-snapshots'
import { resolveAdultRunningMemberIdsFromParticipants } from '@/lib/running-league/resolve-adult-running-member-ids'
import type { ProfilesSupabase } from '@/lib/running-league/resolve-adult-running-member-ids'
import {
  mapLeagueParticipantRow,
  mapLeagueMileageLogRow,
  mapLeagueRecordRow,
  runPortalParticipantSelectQuery,
} from '@/lib/running-league/league-row-mappers'
import { buildLeaderboard, type RunningLeagueRankRow } from '@/lib/running-league/scoring'
import type { PbDistanceLeaderboard } from '@/lib/running-league/pb-leaderboard'

export const CENTER_PORTAL_RANKINGS_CACHE_TAG = 'center-portal-rankings'

const RANKINGS_LOAD_ERROR = '데이터를 불러오지 못했습니다. 다시 시도해주세요.'

/** 마일리지 랭킹·월 필터용 — 24개월 전체 대신 최근 3개월만 조회 */
const MILEAGE_RANKING_LOOKBACK_MONTHS = 3

const EMPTY_MILEAGE_LEADERBOARD: MileageDistanceLeaderboard = { ranked: [], unranked: [] }
const EMPTY_PB_LEADERBOARD: PbDistanceLeaderboard = { ranked: [], unranked: [] }

export type CenterPortalRankingsSnapshot = {
  pb5kLeaderboard: PbDistanceLeaderboard
  pb10kLeaderboard: PbDistanceLeaderboard
  pbHalfLeaderboard: PbDistanceLeaderboard
  pbFullLeaderboard: PbDistanceLeaderboard
  mileageLeaderboard: MileageDistanceLeaderboard
  scoreLeaderboard: RunningLeagueRankRow[]
  rankingBundle: MemberRunningLeagueRankingBundle | null
  rankingsError: string | null
  tableReady: boolean
}

function isMissingTableError(error: { code?: string } | null): boolean {
  return error?.code === '42P01'
}

async function rankingLeagueClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function mileageRankingQueryStart(reference = new Date()): string {
  return format(subMonths(reference, MILEAGE_RANKING_LOOKBACK_MONTHS - 1), 'yyyy-MM-dd')
}

function emptyRankingsSnapshot(
  overrides: Partial<CenterPortalRankingsSnapshot> = {},
): CenterPortalRankingsSnapshot {
  return {
    pb5kLeaderboard: EMPTY_PB_LEADERBOARD,
    pb10kLeaderboard: EMPTY_PB_LEADERBOARD,
    pbHalfLeaderboard: EMPTY_PB_LEADERBOARD,
    pbFullLeaderboard: EMPTY_PB_LEADERBOARD,
    mileageLeaderboard: EMPTY_MILEAGE_LEADERBOARD,
    scoreLeaderboard: [],
    rankingBundle: null,
    rankingsError: null,
    tableReady: true,
    ...overrides,
  }
}

/** 리그 전체 랭킹 — 회원별로 동일하므로 캐시 대상 */
export async function loadCenterPortalLeagueRankingsData(
  leagueId: string,
): Promise<CenterPortalRankingsSnapshot> {
  const leaderboardSupabase = await rankingLeagueClient()
  const mileageLookbackStart = mileageRankingQueryStart()
  let rankingsError: string | null = null

  try {
    const allParticipantsResult = await runPortalParticipantSelectQuery((select) =>
      leaderboardSupabase
        .from('running_league_participants')
        .select(select)
        .eq('league_id', leagueId)
        .order('created_at', { ascending: true }),
    )

    const [leaguePbRecordsResult, leagueMileageLogsResult, leaguePbSnapshotsResult] =
      await Promise.all([
        leaderboardSupabase
          .from('running_league_records')
          .select(
            'id, league_id, participant_id, member_id, distance_event, record_phase, time_text, time_seconds, measured_at, notes, created_at, updated_at',
          )
          .eq('league_id', leagueId)
          .in('distance_event', ['5km', '10km', 'half', 'full']),
        leaderboardSupabase
          .from('running_league_mileage_logs')
          .select('id, participant_id, league_id, member_id, distance_km, logged_at')
          .eq('league_id', leagueId)
          .gte('logged_at', mileageLookbackStart),
        leaderboardSupabase
          .from('running_league_pb_snapshots')
          .select(
            'id, participant_id, league_id, member_id, distance_event, time_text, time_seconds, measured_at, created_at',
          )
          .eq('league_id', leagueId),
      ])

    if (isMissingTableError(allParticipantsResult.error)) {
      return emptyRankingsSnapshot({ tableReady: false })
    }

    if (allParticipantsResult.error) {
      console.error('loadCenterPortalLeagueRankingsData.participants', allParticipantsResult.error)
      return emptyRankingsSnapshot({ rankingsError: RANKINGS_LOAD_ERROR })
    }

    const participantRows = allParticipantsResult.data ?? []
    const participants = participantRows.map((row) =>
      mapLeagueParticipantRow(row as Record<string, unknown>),
    )

    const adultMemberIds = await resolveAdultRunningMemberIdsFromParticipants(
      leaderboardSupabase as unknown as ProfilesSupabase,
      participantRows as unknown as Array<{
        member_id?: unknown
        member?: Record<string, unknown> | null
      }>,
    )
    const adultParticipants = filterParticipantsForAdultRunningLeague(participants, adultMemberIds)
    const adultParticipantIds = new Set(adultParticipants.map((row) => row.id))

    const leaguePbRecordsAll = filterRecordsForAdultParticipants(
      (leaguePbRecordsResult.error && !isMissingTableError(leaguePbRecordsResult.error)
        ? []
        : (leaguePbRecordsResult.data ?? [])
      ).map((row) => mapLeagueRecordRow(row as Record<string, unknown>)),
      adultParticipantIds,
    )
    if (leaguePbRecordsResult.error && !isMissingTableError(leaguePbRecordsResult.error)) {
      console.error('loadCenterPortalLeagueRankingsData.pbRecords', leaguePbRecordsResult.error)
      rankingsError = RANKINGS_LOAD_ERROR
    }

    const leaguePbSnapshots =
      leaguePbSnapshotsResult.error && !isMissingTableError(leaguePbSnapshotsResult.error)
        ? []
        : filterRecordsForAdultParticipants(
            (leaguePbSnapshotsResult.data ?? []).map((row) =>
              mapPbSnapshotRow(row as Record<string, unknown>),
            ),
            adultParticipantIds,
          )

    const leaguePbRecordsWithSnapshots = expandPbTrendRecordsWithSnapshots(
      leaguePbRecordsAll,
      leaguePbSnapshots,
    )

    const leaguePbRecords = leaguePbRecordsWithSnapshots.filter(
      (row) => row.record_phase === 'other' || row.record_phase === 'pb_history',
    )

    const leagueMileageLogs = filterRecordsForAdultParticipants(
      (leagueMileageLogsResult.error && !isMissingTableError(leagueMileageLogsResult.error)
        ? []
        : (leagueMileageLogsResult.data ?? [])
      ).map((row) => mapLeagueMileageLogRow(row as Record<string, unknown>)),
      adultParticipantIds,
    )
    if (leagueMileageLogsResult.error && !isMissingTableError(leagueMileageLogsResult.error)) {
      console.error('loadCenterPortalLeagueRankingsData.mileageLogs', leagueMileageLogsResult.error)
      rankingsError = RANKINGS_LOAD_ERROR
    }

    const rankingBundle: MemberRunningLeagueRankingBundle = {
      participants: adultParticipants,
      pbRecords: leaguePbRecordsWithSnapshots,
      mileageLogs: leagueMileageLogs,
    }

    return {
      pb5kLeaderboard: buildPbDistanceLeaderboard(adultParticipants, leaguePbRecords, '5km'),
      pb10kLeaderboard: buildPbDistanceLeaderboard(adultParticipants, leaguePbRecords, '10km'),
      pbHalfLeaderboard: buildPbDistanceLeaderboard(adultParticipants, leaguePbRecords, 'half'),
      pbFullLeaderboard: buildPbDistanceLeaderboard(adultParticipants, leaguePbRecords, 'full'),
      mileageLeaderboard: buildMileageDistanceLeaderboard(adultParticipants, leagueMileageLogs),
      scoreLeaderboard: buildLeaderboard(adultParticipants),
      rankingBundle,
      rankingsError,
      tableReady: true,
    }
  } catch (error) {
    console.error('loadCenterPortalLeagueRankingsData', error)
    return emptyRankingsSnapshot({ rankingsError: RANKINGS_LOAD_ERROR })
  }
}

export function getCachedCenterPortalLeagueRankings(leagueId: string) {
  const monthKey = format(new Date(), 'yyyy-MM')
  return unstable_cache(
    () => loadCenterPortalLeagueRankingsData(leagueId),
    ['center-portal-league-rankings', leagueId, monthKey],
    { revalidate: 45, tags: [CENTER_PORTAL_RANKINGS_CACHE_TAG] },
  )()
}
