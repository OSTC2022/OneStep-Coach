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
  /** 월 전체 vs 특정 일 기준 */
  mode: 'month' | 'day'
  asOfDate: string
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
  const resolved = resolveEffectiveRankingPeriod(memberMonthKey, null, adminReferenceDate)
  return {
    monthKey: resolved.period.monthKey,
    reference: parseISO(resolved.period.end),
    auto: resolved.auto,
  }
}

/** 월 지정 · 일 지정 · 미지정(자동 월별) */
export function resolveEffectiveRankingPeriod(
  memberMonthKey: string | null | undefined,
  memberAsOfDate: string | null | undefined,
  adminReferenceDate: string | null | undefined,
): { period: RankingPeriod; auto: boolean } {
  const memberDate = memberAsOfDate?.trim().slice(0, 10) || null
  const memberMonth = memberMonthKey?.trim() || null

  if (memberDate) {
    return { period: rankingPeriodFromDayKey(memberDate), auto: false }
  }
  if (memberMonth) {
    return { period: rankingPeriodFromMonthKey(memberMonth), auto: false }
  }

  const adminDate = adminReferenceDate?.trim().slice(0, 10) || null
  if (adminDate) {
    const parsed = parseISO(adminDate)
    if (parsed.getDate() !== 1) {
      return { period: rankingPeriodFromDayKey(adminDate), auto: true }
    }
    const monthKey = toRankingMonthKey(adminDate)
    if (monthKey) {
      return { period: rankingPeriodFromMonthKey(monthKey), auto: true }
    }
  }

  const monthKey = format(new Date(), 'yyyy-MM')
  return { period: rankingPeriodFromMonthKey(monthKey), auto: true }
}

export function rankingPeriodFromMonthKey(monthKey: string): RankingPeriod {
  const reference = parseISO(`${monthKey}-01`)
  const { start, end } = currentMonthDateRange(reference)
  return {
    start,
    end,
    label: formatCurrentMonthRankingLabel(reference),
    monthKey,
    mode: 'month',
    asOfDate: end,
  }
}

export function rankingPeriodFromDayKey(dateKey: string): RankingPeriod {
  const normalized = dateKey.slice(0, 10)
  const reference = parseISO(normalized)
  const { start } = currentMonthDateRange(reference)
  const monthKey = format(reference, 'yyyy-MM')
  return {
    start,
    end: normalized,
    label: format(reference, 'yyyy년 M월 d일', { locale: ko }),
    monthKey,
    mode: 'day',
    asOfDate: normalized,
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
