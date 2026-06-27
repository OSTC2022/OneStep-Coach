import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  buildPbDistanceLeaderboard,
  type PbDistanceLeaderboard,
  type PbLeaderboardDistance,
} from '@/lib/running-league/pb-leaderboard'
import { bestPbSecondsAsOf } from '@/lib/running-league/ranking-history'
import { formatSecondsToRunningTime } from '@/lib/running-league/records'
import type { RunningLeagueMileageLog, RunningLeagueParticipant, RunningLeagueRecord } from '@/lib/types'
import { currentMonthDateRange, formatCurrentMonthRankingLabel } from '@/lib/running-league/month-range'

export type RankingPeriod = {
  start: string
  end: string
  label: string
  monthKey: string
}

export function toRankingMonthKey(value: Date | string | null | undefined): string | null {
  if (!value) return null
  try {
    const date = typeof value === 'string' ? parseISO(value.slice(0, 10)) : value
    return format(date, 'yyyy-MM')
  } catch {
    return null
  }
}

/** 회원 선택 > 관리자 기본일 > 오늘 기준 월 */
export function resolveEffectiveRankingMonth(
  memberMonthKey: string | null | undefined,
  adminReferenceDate: string | null | undefined,
): { monthKey: string; reference: Date; auto: boolean } {
  if (memberMonthKey) {
    return {
      monthKey: memberMonthKey,
      reference: parseISO(`${memberMonthKey}-01`),
      auto: false,
    }
  }

  const adminMonthKey = toRankingMonthKey(adminReferenceDate)
  if (adminMonthKey) {
    return {
      monthKey: adminMonthKey,
      reference: parseISO(`${adminMonthKey}-01`),
      auto: true,
    }
  }

  const now = new Date()
  return {
    monthKey: format(now, 'yyyy-MM'),
    reference: now,
    auto: true,
  }
}

export function rankingPeriodFromMonthKey(monthKey: string): RankingPeriod {
  const reference = parseISO(`${monthKey}-01`)
  const { start, end } = currentMonthDateRange(reference)
  return {
    start,
    end,
    label: formatCurrentMonthRankingLabel(reference),
    monthKey,
  }
}

export function filterMileageLogsForPeriod(
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  period: Pick<RankingPeriod, 'start' | 'end'>,
): RunningLeagueMileageLog[] {
  return logs.filter((log) => log.logged_at >= period.start && log.logged_at <= period.end)
}

function assignPbRanks(
  rows: Array<{
    participantId: string
    memberId: string
    memberName: string
    distanceEvent: PbLeaderboardDistance
    timeText: string
    timeSeconds: number
  }>,
) {
  let rank = 0
  let previousSeconds: number | null = null

  return rows.map((row, index) => {
    if (previousSeconds === null || row.timeSeconds !== previousSeconds) {
      rank = index + 1
      previousSeconds = row.timeSeconds
    }
    return { ...row, rank }
  })
}

export function buildPbDistanceLeaderboardAsOf(
  participants: RunningLeagueParticipant[],
  pbRecords: RunningLeagueRecord[],
  distance: PbLeaderboardDistance,
  asOfDate: string,
): PbDistanceLeaderboard {
  const rankedCandidates: Array<{
    participantId: string
    memberId: string
    memberName: string
    distanceEvent: PbLeaderboardDistance
    timeText: string
    timeSeconds: number
  }> = []
  const unranked: PbDistanceLeaderboard['unranked'] = []

  for (const participant of participants) {
    const memberName = participant.member?.name?.trim() || '회원'
    const timeSeconds = bestPbSecondsAsOf({
      participantId: participant.id,
      distance,
      records: pbRecords,
      asOfDate,
    })

    if (timeSeconds == null) {
      unranked.push({
        participantId: participant.id,
        memberId: participant.member_id,
        memberName,
      })
      continue
    }

    rankedCandidates.push({
      participantId: participant.id,
      memberId: participant.member_id,
      memberName,
      distanceEvent: distance,
      timeText: formatSecondsToRunningTime(timeSeconds),
      timeSeconds,
    })
  }

  const sorted = [...rankedCandidates].sort((a, b) => {
    if (a.timeSeconds !== b.timeSeconds) return a.timeSeconds - b.timeSeconds
    return a.memberName.localeCompare(b.memberName, 'ko')
  })

  return {
    ranked: assignPbRanks(sorted),
    unranked: unranked.sort((a, b) => a.memberName.localeCompare(b.memberName, 'ko')),
  }
}

export function formatRankingMonthInputLabel(monthKey: string): string {
  try {
    return format(parseISO(`${monthKey}-01`), 'yyyy년 M월', { locale: ko })
  } catch {
    return monthKey
  }
}

/** asOfDate 없으면 현재 PB 리더보드 */
export function buildPbLeaderboardForPeriod(
  participants: RunningLeagueParticipant[],
  pbRecords: RunningLeagueRecord[],
  distance: PbLeaderboardDistance,
  asOfDate?: string | null,
): PbDistanceLeaderboard {
  if (!asOfDate) {
    return buildPbDistanceLeaderboard(participants, pbRecords, distance)
  }
  return buildPbDistanceLeaderboardAsOf(participants, pbRecords, distance, asOfDate)
}
