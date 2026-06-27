import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
import type { MileageHistoryPoint } from '@/lib/running-league/mileage-history'
import { formatRecordDeltaLabel } from '@/lib/running-league/records'
import type { RankingHistoryPoint } from '@/lib/running-league/ranking-history'
import { formatRankTrajectory } from '@/lib/running-league/league-rank-comparison'

export type ImprovementTrend = 'improved' | 'declined' | 'flat' | 'insufficient'

/** 부호 포함 짧은 기록 차이 — 예: -32초, -1분 14초, +15초 */
export function formatSignedRecordDelta(deltaSeconds: number): string {
  if (deltaSeconds === 0) return '±0초'
  const abs = Math.abs(Math.round(deltaSeconds))
  const minutes = Math.floor(abs / 60)
  const seconds = abs % 60
  const parts: string[] = []
  if (minutes > 0) parts.push(`${minutes}분`)
  if (seconds > 0 || minutes === 0) parts.push(`${seconds}초`)
  const span = parts.join(' ')
  return deltaSeconds > 0 ? `-${span}` : `+${span}`
}

export function formatSeasonImprovementText(
  seasonStartSeconds: number,
  latestSeconds: number,
): string | null {
  const delta = seasonStartSeconds - latestSeconds
  if (delta === 0) return null
  const signed = formatSignedRecordDelta(delta)
  if (delta > 0) return `시즌 시작 대비 ${signed} 개선`
  return `시즌 시작 대비 ${signed}`
}

export interface MemberGraphPanelSummary {
  displayName: string
  rankLine: string | null
  recordLine: string | null
  improvementLine: string | null
}

export function buildMemberGraphPanelSummary(input: {
  memberName: string
  isMe: boolean
  rankingView: 'pb' | 'mileage' | 'beat_rival'
  distanceLabel: string
  currentRank: number | null
  totalRanked: number
  historyPoints: RankingHistoryPoint[]
  mileageTotalKm?: number | null
}): MemberGraphPanelSummary {
  const displayName = input.isMe ? input.memberName : input.memberName

  if (input.rankingView === 'mileage' || input.rankingView === 'beat_rival') {
    const km = input.mileageTotalKm ?? 0
    return {
      displayName,
      rankLine:
        input.currentRank != null && input.totalRanked > 0
          ? `현재 월 마일리지 ${input.currentRank}위 / ${input.totalRanked}명`
          : input.totalRanked > 0
            ? `이번 달 마일리지 · ${input.totalRanked}명 참여`
            : null,
      recordLine: km > 0 ? `이번 달 누적 ${formatMileageKmDisplay(km)}` : '이번 달 기록 없음',
      improvementLine: null,
    }
  }

  const recordSummary = summarizeRecordChangeChart(input.historyPoints)
  const latestPb =
    recordSummary.latestTimeText ??
    input.historyPoints[input.historyPoints.length - 1]?.timeText ??
    null

  let improvementLine = recordSummary.vsSeasonStart
  if (input.historyPoints.length >= 2) {
    const seasonStart = input.historyPoints[0]
    const latest = input.historyPoints[input.historyPoints.length - 1]
    improvementLine = formatSeasonImprovementText(seasonStart.timeSeconds, latest.timeSeconds)
  }

  return {
    displayName,
    rankLine:
      input.currentRank != null && input.totalRanked > 0
        ? `현재 ${input.distanceLabel} 순위 ${input.currentRank}위 / ${input.totalRanked}명`
        : input.totalRanked > 0
          ? `현재 ${input.distanceLabel} · ${input.totalRanked}명 참여`
          : null,
    recordLine: latestPb ? `최근 PB ${latestPb}` : '등록된 PB 없음',
    improvementLine,
  }
}

export interface RecordChangeChartSummary {
  rankTrajectory: string | null
  rankCaption: string | null
  vsMonthStart: string | null
  vsSeasonStart: string | null
  latestTimeText: string | null
  timeTrajectory: string | null
}

export interface MemberRankingImprovementSummary {
  trend: ImprovementTrend
  headline: string
  subline: string | null
  pbDeltaSeconds: number | null
  pbDeltaLabel: string | null
  rankDelta: number | null
  startTimeText: string | null
  currentTimeText: string | null
  startRank: number | null
  currentRank: number | null
}

function findMonthStartBaseline(points: RankingHistoryPoint[]): RankingHistoryPoint | null {
  const monthStarts = points.filter((point) => point.phase === 'month_start')
  if (monthStarts.length > 0) return monthStarts[monthStarts.length - 1]
  if (points.length >= 2) return points[points.length - 2]
  return points[0] ?? null
}

export function summarizeRecordChangeChart(points: RankingHistoryPoint[]): RecordChangeChartSummary {
  const rankPoints = points.filter((point) => point.rank != null)
  const rankTrajectory = formatRankTrajectory(rankPoints)
  const pbTrajectory = points.map((point) => point.timeText).join(' → ')
  const rawTrajectory = points.map((point) => point.rawTimeText).join(' → ')
  const timeTrajectory =
    pbTrajectory !== rawTrajectory ? `${rawTrajectory} → PB ${points[points.length - 1]?.timeText}` : pbTrajectory

  if (points.length === 0) {
    return {
      rankTrajectory: null,
      rankCaption: null,
      vsMonthStart: null,
      vsSeasonStart: null,
      latestTimeText: null,
      timeTrajectory: null,
    }
  }

  const latest = points[points.length - 1]
  const seasonStart = points[0]
  const monthBaseline = findMonthStartBaseline(points)

  const seasonDelta =
    latest.timeSeconds !== seasonStart.timeSeconds
      ? latest.timeSeconds - seasonStart.timeSeconds
      : 0
  const monthDelta =
    monthBaseline && latest.timeSeconds !== monthBaseline.timeSeconds
      ? latest.timeSeconds - monthBaseline.timeSeconds
      : null

  return {
    rankTrajectory,
    rankCaption: rankTrajectory,
    vsSeasonStart:
      seasonDelta !== 0
        ? formatSeasonImprovementText(seasonStart.timeSeconds, latest.timeSeconds)
        : null,
    vsMonthStart:
      monthDelta != null && monthDelta !== 0
        ? `지난달 대비 ${formatSignedRecordDelta(monthBaseline!.timeSeconds - latest.timeSeconds)}`
        : null,
    latestTimeText: latest.timeText,
    timeTrajectory: points.length >= 2 ? timeTrajectory : null,
  }
}

export interface MemberMileageProgressSummary {
  trend: ImprovementTrend
  headline: string
  subline: string | null
  totalKm: number
  logCount: number
  currentRank: number | null
}

export function summarizeMemberRankingImprovement(
  points: RankingHistoryPoint[],
): MemberRankingImprovementSummary {
  const empty: MemberRankingImprovementSummary = {
    trend: 'insufficient',
    headline: '기록을 등록하면 변화를 확인할 수 있어요',
    subline: '첫 PB부터 그래프가 채워집니다',
    pbDeltaSeconds: null,
    pbDeltaLabel: null,
    rankDelta: null,
    startTimeText: null,
    currentTimeText: null,
    startRank: null,
    currentRank: null,
  }

  if (points.length === 0) return empty

  const last = points[points.length - 1]
  if (points.length === 1) {
    return {
      trend: 'flat',
      headline: `현재 기록 ${last.timeText}`,
      subline: last.rank != null ? `현재 ${last.rank}위` : '순위는 기록이 쌓이면 표시됩니다',
      pbDeltaSeconds: 0,
      pbDeltaLabel: null,
      rankDelta: null,
      startTimeText: last.timeText,
      currentTimeText: last.timeText,
      startRank: last.rank,
      currentRank: last.rank,
    }
  }

  const first = points[0]
  const pbDeltaSeconds = first.timeSeconds - last.timeSeconds
  const pbDeltaLabel = pbDeltaSeconds !== 0 ? formatRecordDeltaLabel(pbDeltaSeconds) : null
  const rankDelta =
    first.rank != null && last.rank != null ? first.rank - last.rank : null

  let trend: ImprovementTrend = 'flat'
  if (pbDeltaSeconds > 0) trend = 'improved'
  else if (pbDeltaSeconds < 0) trend = 'declined'

  let headline: string
  if (trend === 'improved') {
    headline = `${pbDeltaLabel}!`
  } else if (trend === 'declined') {
    headline = `기록 ${pbDeltaLabel}`
  } else {
    headline = `현재 기록 ${last.timeText}`
  }

  let subline: string | null = null
  if (rankDelta != null && rankDelta > 0) {
    subline = `순위 ${rankDelta}계단 상승 · ${first.rank}위 → ${last.rank}위`
  } else if (rankDelta != null && rankDelta < 0) {
    subline = `순위 ${Math.abs(rankDelta)}계단 변동 · ${first.rank}위 → ${last.rank}위`
  } else if (last.rank != null) {
    subline = `현재 ${last.rank}위 유지`
  }

  return {
    trend,
    headline,
    subline,
    pbDeltaSeconds: pbDeltaSeconds !== 0 ? pbDeltaSeconds : null,
    pbDeltaLabel,
    rankDelta,
    startTimeText: first.timeText,
    currentTimeText: last.timeText,
    startRank: first.rank,
    currentRank: last.rank,
  }
}

export function summarizeMemberMileageProgress(
  points: MileageHistoryPoint[],
  currentRank: number | null,
): MemberMileageProgressSummary {
  if (points.length === 0) {
    return {
      trend: 'insufficient',
      headline: '이번 달 러닝 기록을 추가해보세요',
      subline: '기록이 쌓일수록 마일리지 그래프가 채워집니다',
      totalKm: 0,
      logCount: 0,
      currentRank,
    }
  }

  const last = points[points.length - 1]
  const totalKm = last.cumulativeKm
  const logCount = points.length

  let trend: ImprovementTrend = logCount >= 2 ? 'improved' : 'flat'
  let subline: string | null =
    currentRank != null ? `이번 달 마일리지 ${currentRank}위` : '이번 달 누적 거리'

  if (logCount >= 2) {
    const first = points[0]
    subline = `${formatMileageKmDisplay(first.cumulativeKm)} → ${formatMileageKmDisplay(totalKm)} · ${
      currentRank != null ? `${currentRank}위` : '순위 집계 중'
    }`
  }

  return {
    trend,
    headline: `이번 달 ${formatMileageKmDisplay(totalKm)}`,
    subline,
    totalKm,
    logCount,
    currentRank,
  }
}
