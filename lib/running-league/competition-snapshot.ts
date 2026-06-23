import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
import type { MileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import type { PbDistanceLeaderboard } from '@/lib/running-league/pb-leaderboard'
import { formatSecondsToRunningTime } from '@/lib/running-league/records'
import type { RunningLeagueRankRow } from '@/lib/running-league/scoring'

export type CompetitionRankStatus =
  | { kind: 'leader'; label: string }
  | { kind: 'ranked'; rank: number; total: number; gapLabel: string }
  | { kind: 'unranked'; total: number; label: string }
  | { kind: 'none'; label: string }

export interface MemberCompetitionSnapshot {
  pb5k: CompetitionRankStatus
  pb10k: CompetitionRankStatus
  mileage: CompetitionRankStatus
  leagueScore: CompetitionRankStatus
}

function getLeaderboardTotal(
  leaderboard: PbDistanceLeaderboard | MileageDistanceLeaderboard,
): number {
  return leaderboard.ranked.length + leaderboard.unranked.length
}

function formatPbGapToLeader(deltaSeconds: number): string {
  if (deltaSeconds <= 0) return '1위'
  return `1위보다 ${formatSecondsToRunningTime(deltaSeconds)} 느림`
}

function formatMileageGapToLeader(deltaKm: number): string {
  if (deltaKm <= 0) return '1위'
  return `1위까지 ${formatMileageKmDisplay(deltaKm)}`
}

function formatScoreGapToLeader(deltaScore: number): string {
  if (deltaScore <= 0) return '1위'
  const rounded = Math.round(deltaScore * 10) / 10
  const value = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `1위까지 ${value}점`
}

function buildPbStatus(
  leaderboard: PbDistanceLeaderboard,
  memberId?: string | null,
): CompetitionRankStatus {
  const total = getLeaderboardTotal(leaderboard)
  if (!memberId || total <= 0) {
    return { kind: 'none', label: '기록 없음' }
  }

  const myRow = leaderboard.ranked.find((row) => row.memberId === memberId)
  if (!myRow) {
    if (leaderboard.unranked.some((row) => row.memberId === memberId)) {
      return { kind: 'unranked', total, label: 'PB 미등록' }
    }
    return { kind: 'none', label: '참가 정보 없음' }
  }

  if (myRow.rank === 1) {
    return { kind: 'leader', label: '1위' }
  }

  const leader = leaderboard.ranked[0]
  const gapSeconds = leader ? myRow.timeSeconds - leader.timeSeconds : 0

  return {
    kind: 'ranked',
    rank: myRow.rank,
    total,
    gapLabel: formatPbGapToLeader(gapSeconds),
  }
}

function buildMileageStatus(
  leaderboard: MileageDistanceLeaderboard,
  memberId?: string | null,
): CompetitionRankStatus {
  const total = getLeaderboardTotal(leaderboard)
  if (!memberId || total <= 0) {
    return { kind: 'none', label: '기록 없음' }
  }

  const myRow = leaderboard.ranked.find((row) => row.memberId === memberId)
  if (!myRow) {
    if (leaderboard.unranked.some((row) => row.memberId === memberId)) {
      return { kind: 'unranked', total, label: '이번 달 기록 없음' }
    }
    return { kind: 'none', label: '참가 정보 없음' }
  }

  if (myRow.rank === 1) {
    return { kind: 'leader', label: '1위' }
  }

  const leader = leaderboard.ranked[0]
  const gapKm = leader ? leader.mileageKm - myRow.mileageKm : 0

  return {
    kind: 'ranked',
    rank: myRow.rank,
    total,
    gapLabel: formatMileageGapToLeader(gapKm),
  }
}

function buildScoreStatus(
  rows: RunningLeagueRankRow[],
  memberId?: string | null,
): CompetitionRankStatus {
  const total = rows.length
  if (!memberId || total <= 0) {
    return { kind: 'none', label: '집계 전' }
  }

  const myRow = rows.find((row) => row.memberId === memberId)
  if (!myRow) {
    return { kind: 'none', label: '참가 정보 없음' }
  }

  if (myRow.rank === 1) {
    return { kind: 'leader', label: '1위' }
  }

  const leader = rows[0]
  const gapScore = leader ? leader.totalScore - myRow.totalScore : 0

  return {
    kind: 'ranked',
    rank: myRow.rank,
    total,
    gapLabel: formatScoreGapToLeader(gapScore),
  }
}

export function getPbGapLabelForRow(
  row: { rank: number; timeSeconds: number },
  ranked: Array<{ timeSeconds: number }>,
): string | null {
  if (row.rank <= 1) return null
  const leader = ranked[0]
  if (!leader) return null
  return formatPbGapToLeader(row.timeSeconds - leader.timeSeconds)
}

export function getMileageGapLabelForRow(
  row: { rank: number; mileageKm: number },
  ranked: Array<{ mileageKm: number }>,
): string | null {
  if (row.rank <= 1) return null
  const leader = ranked[0]
  if (!leader) return null
  return formatMileageGapToLeader(leader.mileageKm - row.mileageKm)
}

export function getScoreGapLabelForRow(
  row: { rank: number; totalScore: number },
  ranked: Array<{ totalScore: number }>,
): string | null {
  if (row.rank <= 1) return null
  const leader = ranked[0]
  if (!leader) return null
  return formatScoreGapToLeader(leader.totalScore - row.totalScore)
}

export function buildMemberCompetitionSnapshot(input: {
  pb5kLeaderboard: PbDistanceLeaderboard
  pb10kLeaderboard: PbDistanceLeaderboard
  mileageLeaderboard: MileageDistanceLeaderboard
  scoreLeaderboard: RunningLeagueRankRow[]
  memberId?: string | null
}): MemberCompetitionSnapshot {
  return {
    pb5k: buildPbStatus(input.pb5kLeaderboard, input.memberId),
    pb10k: buildPbStatus(input.pb10kLeaderboard, input.memberId),
    mileage: buildMileageStatus(input.mileageLeaderboard, input.memberId),
    leagueScore: buildScoreStatus(input.scoreLeaderboard, input.memberId),
  }
}

export function formatCompetitionStatusText(status: CompetitionRankStatus): string {
  if (status.kind === 'leader') return status.label
  if (status.kind === 'ranked') {
    return `${status.rank}위 / ${status.total}명 · ${status.gapLabel}`
  }
  if (status.kind === 'unranked') {
    return `${status.label} · ${status.total}명 참여`
  }
  return status.label
}
