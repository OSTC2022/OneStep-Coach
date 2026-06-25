import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { maskMemberNameForRanking } from '@/lib/running-league/mask-member-name'
import type { RunningLeagueParticipant, RunningLeagueRecord } from '@/lib/types'
import {
  buildMemberRankingHistorySeries,
  collectPbRankSnapshotDates,
  computeMemberPbRankAtDate,
  type RankingHistoryPoint,
} from '@/lib/running-league/ranking-history'

export type LeagueRankMemberSeries = {
  memberId: string
  memberName: string
  isSelected: boolean
}

export type LeagueRankComparisonRow = {
  date: string
  label: string
  [key: `rank_${string}`]: number | null | undefined
}

export type LeagueRankComparisonChart = {
  rows: LeagueRankComparisonRow[]
  members: LeagueRankMemberSeries[]
  /** null이면 전체 회원 동시 표시(집계) 모드 */
  selectedMemberId: string | null
}

function formatChartDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

function formatMonthLabel(value: string): string {
  try {
    return format(parseISO(value), 'M월', { locale: ko })
  } catch {
    return value
  }
}

/** 순위 궤적 텍스트 — 예: 18위 → 13위 → 9위 → 7위 */
export function formatRankTrajectory(points: Array<{ rank: number | null }>): string | null {
  const ranks = points.map((p) => p.rank).filter((rank): rank is number => rank != null)
  if (ranks.length === 0) return null
  return ranks.map((rank) => `${rank}위`).join(' → ')
}

/**
 * 리그 내 다른 회원 순위(흐림) + 선택 회원(강조) 비교 차트 데이터
 */
export function buildLeagueRankComparisonChart(input: {
  selectedMemberId: string
  distance: PbLeaderboardDistance
  participants: ReadonlyArray<RunningLeagueParticipant>
  records: ReadonlyArray<RunningLeagueRecord>
  highlightMemberId?: string | null
  maxOtherMembers?: number
}): LeagueRankComparisonChart | null {
  const selectedPoints = buildMemberRankingHistorySeries({
    memberId: input.selectedMemberId,
    distance: input.distance,
    participants: input.participants,
    records: input.records,
  })

  const dates = collectPbRankSnapshotDates({
    distance: input.distance,
    records: input.records,
    memberPoints: selectedPoints,
  })
  if (dates.length === 0) return null

  const latestDate = dates[dates.length - 1]
  const rankedAtLatest = input.participants
    .map((participant) => ({
      memberId: participant.member_id,
      memberName: participant.member?.name?.trim() || '회원',
      rank: computeMemberPbRankAtDate({
        memberId: participant.member_id,
        distance: input.distance,
        participants: input.participants,
        records: input.records,
        asOfDate: latestDate,
      }),
    }))
    .filter((row) => row.rank != null)
    .sort((a, b) => (a.rank as number) - (b.rank as number))

  const maxOthers = input.maxOtherMembers ?? 8
  const otherMemberIds = new Set(
    rankedAtLatest
      .filter((row) => row.memberId !== input.selectedMemberId)
      .slice(0, maxOthers)
      .map((row) => row.memberId),
  )

  const chartMemberIds = new Set([input.selectedMemberId, ...otherMemberIds])
  const members: LeagueRankMemberSeries[] = [...chartMemberIds].map((memberId) => {
    const participant = input.participants.find((row) => row.member_id === memberId)
    const name = participant?.member?.name?.trim() || '회원'
    const isMe = input.highlightMemberId != null && memberId === input.highlightMemberId
    const displayName = isMe ? name : maskMemberNameForRanking(name)
    return {
      memberId,
      memberName: displayName,
      isSelected: memberId === input.selectedMemberId,
    }
  })

  members.sort((a, b) => {
    if (a.isSelected) return -1
    if (b.isSelected) return 1
    return a.memberName.localeCompare(b.memberName, 'ko')
  })

  const rows: LeagueRankComparisonRow[] = dates.map((date) => {
    const row: LeagueRankComparisonRow = {
      date,
      label: formatChartDate(date),
    }
    for (const member of members) {
      row[`rank_${member.memberId}`] = computeMemberPbRankAtDate({
        memberId: member.memberId,
        distance: input.distance,
        participants: input.participants,
        records: input.records,
        asOfDate: date,
      })
    }
    return row
  })

  return {
    rows,
    members,
    selectedMemberId: input.selectedMemberId,
  }
}

/**
 * 성별·필터 범위 내 전체 회원 순위 궤적(집계 그래프)
 */
export function buildLeagueAggregateRankComparisonChart(input: {
  distance: PbLeaderboardDistance
  participants: ReadonlyArray<RunningLeagueParticipant>
  records: ReadonlyArray<RunningLeagueRecord>
  maxMembers?: number
}): LeagueRankComparisonChart | null {
  const dates = collectPbRankSnapshotDates({
    distance: input.distance,
    records: input.records,
    memberPoints: [],
  })
  if (dates.length === 0) return null

  const latestDate = dates[dates.length - 1]
  const maxMembers = input.maxMembers ?? 20
  const rankedAtLatest = input.participants
    .map((participant) => ({
      memberId: participant.member_id,
      memberName: participant.member?.name?.trim() || '회원',
      rank: computeMemberPbRankAtDate({
        memberId: participant.member_id,
        distance: input.distance,
        participants: input.participants,
        records: input.records,
        asOfDate: latestDate,
      }),
    }))
    .filter((row) => row.rank != null)
    .sort((a, b) => (a.rank as number) - (b.rank as number))
    .slice(0, maxMembers)

  if (rankedAtLatest.length === 0) return null

  const members: LeagueRankMemberSeries[] = rankedAtLatest.map((row) => ({
    memberId: row.memberId,
    memberName: maskMemberNameForRanking(row.memberName),
    isSelected: false,
  }))

  const rows: LeagueRankComparisonRow[] = dates.map((date) => {
    const row: LeagueRankComparisonRow = {
      date,
      label: formatChartDate(date),
    }
    for (const member of members) {
      row[`rank_${member.memberId}`] = computeMemberPbRankAtDate({
        memberId: member.memberId,
        distance: input.distance,
        participants: input.participants,
        records: input.records,
        asOfDate: date,
      })
    }
    return row
  })

  return {
    rows,
    members,
    selectedMemberId: null,
  }
}

export function formatRankComparisonCaption(
  points: RankingHistoryPoint[],
  distanceLabel: string,
): { title: string; trajectory: string | null } {
  const rankPoints = points.filter((p) => p.rank != null)
  const trajectory = formatRankTrajectory(rankPoints)
  const monthSpan =
    rankPoints.length >= 2
      ? `${formatMonthLabel(rankPoints[0].date)} ~ ${formatMonthLabel(rankPoints[rankPoints.length - 1].date)}`
      : null

  return {
    title: monthSpan ? `이 회원의 최근 순위 변화 (${monthSpan})` : '이 회원의 순위 변화',
    trajectory: trajectory ? `${distanceLabel} 기준: ${trajectory}` : null,
  }
}
