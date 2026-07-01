import { filterMileageLogsForPeriod } from '@/lib/running-league/ranking-period'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'

/** 출석 인정 최소 러닝 거리 (km) */
export const ATTENDANCE_KING_MIN_KM = 3

export const ATTENDANCE_KING_DAY_RULE_LABEL = '3km+ · 1일 1회 = 출석'

export type AttendanceKingRow = {
  participantId: string
  memberId: string
  memberName: string
  attendanceCount: number
  totalKm: number
  rank: number
}

export function isMileageLogAttendanceQualified(distanceKm: number): boolean {
  return Number(distanceKm) >= ATTENDANCE_KING_MIN_KM
}

/** 마일리지 로그 날짜 → 출석 집계용 일자 키 (YYYY-MM-DD) */
export function resolveAttendanceDayKey(loggedAt: string): string {
  const trimmed = loggedAt.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10)
  }
  return trimmed
}

export function countMemberAttendanceStats(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  options?: {
    asOfDate?: string
    period?: { start: string; end: string }
  },
): { attendanceCount: number; totalKm: number } {
  const scopedLogs = options?.period
    ? filterMileageLogsForPeriod(logs, options.period)
    : logs

  const attendanceDays = new Set<string>()
  let totalKm = 0

  for (const log of scopedLogs) {
    if (log.member_id !== memberId) continue
    if (options?.asOfDate) {
      const asOfDay = resolveAttendanceDayKey(options.asOfDate)
      if (resolveAttendanceDayKey(log.logged_at) > asOfDay) continue
    }
    if (!isMileageLogAttendanceQualified(log.distance_km)) continue

    attendanceDays.add(resolveAttendanceDayKey(log.logged_at))
    totalKm += Number(log.distance_km) || 0
  }

  return {
    attendanceCount: attendanceDays.size,
    totalKm: Math.round(totalKm * 10) / 10,
  }
}

/**
 * 출석왕 — 기간 내 3km+ 러닝이 있는 날 = 출석 1회 (같은 날 여러 번 뛰어도 1회)
 * 출석 일수 · 누적 km 내림차순
 */
export function buildAttendanceKingLeaderboard(
  participants: ReadonlyArray<RunningLeagueParticipant>,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  period: { start: string; end: string },
): AttendanceKingRow[] {
  const tallies = new Map<
    string,
    { attendanceCount: number; totalKm: number; participantId: string; memberName: string }
  >()

  for (const participant of participants) {
    const stats = countMemberAttendanceStats(participant.member_id, logs, { period })
    if (stats.attendanceCount <= 0) continue

    tallies.set(participant.member_id, {
      attendanceCount: stats.attendanceCount,
      totalKm: stats.totalKm,
      participantId: participant.id,
      memberName: participant.member?.name?.trim() || '회원',
    })
  }

  // 참가자 목록에 없는 로그만 있는 회원도 반영
  for (const log of filterMileageLogsForPeriod(logs, period)) {
    if (!isMileageLogAttendanceQualified(log.distance_km)) continue
    if (tallies.has(log.member_id)) continue

    const stats = countMemberAttendanceStats(log.member_id, logs, { period })
    if (stats.attendanceCount <= 0) continue

    tallies.set(log.member_id, {
      attendanceCount: stats.attendanceCount,
      totalKm: stats.totalKm,
      participantId: log.participant_id,
      memberName: '회원',
    })
  }

  const sorted = [...tallies.entries()]
    .map(([memberId, row]) => ({ memberId, ...row }))
    .sort((a, b) => {
      if (b.attendanceCount !== a.attendanceCount) {
        return b.attendanceCount - a.attendanceCount
      }
      if (b.totalKm !== a.totalKm) return b.totalKm - a.totalKm
      return a.memberName.localeCompare(b.memberName, 'ko')
    })

  let rank = 0
  let prevCount: number | null = null
  let prevKm: number | null = null

  return sorted.map((row, index) => {
    if (
      prevCount === null ||
      row.attendanceCount !== prevCount ||
      row.totalKm !== prevKm
    ) {
      rank = index + 1
      prevCount = row.attendanceCount
      prevKm = row.totalKm
    }
    return {
      participantId: row.participantId,
      memberId: row.memberId,
      memberName: row.memberName,
      attendanceCount: row.attendanceCount,
      totalKm: row.totalKm,
      rank,
    }
  })
}
