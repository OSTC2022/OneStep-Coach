import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { RunningLeagueMileageLog } from '@/lib/types'

export type MileageHistoryPoint = {
  date: string
  label: string
  cumulativeKm: number
  dailyKm: number
}

function formatChartDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

/** 회원 월 마일리지 누적 그래프용 시계열 */
export function buildMemberMileageHistorySeries(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
): MileageHistoryPoint[] {
  const memberLogs = logs
    .filter((row) => row.member_id === memberId)
    .slice()
    .sort((a, b) => {
      const byDate = a.logged_at.localeCompare(b.logged_at)
      if (byDate !== 0) return byDate
      return (a.created_at ?? '').localeCompare(b.created_at ?? '')
    })

  let cumulativeKm = 0
  const points: MileageHistoryPoint[] = []

  for (const log of memberLogs) {
    const dailyKm = Math.round(Number(log.distance_km ?? 0) * 10) / 10
    if (dailyKm <= 0) continue
    cumulativeKm = Math.round((cumulativeKm + dailyKm) * 10) / 10
    points.push({
      date: log.logged_at,
      label: formatChartDate(log.logged_at),
      cumulativeKm,
      dailyKm,
    })
  }

  return points
}
