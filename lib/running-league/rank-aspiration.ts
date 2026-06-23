import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
import type { MileageDistanceRankRow } from '@/lib/running-league/mileage-leaderboard'
import type { PbDistanceRankRow } from '@/lib/running-league/pb-leaderboard'

export const RANK_ASPIRATION_TOP_N = 5

export type RankAspirationInsight = {
  headline: string
  /** 예: 바로 위 6위와 18초 차이 */
  nextRankLine: string | null
  /** 예: TOP 5 진입까지 42초 단축 필요 */
  topTargetLine: string | null
}

function formatPbGapShort(totalSeconds: number): string {
  const sec = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(sec / 60)
  const seconds = sec % 60
  if (minutes > 0 && seconds > 0) return `${minutes}분 ${seconds}초`
  if (minutes > 0) return `${minutes}분`
  return `${seconds}초`
}

function formatMileageGapShort(km: number): string {
  const value = Math.round(km * 10) / 10
  return formatMileageKmDisplay(value)
}

export function buildPbRankAspiration(
  myRow: PbDistanceRankRow,
  ranked: ReadonlyArray<PbDistanceRankRow>,
  topN = RANK_ASPIRATION_TOP_N,
): RankAspirationInsight {
  const headline = `현재 ${myRow.rank}위`
  const myIndex = ranked.findIndex((row) => row.memberId === myRow.memberId)

  let nextRankLine: string | null = null
  if (myIndex > 0) {
    const above = ranked[myIndex - 1]
    const gapSeconds = myRow.timeSeconds - above.timeSeconds
    if (gapSeconds > 0) {
      nextRankLine = `바로 위 ${above.rank}위와 ${formatPbGapShort(gapSeconds)} 차이`
    }
  }

  let topTargetLine: string | null = null
  if (myRow.rank === 1) {
    topTargetLine = '현재 1위입니다'
  } else if (myRow.rank <= topN) {
    topTargetLine = `TOP ${topN} 안에 있습니다`
  } else if (ranked.length >= topN) {
    const cutoff = ranked[topN - 1]
    const gapSeconds = myRow.timeSeconds - cutoff.timeSeconds
    if (gapSeconds > 0) {
      topTargetLine = `TOP ${topN} 진입까지 ${formatPbGapShort(gapSeconds)} 단축 필요`
    }
  }

  return { headline, nextRankLine, topTargetLine }
}

export function buildMileageRankAspiration(
  myRow: MileageDistanceRankRow,
  ranked: ReadonlyArray<MileageDistanceRankRow>,
  topN = RANK_ASPIRATION_TOP_N,
): RankAspirationInsight {
  const headline = `현재 ${myRow.rank}위`
  const myIndex = ranked.findIndex((row) => row.memberId === myRow.memberId)

  let nextRankLine: string | null = null
  if (myIndex > 0) {
    const above = ranked[myIndex - 1]
    const gapKm = above.mileageKm - myRow.mileageKm
    if (gapKm > 0) {
      nextRankLine = `바로 위 ${above.rank}위와 ${formatMileageGapShort(gapKm)} 차이`
    }
  }

  let topTargetLine: string | null = null
  if (myRow.rank === 1) {
    topTargetLine = '현재 1위입니다'
  } else if (myRow.rank <= topN) {
    topTargetLine = `TOP ${topN} 안에 있습니다`
  } else if (ranked.length >= topN) {
    const cutoff = ranked[topN - 1]
    const gapKm = cutoff.mileageKm - myRow.mileageKm
    if (gapKm > 0) {
      topTargetLine = `TOP ${topN} 진입까지 ${formatMileageGapShort(gapKm)} 더 필요`
    }
  }

  return { headline, nextRankLine, topTargetLine }
}

export function resolveMemberRankAspiration(input: {
  memberId?: string | null
  rankingView: 'pb' | 'mileage'
  pbLeaderboard: { ranked: PbDistanceRankRow[] }
  mileageLeaderboard: { ranked: MileageDistanceRankRow[] }
}): RankAspirationInsight | null {
  if (!input.memberId) return null

  if (input.rankingView === 'pb') {
    const myRow = input.pbLeaderboard.ranked.find((row) => row.memberId === input.memberId)
    if (!myRow) return null
    return buildPbRankAspiration(myRow, input.pbLeaderboard.ranked)
  }

  const myRow = input.mileageLeaderboard.ranked.find((row) => row.memberId === input.memberId)
  if (!myRow) return null
  return buildMileageRankAspiration(myRow, input.mileageLeaderboard.ranked)
}
