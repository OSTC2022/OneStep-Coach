import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'

export const PB_RANKING_DISTANCES: PbLeaderboardDistance[] = ['5km', '10km', 'half', 'full']

/** UI 라벨 — [5km] [10km] [Half] [Full] */
export const PB_DISTANCE_LABELS: Record<PbLeaderboardDistance, string> = {
  '5km': '5km',
  '10km': '10km',
  half: 'Half',
  full: 'Full',
}

/** 거리 정의 (km) */
export const PB_DISTANCE_KM: Record<PbLeaderboardDistance, number> = {
  '5km': 5,
  '10km': 10,
  half: 21.0975,
  full: 42.195,
}

export function formatPbDistanceLabel(distance: PbLeaderboardDistance): string {
  return PB_DISTANCE_LABELS[distance]
}

export function formatPbDistanceKmLabel(distance: PbLeaderboardDistance): string {
  const km = PB_DISTANCE_KM[distance]
  if (distance === 'half') return 'Half = 21.0975km'
  if (distance === 'full') return 'Full = 42.195km'
  return `${PB_DISTANCE_LABELS[distance]}`
}

export function getPbDistanceFilterDescription(distance: PbLeaderboardDistance): string {
  if (distance === 'half') return '하프 마라톤 (21.0975km) PB 랭킹'
  if (distance === 'full') return '풀 마라톤 (42.195km) PB 랭킹'
  return `${distance} PB 랭킹 · 기록이 짧을수록 상위`
}

/** 랭킹 헤더·필터 칩 등 거리별 강조 색 */
export const PB_DISTANCE_ACCENT_CLASS: Record<PbLeaderboardDistance, string> = {
  '5km': 'text-emerald-400',
  '10km': 'text-sky-400',
  half: 'text-amber-300',
  full: 'text-red-400',
}

export function getPbDistanceAccentClass(distance: PbLeaderboardDistance): string {
  return PB_DISTANCE_ACCENT_CLASS[distance]
}

export const PB_DISTANCE_LEGEND = 'Half = 21.0975km · Full = 42.195km · 정렬은 초 단위 기준'
