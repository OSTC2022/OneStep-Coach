import type { MileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'

export type BeatRivalMileageGapTone = 'ahead' | 'behind' | 'even' | 'unavailable'

export interface BeatRivalMileageGap {
  deltaKm: number
  /** 랭킹 헤더 옆 격차 — 예: +15.3km, -2.1km */
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
      gapText: `+${absKm}km`,
      tone: 'ahead',
      accentClass: 'text-sky-400',
    }
  }

  if (deltaKm < 0) {
    return {
      deltaKm,
      gapText: `-${absKm}km`,
      tone: 'behind',
      accentClass: 'text-red-400',
    }
  }

  return {
    deltaKm: 0,
    gapText: '±0.0km',
    tone: 'even',
    accentClass: 'text-sky-400',
  }
}
