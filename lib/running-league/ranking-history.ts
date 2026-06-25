import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { resolvePbTimeSeconds } from '@/lib/running-league/pb-leaderboard'
import { formatSecondsToRunningTime } from '@/lib/running-league/records'
import type { RunningLeagueParticipant, RunningLeagueRecord } from '@/lib/types'

export type RankingHistoryPoint = {
  date: string
  label: string
  /** 누적 PB(날짜순 running minimum) — 기록 변화 그래프 PB선 */
  timeSeconds: number
  timeText: string
  /** 해당 시점 실제 측정 기록 — 전체 기록선 */
  rawTimeSeconds: number
  rawTimeText: string
  /** 이번 측정으로 PB가 갱신됐는지 */
  isPbImprovement: boolean
  rank: number | null
  phase: string
}

function formatChartDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

function phaseLabel(phase: string): string {
  if (phase === 'month_start') return '월초'
  if (phase === 'month_end') return '월말'
  if (phase === 'mid_month') return '중간'
  if (phase === 'pb_history') return '이전 PB'
  return 'PB'
}

/** 해당 날짜까지의 누적 최저 기록(PB) */
export function bestPbSecondsAsOf(input: {
  participantId: string
  distance: PbLeaderboardDistance
  records: ReadonlyArray<RunningLeagueRecord>
  asOfDate: string
}): number | null {
  let best: number | null = null

  for (const record of input.records) {
    if (record.participant_id !== input.participantId) continue
    if (record.distance_event !== input.distance) continue
    if (record.measured_at > input.asOfDate) continue

    const seconds = resolvePbTimeSeconds({
      time_seconds: record.time_seconds,
      time_text: record.time_text,
    })
    if (seconds == null) continue
    if (best == null || seconds < best) best = seconds
  }

  return best
}

/** 스냅샷 날짜 기준 동일 거리 회원 PB 순위 */
export function computeMemberPbRankAtDate(input: {
  memberId: string
  distance: PbLeaderboardDistance
  participants: ReadonlyArray<RunningLeagueParticipant>
  records: ReadonlyArray<RunningLeagueRecord>
  asOfDate: string
}): number | null {
  const rows: Array<{ memberId: string; timeSeconds: number }> = []

  for (const participant of input.participants) {
    const timeSeconds = bestPbSecondsAsOf({
      participantId: participant.id,
      distance: input.distance,
      records: input.records,
      asOfDate: input.asOfDate,
    })
    if (timeSeconds == null) continue
    rows.push({ memberId: participant.member_id, timeSeconds })
  }

  if (rows.length === 0) return null

  rows.sort((a, b) => a.timeSeconds - b.timeSeconds || a.memberId.localeCompare(b.memberId))

  let rank = 0
  let previous: number | null = null
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (previous === null || row.timeSeconds !== previous) {
      rank = index + 1
      previous = row.timeSeconds
    }
    if (row.memberId === input.memberId) return rank
  }

  return null
}

/**
 * 회원 PB·순위 변화 그래프용 시계열
 *
 * 1. 선택 거리 러닝 기록만 필터
 * 2. measured_at 오름차순 정렬
 * 3. 누적 최저 기록(PB 개선선) + 개별 측정(전체 기록선) 계산
 * 4. 각 시점 순위는 동일 카테고리 전체 회원 PB 스냅샷 비교
 */
export function buildMemberRankingHistorySeries(input: {
  memberId: string
  distance: PbLeaderboardDistance
  participants: ReadonlyArray<RunningLeagueParticipant>
  records: ReadonlyArray<RunningLeagueRecord>
}): RankingHistoryPoint[] {
  const participant = input.participants.find((row) => row.member_id === input.memberId)
  if (!participant) return []

  const memberRecords = input.records
    .filter(
      (row) =>
        row.participant_id === participant.id &&
        row.distance_event === input.distance,
    )
    .map((row) => {
      const timeSeconds = resolvePbTimeSeconds({
        time_seconds: row.time_seconds,
        time_text: row.time_text,
      })
      return timeSeconds != null
        ? {
            measured_at: row.measured_at,
            record_phase: row.record_phase,
            timeSeconds,
          }
        : null
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => {
      const byDate = a.measured_at.localeCompare(b.measured_at)
      if (byDate !== 0) return byDate
      return a.timeSeconds - b.timeSeconds
    })

  const seen = new Set<string>()
  const uniqueEvents: typeof memberRecords = []
  for (const row of memberRecords) {
    const key = `${row.measured_at}:${row.record_phase}:${row.timeSeconds}`
    if (seen.has(key)) continue
    seen.add(key)
    uniqueEvents.push(row)
  }

  let cumulativePb: number | null = null

  return uniqueEvents.map((row) => {
    const rawTimeSeconds = row.timeSeconds
    const previousPb = cumulativePb
    if (cumulativePb == null || rawTimeSeconds < cumulativePb) {
      cumulativePb = rawTimeSeconds
    }
    const pbTimeSeconds = cumulativePb
    const isPbImprovement = previousPb == null || rawTimeSeconds < previousPb

    return {
      date: row.measured_at,
      label: `${formatChartDate(row.measured_at)} · ${phaseLabel(row.record_phase)}`,
      timeSeconds: pbTimeSeconds,
      timeText: formatSecondsToRunningTime(pbTimeSeconds),
      rawTimeSeconds,
      rawTimeText: formatSecondsToRunningTime(rawTimeSeconds),
      isPbImprovement,
      rank: computeMemberPbRankAtDate({
        memberId: input.memberId,
        distance: input.distance,
        participants: input.participants,
        records: input.records,
        asOfDate: row.measured_at,
      }),
      phase: row.record_phase,
    }
  })
}

/** 순위 변화 그래프용 스냅샷 날짜 — 최근 기록 시점 기준 (1차 버전) */
export function collectPbRankSnapshotDates(input: {
  distance: PbLeaderboardDistance
  records: ReadonlyArray<RunningLeagueRecord>
  memberPoints: ReadonlyArray<RankingHistoryPoint>
  maxPoints?: number
}): string[] {
  const dates = new Set<string>()

  for (const point of input.memberPoints) {
    dates.add(point.date)
  }

  for (const record of input.records) {
    if (record.distance_event !== input.distance) continue
    dates.add(record.measured_at)
  }

  const sorted = [...dates].sort()
  const maxPoints = input.maxPoints ?? 12
  if (sorted.length <= maxPoints) return sorted
  return sorted.slice(-maxPoints)
}

/** 랭킹 목록용 간단한 순위 변화 표시 (▲2 / ▼1) */
export function formatMemberRankChangeHint(
  memberId: string,
  distance: PbLeaderboardDistance,
  participants: ReadonlyArray<RunningLeagueParticipant>,
  records: ReadonlyArray<RunningLeagueRecord>,
): string | null {
  const points = buildMemberRankingHistorySeries({
    memberId,
    distance,
    participants,
    records,
  })
  if (points.length < 2) return null

  const firstRank = points[0]?.rank
  const lastRank = points[points.length - 1]?.rank
  if (firstRank == null || lastRank == null || firstRank === lastRank) return null

  const delta = firstRank - lastRank
  if (delta > 0) return `▲${delta}`
  return `▼${Math.abs(delta)}`
}
