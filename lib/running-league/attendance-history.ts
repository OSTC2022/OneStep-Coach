import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  isMileageLogAttendanceQualified,
  resolveAttendanceDayKey,
} from '@/lib/running-league/attendance-king'
import { filterMileageLogsForPeriod } from '@/lib/running-league/ranking-period'
import type { RunningLeagueMileageLog } from '@/lib/types'

export type AttendanceHistoryPoint = {
  date: string
  label: string
  cumulativeCount: number
}

function formatChartDate(value: string): string {
  try {
    return format(parseISO(value.slice(0, 10)), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

/** 회원 출석 누적 그래프 (3km+ · 하루 1회) */
export function buildMemberAttendanceHistorySeries(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  period?: { start: string; end: string },
): AttendanceHistoryPoint[] {
  const scopedLogs = period ? filterMileageLogsForPeriod(logs, period) : logs
  const attendanceDays = new Set<string>()

  for (const log of scopedLogs) {
    if (log.member_id !== memberId) continue
    if (!isMileageLogAttendanceQualified(log.distance_km)) continue
    attendanceDays.add(resolveAttendanceDayKey(log.logged_at))
  }

  const sortedDays = [...attendanceDays].sort()
  return sortedDays.map((day, index) => ({
    date: day,
    label: formatChartDate(day),
    cumulativeCount: index + 1,
  }))
}
