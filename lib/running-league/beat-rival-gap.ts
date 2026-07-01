import type { MileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'

export type BeatRivalMileageGapTone = 'ahead' | 'behind' | 'even' | 'unavailable'

export interface BeatRivalMileageGap {
  deltaKm: number
  /** 랭킹 헤더 격차 — 예: 3.2km 뒤, 5.1km 앞 */
  gapText: string | null
  tone: BeatRivalMileageGapTone
  accentClass: string
}

function resolveMemberMileageKm(
  leaderboard: MileageDistanceLeaderboard,
  memberId: string,
): number {
  const ranked = leaderboard.ranked.find((row) => row.memberId === memberId)
  if (ranked) return ranked.mileageKm
  return 0
}

/** 격차가 작을수록 라임에 가깝게, 멀수록 빨강/주황 */
function resolveBehindAccentClass(absGapKm: number): string {
  if (absGapKm <= 1) return 'text-lime-300'
  if (absGapKm <= 3) return 'text-amber-300'
  if (absGapKm <= 7) return 'text-orange-400'
  if (absGapKm <= 15) return 'text-red-400'
  return 'text-red-500'
}

/** 앞서 있을 때 — 격차가 클수록 하늘색 */
function resolveAheadAccentClass(absGapKm: number): string {
  if (absGapKm <= 1) return 'text-lime-300'
  if (absGapKm <= 5) return 'text-sky-400'
  return 'text-sky-300'
}

export function resolveBeatRivalMileageGap(input: {
  myMemberId?: string | null
  beatRivalMemberId?: string | null
  mileageLeaderboard: MileageDistanceLeaderboard
}): BeatRivalMileageGap {
  const myId = input.myMemberId?.trim()
  const rivalId = input.beatRivalMemberId?.trim()

  if (!myId || !rivalId || myId === rivalId) {
    return {
      deltaKm: 0,
      gapText: null,
      tone: 'unavailable',
      accentClass: 'text-zinc-500',
    }
  }

  const myKm = resolveMemberMileageKm(input.mileageLeaderboard, myId)
  const rivalKm = resolveMemberMileageKm(input.mileageLeaderboard, rivalId)
  const deltaKm = Math.round((myKm - rivalKm) * 10) / 10
  const absKm = Math.abs(deltaKm).toFixed(1)

  if (deltaKm > 0) {
    return {
      deltaKm,
      gapText: `${absKm}km 앞`,
      tone: 'ahead',
      accentClass: resolveAheadAccentClass(Math.abs(deltaKm)),
    }
  }

  if (deltaKm < 0) {
    return {
      deltaKm,
      gapText: `${absKm}km 뒤`,
      tone: 'behind',
      accentClass: resolveBehindAccentClass(Math.abs(deltaKm)),
    }
  }

  return {
    deltaKm: 0,
    gapText: '동률',
    tone: 'even',
    accentClass: 'text-lime-300',
  }
}
