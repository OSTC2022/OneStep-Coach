import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { buildMemberMileageRankHistorySeries } from '@/lib/running-league/mileage-rank-history'
import { formatPbDistanceLabel } from '@/lib/running-league/pb-distance-labels'
import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { resolvePbTimeSeconds } from '@/lib/running-league/pb-leaderboard'
import { formatSecondsToRunningTime } from '@/lib/running-league/records'
import {
  buildMemberRankingHistorySeries,
  computeMemberPbRankAtDate,
} from '@/lib/running-league/ranking-history'
import type {
  RunningLeagueMileageLog,
  RunningLeagueParticipant,
  RunningLeagueRecord,
} from '@/lib/types'
import type { RankingView } from '@/lib/running-league/ranking-view'

export type LeagueMomentumMember = {
  memberId: string
  memberName: string
  headline: string
  detail: string
  kind?: 'rank_riser' | 'pb_update'
  pbDistance?: PbLeaderboardDistance
}

export type LeagueMomentumSnapshot = {
  topRiser: LeagueMomentumMember | null
  recentPbUpdates: LeagueMomentumMember[]
}

function formatShortDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

function resolveParticipantName(participant: RunningLeagueParticipant | undefined): string {
  return participant?.member?.name?.trim() || '회원'
}

function monthRankDelta(
  points: ReadonlyArray<{ date: string; rank: number | null }>,
  monthStart: string,
  monthEnd: string,
): { delta: number; startRank: number; endRank: number } | null {
  const inMonth = points.filter(
    (point) => point.date >= monthStart && point.date <= monthEnd && point.rank != null,
  )
  if (inMonth.length < 2) return null

  const startRank = inMonth[0].rank as number
  const endRank = inMonth[inMonth.length - 1].rank as number
  const delta = startRank - endRank
  if (delta <= 0) return null

  return { delta, startRank, endRank }
}

/** 이번 달 가장 많이 순위가 오른 회원 */
export function buildTopMonthlyRankRiser(input: {
  rankingView: RankingView
  distance: PbLeaderboardDistance
  participants: ReadonlyArray<RunningLeagueParticipant>
  records: ReadonlyArray<RunningLeagueRecord>
  mileageLogs: ReadonlyArray<RunningLeagueMileageLog>
  monthStart: string
  monthEnd: string
}): LeagueMomentumMember | null {
  let best: {
    memberId: string
    memberName: string
    delta: number
    startRank: number
    endRank: number
  } | null = null

  for (const participant of input.participants) {
    const memberId = participant.member_id
    let change: { delta: number; startRank: number; endRank: number } | null = null

    if (input.rankingView === 'pb') {
      const points = buildMemberRankingHistorySeries({
        memberId,
        distance: input.distance,
        participants: input.participants,
        records: input.records,
      })
      change = monthRankDelta(points, input.monthStart, input.monthEnd)
    } else {
      const points = buildMemberMileageRankHistorySeries({
        memberId,
        participants: input.participants,
        logs: input.mileageLogs,
      }).filter((point) => point.date >= input.monthStart && point.date <= input.monthEnd)
      change = monthRankDelta(points, input.monthStart, input.monthEnd)
    }

    if (!change) continue
    if (!best || change.delta > best.delta) {
      best = {
        memberId,
        memberName: resolveParticipantName(participant),
        ...change,
      }
    }
  }

  if (!best) return null

  return {
    memberId: best.memberId,
    memberName: best.memberName,
    headline: `${best.startRank}위 → ${best.endRank}위`,
    detail: `▲${best.delta} 계단 상승`,
    kind: 'rank_riser',
  }
}

/** 최근 PB 갱신 회원 (이번 달, 거리별) */
export function buildRecentPbUpdates(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  records: ReadonlyArray<RunningLeagueRecord>
  monthStart: string
  monthEnd: string
  distance?: PbLeaderboardDistance | null
  limit?: number
}): LeagueMomentumMember[] {
  const participantByMemberId = new Map(
    input.participants.map((row) => [row.member_id, row]),
  )
  const limit = input.limit ?? 3

  const candidates = input.records
    .filter((record) => {
      if (record.measured_at < input.monthStart || record.measured_at > input.monthEnd) {
        return false
      }
      if (input.distance && record.distance_event !== input.distance) return false
      if (
        record.record_phase !== 'other' &&
        record.record_phase !== 'month_end' &&
        record.record_phase !== 'mid_month'
      ) {
        return false
      }
      return resolvePbTimeSeconds(record) != null
    })
    .sort((a, b) => {
      const byDate = b.measured_at.localeCompare(a.measured_at)
      if (byDate !== 0) return byDate
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
    })

  const seen = new Set<string>()
  const results: LeagueMomentumMember[] = []

  for (const record of candidates) {
    if (seen.has(record.member_id)) continue
    seen.add(record.member_id)

    const seconds = resolvePbTimeSeconds(record)
    if (seconds == null) continue

    const participant = participantByMemberId.get(record.member_id)
    const distanceLabel = formatPbDistanceLabel(record.distance_event as PbLeaderboardDistance)

    results.push({
      memberId: record.member_id,
      memberName: resolveParticipantName(participant),
      headline: distanceLabel,
      detail: `${formatSecondsToRunningTime(seconds)} · ${formatShortDate(record.measured_at)}`,
      kind: 'pb_update',
      pbDistance: record.distance_event as PbLeaderboardDistance,
    })

    if (results.length >= limit) break
  }

  return results
}

export function buildLeagueMomentumSnapshot(input: {
  rankingView: RankingView
  distance: PbLeaderboardDistance
  participants: ReadonlyArray<RunningLeagueParticipant>
  records: ReadonlyArray<RunningLeagueRecord>
  mileageLogs: ReadonlyArray<RunningLeagueMileageLog>
  monthStart: string
  monthEnd: string
  recentPbLimit?: number
}): LeagueMomentumSnapshot {
  return {
    topRiser: buildTopMonthlyRankRiser(input),
    recentPbUpdates: buildRecentPbUpdates({
      participants: input.participants,
      records: input.records,
      monthStart: input.monthStart,
      monthEnd: input.monthEnd,
      distance: input.rankingView === 'pb' ? input.distance : null,
      limit: input.recentPbLimit,
    }),
  }
}

/** 월초 대비 현재 순위 상승폭 (보조) */
export function resolveMonthStartToNowRankDelta(input: {
  memberId: string
  rankingView: RankingView
  distance: PbLeaderboardDistance
  participants: ReadonlyArray<RunningLeagueParticipant>
  records: ReadonlyArray<RunningLeagueRecord>
  monthStart: string
  asOfDate: string
}): number | null {
  if (input.rankingView !== 'pb') return null

  const startRank = computeMemberPbRankAtDate({
    memberId: input.memberId,
    distance: input.distance,
    participants: input.participants,
    records: input.records,
    asOfDate: input.monthStart,
  })
  const endRank = computeMemberPbRankAtDate({
    memberId: input.memberId,
    distance: input.distance,
    participants: input.participants,
    records: input.records,
    asOfDate: input.asOfDate,
  })
  if (startRank == null || endRank == null || startRank <= endRank) return null
  return startRank - endRank
}
