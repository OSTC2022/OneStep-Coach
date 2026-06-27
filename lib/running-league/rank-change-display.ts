import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { buildMemberMileageRankChangeSeries } from '@/lib/running-league/mileage-rank-history'
import { buildMemberPbRankChangeSeries } from '@/lib/running-league/ranking-history'
import type { RunningLeagueMileageLog, RunningLeagueParticipant, RunningLeagueRecord } from '@/lib/types'

export type RankChangeDelta =
  | { kind: 'up'; steps: number }
  | { kind: 'down'; steps: number }
  | { kind: 'frozen' }

function resolveRankChangeFromRankPoints(
  points: ReadonlyArray<{ rank: number | null }>,
): RankChangeDelta | null {
  const ranked = points.filter((point) => point.rank != null)
  if (ranked.length === 0) return null
  if (ranked.length === 1) return { kind: 'frozen' }

  const firstRank = ranked[0]?.rank
  const lastRank = ranked[ranked.length - 1]?.rank
  if (firstRank == null || lastRank == null) return null
  if (firstRank === lastRank) return { kind: 'frozen' }

  const delta = firstRank - lastRank
  if (delta > 0) return { kind: 'up', steps: delta }
  return { kind: 'down', steps: Math.abs(delta) }
}

export function resolveMemberPbRankChangeDelta(
  memberId: string,
  distance: PbLeaderboardDistance,
  participants: ReadonlyArray<RunningLeagueParticipant>,
  records: ReadonlyArray<RunningLeagueRecord>,
): RankChangeDelta | null {
  const points = buildMemberPbRankChangeSeries({
    memberId,
    distance,
    participants,
    records,
  })
  return resolveRankChangeFromRankPoints(points)
}

export function resolveMemberMileageRankChangeDelta(
  memberId: string,
  participants: ReadonlyArray<RunningLeagueParticipant>,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
): RankChangeDelta | null {
  const points = buildMemberMileageRankChangeSeries({
    memberId,
    participants,
    logs,
  })
  return resolveRankChangeFromRankPoints(points)
}

/** @deprecated resolveMemberPbRankChangeDelta 사용 */
export function formatMemberRankChangeHint(
  memberId: string,
  distance: PbLeaderboardDistance,
  participants: ReadonlyArray<RunningLeagueParticipant>,
  records: ReadonlyArray<RunningLeagueRecord>,
): string | null {
  const delta = resolveMemberPbRankChangeDelta(memberId, distance, participants, records)
  if (!delta) return null
  if (delta.kind === 'frozen') return '-'
  if (delta.kind === 'up') return `▲${delta.steps}`
  return `▼${delta.steps}`
}
