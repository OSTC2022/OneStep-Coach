import { formatCurrentMonthRankingLabel } from '@/lib/running-league/month-range'

export type RankingView = 'mileage' | 'pb' | 'beat_rival'

export const RANKING_VIEW_OPTIONS: Array<{ value: RankingView; label: string }> = [
  { value: 'mileage', label: '월 마일리지' },
  { value: 'beat_rival', label: '이겨라' },
  { value: 'pb', label: 'PB 랭킹' },
]

export function getRankingViewDescription(view: RankingView): string {
  if (view === 'pb') {
    return '거리별 PB · 5km / 10km / Half / Full · 기록이 짧을수록 상위 (초 단위 오름차순)'
  }
  if (view === 'beat_rival') {
    return '이겨라 대상 회원을 넘어서는 순위 경쟁 · 월 마일리지 기준'
  }
  return `${formatCurrentMonthRankingLabel()} 누적 거리 · 많을수록 상위 (내림차순)`
}

export const MILEAGE_RANKING_SORT_HINT = '이번 달 누적 거리 기준 · 내림차순 정렬'
