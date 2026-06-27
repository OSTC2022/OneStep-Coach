import { buildMileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import {
  buildPbLeaderboardForPeriod,
  filterMileageLogsForPeriod,
  type RankingPeriod,
} from '@/lib/running-league/ranking-period'
import { filterParticipantsByGender, type RankingGenderFilter } from '@/lib/running-league/ranking-gender'
import { buildLeaderboard, type RunningLeagueRankRow } from '@/lib/running-league/scoring'
import type { MileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import { expandPortalPbRecordsWithNotesHistory } from '@/lib/running-league/pb-portal-history'
import type { PbDistanceLeaderboard, PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import type { RunningLeagueRecord } from '@/lib/types'

export type FilteredPortalRankings = {
  pbByDistance: Record<PbLeaderboardDistance, PbDistanceLeaderboard>
  mileageLeaderboard: MileageDistanceLeaderboard
  scoreLeaderboard: RunningLeagueRankRow[]
}

function portalPbRecordsForRanking(records: ReadonlyArray<RunningLeagueRecord>) {
  return expandPortalPbRecordsWithNotesHistory(
    records.filter((row) => row.record_phase === 'other' || row.record_phase === 'pb_history'),
  )
}

/** PB 추이 그래프용 — 포털 PB·이력·스냅샷(notes 포함) */
export function filterPortalPbTrendRecords(records: ReadonlyArray<RunningLeagueRecord>) {
  return portalPbRecordsForRanking(records)
}

export function buildFilteredPortalRankings(
  bundle: MemberRunningLeagueRankingBundle | null,
  genderFilter: RankingGenderFilter,
  period?: RankingPeriod | null,
): FilteredPortalRankings | null {
  if (!bundle) return null

  const participants = filterParticipantsByGender(bundle.participants, genderFilter)
  const pbRecords = portalPbRecordsForRanking(bundle.pbRecords)
  const mileageLogs = period
    ? filterMileageLogsForPeriod(bundle.mileageLogs, period)
    : bundle.mileageLogs
  const asOfDate = period?.end ?? null

  return {
    pbByDistance: {
      '5km': buildPbLeaderboardForPeriod(participants, pbRecords, '5km', asOfDate),
      '10km': buildPbLeaderboardForPeriod(participants, pbRecords, '10km', asOfDate),
      half: buildPbLeaderboardForPeriod(participants, pbRecords, 'half', asOfDate),
      full: buildPbLeaderboardForPeriod(participants, pbRecords, 'full', asOfDate),
    },
    mileageLeaderboard: buildMileageDistanceLeaderboard(participants, mileageLogs),
    scoreLeaderboard: buildLeaderboard(participants),
  }
}
