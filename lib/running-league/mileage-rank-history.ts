import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'

export type MileageRankHistoryPoint = {
  date: string
  label: string
  rank: number | null
  cumulativeKm: number
}

function formatChartDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

function sumMileageUpToDate(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  asOfDate: string,
): number {
  let total = 0
  for (const log of logs) {
    if (log.member_id !== memberId) continue
    if (log.logged_at > asOfDate) continue
    total += Number(log.distance_km ?? 0)
  }
  return Math.round(total * 10) / 10
}

/** 해당 날짜까지의 월 누적 마일리지 기준 순위 (내림차순) */
export function computeMileageRankAtDate(input: {
  memberId: string
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  asOfDate: string
}): number | null {
  const rows: Array<{ memberId: string; km: number }> = []

  for (const participant of input.participants) {
    const km = sumMileageUpToDate(participant.member_id, input.logs, input.asOfDate)
    if (km <= 0) continue
    rows.push({ memberId: participant.member_id, km })
  }

  if (rows.length === 0) return null

  rows.sort((a, b) => b.km - a.km || a.memberId.localeCompare(b.memberId))

  let rank = 0
  let previousKm: number | null = null
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (previousKm === null || row.km !== previousKm) {
      rank = index + 1
      previousKm = row.km
    }
    if (row.memberId === input.memberId) return rank
  }

  return null
}

function collectMileageSnapshotDates(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
): string[] {
  const dates = new Set<string>()
  for (const log of logs) {
    if (log.member_id === memberId) dates.add(log.logged_at)
  }
  return [...dates].sort()
}

/** 월 마일리지 순위 변화 — 기록 시점 스냅샷 기준 (1차 버전) */
export function buildMemberMileageRankHistorySeries(input: {
  memberId: string
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
}): MileageRankHistoryPoint[] {
  const logs = input.logs ?? []
  const dates = collectMileageSnapshotDates(input.memberId, logs)
  if (dates.length === 0) return []

  return dates.map((date) => {
    const cumulativeKm = sumMileageUpToDate(input.memberId, logs, date)
    return {
      date,
      label: formatChartDate(date),
      cumulativeKm,
      rank: computeMileageRankAtDate({
        memberId: input.memberId,
        participants: input.participants,
        logs,
        asOfDate: date,
      }),
    }
  })
}
