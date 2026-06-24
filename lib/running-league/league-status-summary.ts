import { currentMonthDateRange } from '@/lib/running-league/month-range'
import { buildRecentPbUpdates } from '@/lib/running-league/league-momentum'
import { formatMileageKmDisplay, sumMileageLogsKm } from '@/lib/running-league/mileage-leaderboard'
import type { MileageDistanceLeaderboard } from '@/lib/running-league/mileage-leaderboard'
import { formatPbDistanceLabel } from '@/lib/running-league/pb-distance-labels'
import type { PbDistanceLeaderboard, PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { resolvePbTimeSeconds } from '@/lib/running-league/pb-leaderboard'
import { formatSecondsToRunningTime } from '@/lib/running-league/records'
import type { RankingView } from '@/lib/running-league/ranking-view'
import type {
  RunningLeagueMileageLog,
  RunningLeagueParticipant,
  RunningLeagueRecord,
} from '@/lib/types'

export type MemberLeagueStatusSnapshot = {
  currentRank: number | null
  totalRanked: number
  rankHeadline: string
  rankSubline: string
  monthlyMileageKm: number
  monthlyMileageLabel: string
  goalAchievementRate: number | null
  goalLabel: string
  goalSubline: string
  pbDistanceLabel: string
  personalPbLabel: string | null
  recentPbHeadline: string
  recentPbSubline: string
  recentPbShortValue: string
  remainingToGoalLabel: string | null
  isSoloRanked: boolean
  soloRankHint: string | null
  comparisonHint: string | null
}

export function parseMonthlyKmGoal(personalGoal: string | null | undefined): number | null {
  const text = personalGoal?.trim()
  if (!text) return null
  const match = text.match(/(\d+(?:\.\d+)?)\s*km/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

function resolveMonthlyMileageKm(input: {
  memberId: string
  participant: RunningLeagueParticipant | null
  mileageLogs: ReadonlyArray<RunningLeagueMileageLog>
  mileageLeaderboard: MileageDistanceLeaderboard
}): number {
  const fromLeaderboard = input.mileageLeaderboard.ranked.find(
    (row) => row.memberId === input.memberId,
  )?.mileageKm
  if (fromLeaderboard != null && fromLeaderboard > 0) return fromLeaderboard

  const { start, end } = currentMonthDateRange()
  const monthLogs = input.mileageLogs.filter(
    (log) =>
      log.member_id === input.memberId &&
      log.logged_at >= start &&
      log.logged_at <= end,
  )
  if (monthLogs.length > 0) return sumMileageLogsKm(monthLogs)

  return Number(input.participant?.mileage_km ?? 0)
}

function resolvePersonalPbLabel(input: {
  memberId: string
  distance: PbLeaderboardDistance
  pbLeaderboard: PbDistanceLeaderboard
  pbRecords: ReadonlyArray<RunningLeagueRecord>
}): string | null {
  const fromRank = input.pbLeaderboard.ranked.find((row) => row.memberId === input.memberId)
  if (fromRank) return formatSecondsToRunningTime(fromRank.timeSeconds)

  const record = input.pbRecords
    .filter(
      (row) =>
        row.member_id === input.memberId &&
        row.distance_event === input.distance &&
        row.record_phase === 'other',
    )
    .sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0]

  const seconds = record ? resolvePbTimeSeconds(record) : null
  return seconds != null ? formatSecondsToRunningTime(seconds) : null
}

function resolveCurrentRank(input: {
  memberId: string
  rankingView: RankingView
  pbLeaderboard: PbDistanceLeaderboard
  mileageLeaderboard: MileageDistanceLeaderboard
}): { rank: number | null; totalRanked: number } {
  const leaderboard =
    input.rankingView === 'pb' ? input.pbLeaderboard : input.mileageLeaderboard
  const totalRanked = leaderboard.ranked.length
  const row = leaderboard.ranked.find((item) => item.memberId === input.memberId)
  return { rank: row?.rank ?? null, totalRanked }
}

export function buildMemberLeagueStatusSnapshot(input: {
  memberId: string
  rankingView: RankingView
  pbDistance: PbLeaderboardDistance
  participant: RunningLeagueParticipant | null
  pbLeaderboard: PbDistanceLeaderboard
  mileageLeaderboard: MileageDistanceLeaderboard
  mileageLogs: ReadonlyArray<RunningLeagueMileageLog>
  pbRecords: ReadonlyArray<RunningLeagueRecord>
  participants: ReadonlyArray<RunningLeagueParticipant>
}): MemberLeagueStatusSnapshot {
  const { rank, totalRanked } = resolveCurrentRank(input)
  const monthlyMileageKm = resolveMonthlyMileageKm({
    memberId: input.memberId,
    participant: input.participant,
    mileageLogs: input.mileageLogs,
    mileageLeaderboard: input.mileageLeaderboard,
  })
  const goalAchievementRate = input.participant?.goal_achievement_rate ?? null
  const personalGoal = input.participant?.personal_goal?.trim() ?? null
  const monthlyGoalKm = parseMonthlyKmGoal(personalGoal)
  const personalPbLabel = resolvePersonalPbLabel({
    memberId: input.memberId,
    distance: input.pbDistance,
    pbLeaderboard: input.pbLeaderboard,
    pbRecords: input.pbRecords,
  })

  const { start, end } = currentMonthDateRange()
  const recentPb = buildRecentPbUpdates({
    participants: input.participants,
    records: input.pbRecords,
    monthStart: start,
    monthEnd: end,
    distance: null,
    limit: 5,
  }).find((row) => row.memberId === input.memberId)

  const isSoloRanked = totalRanked <= 1 && rank != null
  const distanceLabel = formatPbDistanceLabel(input.pbDistance)

  let rankHeadline: string
  let rankSubline: string
  if (rank == null) {
    rankHeadline = '순위 없음'
    rankSubline =
      input.rankingView === 'pb'
        ? `${distanceLabel} PB를 등록하면 순위에 반영됩니다`
        : '이번 달 러닝 기록을 추가하면 순위에 반영됩니다'
  } else if (isSoloRanked) {
    rankHeadline = '현재 1위'
    rankSubline = '첫 기록이 등록되었습니다 · 다른 회원이 참여하면 비교가 시작됩니다'
  } else {
    rankHeadline = `${rank}위`
    rankSubline =
      input.rankingView === 'pb'
        ? `${distanceLabel} PB · 총 ${totalRanked}명 중`
        : `이번 달 마일리지 · 총 ${totalRanked}명 중`
  }

  let goalLabel: string
  let goalSubline: string
  if (goalAchievementRate != null) {
    goalLabel = `${Math.round(goalAchievementRate)}%`
    goalSubline = personalGoal ? `목표: ${personalGoal}` : '개인 목표 달성률'
  } else {
    goalLabel = '—'
    goalSubline = '목표를 설정하면 달성률이 표시됩니다'
  }

  let remainingToGoalLabel: string | null = null
  if (monthlyGoalKm != null && monthlyGoalKm > monthlyMileageKm) {
    const remaining = Math.round((monthlyGoalKm - monthlyMileageKm) * 10) / 10
    remainingToGoalLabel = `목표까지 ${formatMileageKmDisplay(remaining)} 남음`
  } else if (monthlyGoalKm != null && monthlyMileageKm >= monthlyGoalKm) {
    remainingToGoalLabel = '이번 달 목표 거리 달성'
  }

  let recentPbHeadline: string
  let recentPbSubline: string
  let recentPbShortValue: string
  if (recentPb) {
    recentPbHeadline = '최근 PB 갱신'
    recentPbSubline = `${recentPb.headline} ${recentPb.detail}`
    recentPbShortValue = '갱신됨'
  } else if (personalPbLabel) {
    recentPbHeadline = 'PB 등록됨'
    recentPbSubline = `${distanceLabel} ${personalPbLabel}`
    recentPbShortValue = personalPbLabel
  } else {
    recentPbHeadline = 'PB 미등록'
    recentPbSubline = '기록을 등록하면 PB 랭킹에 반영됩니다'
    recentPbShortValue = '—'
  }

  if (isSoloRanked && rank === 1) {
    rankSubline = '첫 기록이 등록되었습니다 · 현재 리그 1위입니다'
  }

  return {
    currentRank: rank,
    totalRanked,
    rankHeadline,
    rankSubline,
    monthlyMileageKm,
    monthlyMileageLabel: formatMileageKmDisplay(monthlyMileageKm),
    goalAchievementRate,
    goalLabel,
    goalSubline,
    pbDistanceLabel: distanceLabel,
    personalPbLabel,
    recentPbHeadline,
    recentPbSubline,
    recentPbShortValue,
    remainingToGoalLabel,
    isSoloRanked,
    soloRankHint: isSoloRanked
      ? '다른 회원이 기록을 추가하면 비교 그래프가 표시됩니다'
      : null,
    comparisonHint:
      totalRanked <= 1
        ? '현재 리그에 기록이 있는 회원이 적어 개인 성장 중심으로 확인해주세요'
        : null,
  }
}
