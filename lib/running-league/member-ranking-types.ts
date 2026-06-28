import type { MileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import type { PbDistanceLeaderboard } from '@/lib/running-league/pb-leaderboard'
import type { RunningLeagueRankRow } from '@/lib/running-league/scoring'
import type {
  RunningLeague,
  RunningLeagueMileageLog,
  RunningLeagueParticipant,
  RunningLeagueRecord,
} from '@/lib/types'

export type MemberRunningLeagueRankingBundle = {
  participants: RunningLeagueParticipant[]
  pbRecords: RunningLeagueRecord[]
  mileageLogs: RunningLeagueMileageLog[]
}

export type MemberRunningLeagueHome = {
  league: RunningLeague | null
  participant: RunningLeagueParticipant | null
  pbRecords: RunningLeagueRecord[]
  mileageLogs: RunningLeagueMileageLog[]
  pb5kLeaderboard: PbDistanceLeaderboard
  pb10kLeaderboard: PbDistanceLeaderboard
  pbHalfLeaderboard: PbDistanceLeaderboard
  pbFullLeaderboard: PbDistanceLeaderboard
  mileageLeaderboard: MileageDistanceLeaderboard
  scoreLeaderboard: RunningLeagueRankRow[]
  rankingBundle: MemberRunningLeagueRankingBundle | null
  tableReady: boolean
  rankingsError: string | null
}
