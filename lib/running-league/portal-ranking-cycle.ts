import { format, parseISO, startOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'

import type { RankingPeriod } from '@/lib/running-league/ranking-period'

/** DB에 저장된 기간 시작일 — 없으면 당월 1일(메모리 fallback) */
export function resolvePortalRankingCycleStartDate(
  stored: string | null | undefined,
): string {
  const trimmed = stored?.trim().slice(0, 10)
  if (trimmed) return trimmed
  return format(startOfMonth(new Date()), 'yyyy-MM-dd')
}

export function portalRankingDateRange(cycleStartDate: string | null | undefined): {
  start: string
  end: string
} {
  const start = resolvePortalRankingCycleStartDate(cycleStartDate)
  const end = format(new Date(), 'yyyy-MM-dd')
  return { start, end }
}

export function formatRankingCycleLabel(start: string, end: string): string {
  const startDate = parseISO(start.slice(0, 10))
  const endDate = parseISO(end.slice(0, 10))
  if (start.slice(0, 10) === end.slice(0, 10)) {
    return format(startDate, 'yyyy년 M월 d일', { locale: ko })
  }
  return `${format(startDate, 'yyyy.M.d', { locale: ko })} ~ ${format(endDate, 'M.d', { locale: ko })}`
}

export function rankingPeriodFromCycleStart(cycleStartDate: string): RankingPeriod {
  const start = cycleStartDate.slice(0, 10)
  const end = format(new Date(), 'yyyy-MM-dd')
  const monthKey = format(parseISO(start), 'yyyy-MM')
  return {
    start,
    end,
    label: formatRankingCycleLabel(start, end),
    monthKey,
    mode: 'cycle',
    asOfDate: end,
  }
}
