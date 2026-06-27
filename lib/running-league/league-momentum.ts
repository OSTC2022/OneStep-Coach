import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
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

export type LeagueMomentumKind =
  | 'rank_riser'
  | 'mileage_riser'
  | 'pb_update'
  | 'mileage_surge'

export type LeagueMomentumMember = {
  memberId: string
  memberName: string
  headline: string
  detail: string
  kind: LeagueMomentumKind
  pbDistance?: PbLeaderboardDistance
  /** 정렬·중복 제거용 우선순위 (높을수록 상단) */
  priority?: number
}

export type LeagueMomentumSnapshot = {
  topRiser: LeagueMomentumMember | null
  recentPbUpdates: LeagueMomentumMember[]
  hotIssues: LeagueMomentumMember[]
}

export const LEAGUE_HOT_ISSUE_LIMIT = 4

export function getLeagueHotIssueLabel(kind: LeagueMomentumKind): string {
  switch (kind) {
    case 'rank_riser':
      return 'PB 순위 급상승'
    case 'mileage_riser':
      return '마일리지 순위 급상승'
    case 'pb_update':
      return 'PB 갱신'
    case 'mileage_surge':
      return '마일리지 폭주'
  }
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

  const kind = input.rankingView === 'mileage' ? 'mileage_riser' : 'rank_riser'

  return {
    memberId: best.memberId,
    memberName: best.memberName,
    headline: `${best.startRank}위 → ${best.endRank}위`,
    detail: `▲${best.delta} 계단 상승`,
    kind,
    priority: 100 + best.delta,
  }
}

/** 이번 달 가장 많이 뛴 회원 (누적 km) */
export function buildTopMileageSurge(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  mileageLogs: ReadonlyArray<RunningLeagueMileageLog>
  monthStart: string
  monthEnd: string
}): LeagueMomentumMember | null {
  const kmByMember = new Map<string, number>()

  for (const log of input.mileageLogs) {
    if (log.logged_at < input.monthStart || log.logged_at > input.monthEnd) continue
    const km = Number(log.distance_km)
    if (!Number.isFinite(km) || km <= 0) continue
    kmByMember.set(log.member_id, (kmByMember.get(log.member_id) ?? 0) + km)
  }

  let best: { memberId: string; km: number } | null = null
  for (const [memberId, km] of kmByMember) {
    if (!best || km > best.km) best = { memberId, km }
  }
  if (!best || best.km < 5) return null

  const participant = input.participants.find((row) => row.member_id === best!.memberId)

  return {
    memberId: best.memberId,
    memberName: resolveParticipantName(participant),
    headline: `${formatMileageKmDisplay(best.km)} 누적`,
    detail: '이번 달 최다 마일리지',
    kind: 'mileage_surge',
    priority: 70 + Math.min(best.km, 50),
  }
}

function dedupeHotIssuesByMember(
  items: LeagueMomentumMember[],
  limit: number,
): LeagueMomentumMember[] {
  const byMember = new Map<string, LeagueMomentumMember>()

  for (const item of items) {
    const existing = byMember.get(item.memberId)
    if (!existing || (item.priority ?? 0) > (existing.priority ?? 0)) {
      byMember.set(item.memberId, item)
    }
  }

  return [...byMember.values()]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, limit)
}

/** 최근 핫한 이슈 최대 4건 (순위 상승 · PB 갱신 · 마일리지) */
export function buildLeagueHotIssues(input: {
  rankingView: RankingView
  distance: PbLeaderboardDistance
  participants: ReadonlyArray<RunningLeagueParticipant>
  records: ReadonlyArray<RunningLeagueRecord>
  mileageLogs: ReadonlyArray<RunningLeagueMileageLog>
  monthStart: string
  monthEnd: string
  limit?: number
}): LeagueMomentumMember[] {
  const limit = input.limit ?? LEAGUE_HOT_ISSUE_LIMIT
  const candidates: LeagueMomentumMember[] = []

  const pbRiser = buildTopMonthlyRankRiser({
    ...input,
    rankingView: 'pb',
  })
  if (pbRiser) candidates.push(pbRiser)

  const mileageRiser = buildTopMonthlyRankRiser({
    ...input,
    rankingView: 'mileage',
  })
  if (mileageRiser) candidates.push(mileageRiser)

  const surge = buildTopMileageSurge({
    participants: input.participants,
    mileageLogs: input.mileageLogs,
    monthStart: input.monthStart,
    monthEnd: input.monthEnd,
  })
  if (surge) candidates.push(surge)

  const pbUpdates = buildRecentPbUpdates({
    participants: input.participants,
    records: input.records,
    monthStart: input.monthStart,
    monthEnd: input.monthEnd,
    distance: null,
    limit: 3,
  })
  for (const [index, item] of pbUpdates.entries()) {
    candidates.push({
      ...item,
      priority: 85 - index * 5,
    })
  }

  return dedupeHotIssuesByMember(candidates, limit)
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
      priority: 80,
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
  const topRiser = buildTopMonthlyRankRiser(input)
  const recentPbUpdates = buildRecentPbUpdates({
    participants: input.participants,
    records: input.records,
    monthStart: input.monthStart,
    monthEnd: input.monthEnd,
    distance: input.rankingView === 'pb' ? input.distance : null,
    limit: input.recentPbLimit,
  })
  const hotIssues = buildLeagueHotIssues({
    rankingView: input.rankingView,
    distance: input.distance,
    participants: input.participants,
    records: input.records,
    mileageLogs: input.mileageLogs,
    monthStart: input.monthStart,
    monthEnd: input.monthEnd,
    limit: LEAGUE_HOT_ISSUE_LIMIT,
  })

  return {
    topRiser,
    recentPbUpdates,
    hotIssues,
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
