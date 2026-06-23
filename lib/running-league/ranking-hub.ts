import { buildMileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import {
  buildPbDistanceLeaderboard,
  type PbDistanceLeaderboard,
  type PbLeaderboardDistance,
} from '@/lib/running-league/pb-leaderboard'
import { filterParticipantsByGender, type RankingGenderFilter } from '@/lib/running-league/ranking-gender'
import { buildLeaderboard, type RunningLeagueRankRow } from '@/lib/running-league/scoring'
import type { MileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import type { RunningLeagueRecord } from '@/lib/types'

export type FilteredPortalRankings = {
  pbByDistance: Record<PbLeaderboardDistance, PbDistanceLeaderboard>
  mileageLeaderboard: MileageDistanceLeaderboard
  scoreLeaderboard: RunningLeagueRankRow[]
}

function otherPhasePbRecords(records: ReadonlyArray<RunningLeagueRecord>) {
  return records.filter((row) => row.record_phase === 'other')
}

export function buildFilteredPortalRankings(
  bundle: MemberRunningLeagueRankingBundle | null,
  genderFilter: RankingGenderFilter,
): FilteredPortalRankings | null {
  if (!bundle) return null

  const participants = filterParticipantsByGender(bundle.participants, genderFilter)
  const pbRecords = otherPhasePbRecords(bundle.pbRecords)

  return {
    pbByDistance: {
      '5km': buildPbDistanceLeaderboard(participants, pbRecords, '5km'),
      '10km': buildPbDistanceLeaderboard(participants, pbRecords, '10km'),
      half: buildPbDistanceLeaderboard(participants, pbRecords, 'half'),
      full: buildPbDistanceLeaderboard(participants, pbRecords, 'full'),
    },
    mileageLeaderboard: buildMileageDistanceLeaderboard(participants, bundle.mileageLogs),
    scoreLeaderboard: buildLeaderboard(participants),
  }
}
