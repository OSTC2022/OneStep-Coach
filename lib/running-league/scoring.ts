
/** 카테고리별 만점(100)에 곱하는 가중치 — 합계 1.0 */
export const SCORE_WEIGHTS_NUM = {
  attendance: 0.3,
  goal: 0.25,
  record: 0.2,
  mileage: 0.15,
  recovery: 0.1,
} as const

/** 마일리지 만점 상한 (km) — 초과 거리는 추가 점수 없음 */
export const MILEAGE_SCORE_CAP_KM = 80

export const MILEAGE_SCORE_TIERS = [
  { km: 20, score: 40 },
  { km: 40, score: 60 },
  { km: 60, score: 80 },
  { km: 80, score: 100 },
] as const

export type RunningLeagueScoreBreakdown = {
  attendance_score: number
  goal_score: number
  record_score: number
  mileage_score: number
  recovery_score: number
}

export type RunningLeagueScoreInput = {
  attendance?: Partial<{
    presentSessions: number
    weeksWithTwoPlus: number
    perfectMonth: boolean
  }>
  goalAchievementRatePercent?: number | null
  recordBaseline?: string | null
  recordCurrent?: string | null
  mileageKm?: number | null
  recoveryCompletedPoints?: number | null
  /** 이미 계산된 카테고리 점수(수동 입력) — 자동 계산보다 우선하지 않음, 병합용 */
  manual?: Partial<RunningLeagueScoreBreakdown>
}

/** 0~100 정규화 */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export const normalizeScore = clampScore

/**
 * total_score =
 *   attendance * 0.30 + goal * 0.25 + record * 0.20 + mileage * 0.15 + recovery * 0.10
 * 각 항목은 0~100 정규화 후 가중치 적용. 결과 0~100, 소수 첫째 자리.
 */
export function computeTotalScore(scores: RunningLeagueScoreBreakdown): number {
  const total =
    normalizeScore(scores.attendance_score) * SCORE_WEIGHTS_NUM.attendance +
    normalizeScore(scores.goal_score) * SCORE_WEIGHTS_NUM.goal +
    normalizeScore(scores.record_score) * SCORE_WEIGHTS_NUM.record +
    normalizeScore(scores.mileage_score) * SCORE_WEIGHTS_NUM.mileage +
    normalizeScore(scores.recovery_score) * SCORE_WEIGHTS_NUM.recovery
  return clampTotalScore(total)
}

export function clampTotalScore(value: number): number {
  return Math.round(clampScore(value) * 10) / 10
}

export function formatScoreDisplay(value: number): string {
  const normalized = clampTotalScore(value)
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1)
}

/**
 * 마일리지 점수 (0~100)
 * 20km=40, 40km=60, 60km=80, 80km 이상=100 (상한)
 * 구간 내 선형 보간, 80km 초과 추가 점수 없음
 */
export function mileageScoreFromKm(km: number): number {
  const distance = Math.max(0, Number(km) || 0)
  const capped = Math.min(distance, MILEAGE_SCORE_CAP_KM)

  if (capped <= 0) return 0
  if (capped >= MILEAGE_SCORE_CAP_KM) return 100

  const tiers = MILEAGE_SCORE_TIERS
  for (let i = 0; i < tiers.length; i += 1) {
    const tier = tiers[i]
    if (capped <= tier.km) {
      const prev = tiers[i - 1]
      if (!prev) {
        return Math.round((capped / tier.km) * tier.score)
      }
      const ratio = (capped - prev.km) / (tier.km - prev.km)
      return Math.round(prev.score + ratio * (tier.score - prev.score))
    }
  }

  return 100
}

/** 출석 점수 (0~100) — lessons 출석 기반 */
export function attendanceScoreFromLessonCounts(counts: {
  presentSessions: number
  weeksWithTwoPlus: number
  perfectMonth: boolean
}): number {
  let raw = counts.presentSessions * 10
  if (counts.weeksWithTwoPlus > 0) raw += 10
  if (counts.perfectMonth) raw += 30
  return normalizeScore(raw)
}

/** 개인 목표 달성률 → 목표 점수 (0~100) */
export function goalScoreFromAchievementRate(ratePercent: number): number {
  const rate = normalizeScore(ratePercent)
  if (rate >= 100) return 100
  if (rate >= 80) return 80
  if (rate >= 60) return 60
  if (rate >= 40) return 40
  if (rate > 0) return 20
  return 0
}

/** "32:10", "1:02:30", "5km 32:10", "half 3:28:55", "1:42:10" → 초 (문자열 정렬 금지) */
export function parseRunningTimeToSeconds(input: string | null | undefined): number | null {
  if (!input?.trim()) return null
  const cleaned = input.trim().replace(/^(1km|3km|5km|10km|half|full)\s*/i, '')
  const parts = cleaned.split(':').map((part) => Number(part.trim()))
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

/**
 * 기록 향상 점수 (0~100)
 * 월초 대비 월말 기록 단축 비율 기준
 */
export function recordImprovementScoreFromTimes(
  baseline: string | null | undefined,
  current: string | null | undefined,
): number {
  const baseSec = parseRunningTimeToSeconds(baseline)
  const curSec = parseRunningTimeToSeconds(current)
  if (baseSec == null || curSec == null || baseSec <= 0) return 0
  if (curSec >= baseSec) return 0

  const improvementRate = ((baseSec - curSec) / baseSec) * 100
  if (improvementRate >= 10) return 100
  if (improvementRate >= 8) return 80
  if (improvementRate >= 5) return 60
  if (improvementRate >= 2) return 40
  return 20
}

/** 회복관리 체크 누적 점수 → 0~100 (월간 누적, 상한 100) */
export function recoveryScoreFromPoints(points: number): number {
  return normalizeScore(points)
}

export function recoveryScoreFromChecks(
  checks: ReadonlyArray<{ completed: boolean; points: number }>,
): number {
  const total = checks.reduce((sum, item) => sum + (item.completed ? item.points : 0), 0)
  return recoveryScoreFromPoints(total)
}

/** 참가자 원시 데이터 → 정규화된 5개 항목 점수 */
export function computeParticipantScoreBreakdown(
  input: RunningLeagueScoreInput,
): RunningLeagueScoreBreakdown {
  const manual = input.manual ?? {}

  const attendance_score =
    manual.attendance_score != null
      ? normalizeScore(manual.attendance_score)
      : input.attendance
        ? attendanceScoreFromLessonCounts({
            presentSessions: input.attendance.presentSessions ?? 0,
            weeksWithTwoPlus: input.attendance.weeksWithTwoPlus ?? 0,
            perfectMonth: input.attendance.perfectMonth ?? false,
          })
        : 0

  const goal_score =
    manual.goal_score != null
      ? normalizeScore(manual.goal_score)
      : input.goalAchievementRatePercent != null
        ? goalScoreFromAchievementRate(input.goalAchievementRatePercent)
        : 0

  const record_score =
    manual.record_score != null
      ? normalizeScore(manual.record_score)
      : recordImprovementScoreFromTimes(input.recordBaseline, input.recordCurrent)

  const mileage_score =
    manual.mileage_score != null
      ? normalizeScore(manual.mileage_score)
      : input.mileageKm != null
        ? mileageScoreFromKm(input.mileageKm)
        : 0

  const recovery_score =
    manual.recovery_score != null
      ? normalizeScore(manual.recovery_score)
      : input.recoveryCompletedPoints != null
        ? recoveryScoreFromPoints(input.recoveryCompletedPoints)
        : 0

  return {
    attendance_score,
    goal_score,
    record_score,
    mileage_score,
    recovery_score,
  }
}

export interface RunningLeagueRankRow {
  participantId: string
  memberId: string
  memberName: string
  goalLevel: string | null
  personalGoal: string | null
  mileageKm: number
  recordBaseline: string | null
  recordCurrent: string | null
  scores: RunningLeagueScoreBreakdown
  totalScore: number
  rank: number
}

export interface LeaderboardSortInput {
  totalScore: number
  scores: RunningLeagueScoreBreakdown
  mileageKm: number
  memberName: string
  participantId: string
}

/**
 * 순위 정렬 비교 (동점 시 보조 기준)
 * 1. 총점 2. 목표 3. 출석 4. 기록 5. 마일리지 6. 회복 7. 이름
 */
export function compareLeaderboardEntries(a: LeaderboardSortInput, b: LeaderboardSortInput): number {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
  if (b.scores.goal_score !== a.scores.goal_score) return b.scores.goal_score - a.scores.goal_score
  if (b.scores.attendance_score !== a.scores.attendance_score) {
    return b.scores.attendance_score - a.scores.attendance_score
  }
  if (b.scores.record_score !== a.scores.record_score) return b.scores.record_score - a.scores.record_score
  if (b.scores.mileage_score !== a.scores.mileage_score) return b.scores.mileage_score - a.scores.mileage_score
  if (b.scores.recovery_score !== a.scores.recovery_score) {
    return b.scores.recovery_score - a.scores.recovery_score
  }
  return a.memberName.localeCompare(b.memberName, 'ko')
}

/** 동점자는 같은 순위(1224 방식), 다음 순위는 건너뜀 */
export function assignCompetitionRanks<T extends { totalScore: number }>(
  sortedRows: T[],
): Array<T & { rank: number }> {
  let rank = 0
  let previousTotal: number | null = null

  return sortedRows.map((row, index) => {
    if (previousTotal === null || row.totalScore !== previousTotal) {
      rank = index + 1
      previousTotal = row.totalScore
    }
    return { ...row, rank }
  })
}

export function buildLeaderboard<
  T extends {
    id: string
    member_id: string
    member?: { name?: string | null } | null
    goal_level?: string | null
    personal_goal?: string | null
    mileage_km?: number | null
    record_baseline?: string | null
    record_current?: string | null
    attendance_score: number
    goal_score: number
    record_score: number
    mileage_score: number
    recovery_score: number
  },
>(participants: T[]): RunningLeagueRankRow[] {
  const rows = participants.map((row) => mapParticipantToLeaderboardRow(row))
  const sorted = [...rows].sort((a, b) => compareLeaderboardEntries(a, b))
  return assignCompetitionRanks(sorted)
}

export type CategoryLeaderboardKind = 'record' | 'mileage'

type LeaderboardParticipantInput = {
  id: string
  member_id: string
  member?: { name?: string | null } | null
  goal_level?: string | null
  personal_goal?: string | null
  mileage_km?: number | null
  record_baseline?: string | null
  record_current?: string | null
  attendance_score: number
  goal_score: number
  record_score: number
  mileage_score: number
  recovery_score: number
}

function mapParticipantToLeaderboardRow<T extends LeaderboardParticipantInput>(row: T) {
  const scores: RunningLeagueScoreBreakdown = {
    attendance_score: normalizeScore(Number(row.attendance_score)),
    goal_score: normalizeScore(Number(row.goal_score)),
    record_score: normalizeScore(Number(row.record_score)),
    mileage_score: normalizeScore(Number(row.mileage_score)),
    recovery_score: normalizeScore(Number(row.recovery_score)),
  }
  return {
    participantId: row.id,
    memberId: row.member_id,
    memberName: row.member?.name?.trim() || '회원',
    goalLevel: row.goal_level ?? null,
    personalGoal: row.personal_goal ?? null,
    mileageKm: Number(row.mileage_km ?? 0),
    recordBaseline: row.record_baseline ?? null,
    recordCurrent: row.record_current ?? null,
    scores,
    totalScore: computeTotalScore(scores),
  }
}

/** PB(기록) 또는 마일리지 점수만으로 순위를 매깁니다. */
export function buildCategoryLeaderboard<T extends LeaderboardParticipantInput>(
  participants: T[],
  kind: CategoryLeaderboardKind,
): RunningLeagueRankRow[] {
  const scoreKey = kind === 'record' ? 'record_score' : 'mileage_score'
  const rows = participants.map((row) => mapParticipantToLeaderboardRow(row))
  const sorted = [...rows].sort((a, b) => {
    const diff = b.scores[scoreKey] - a.scores[scoreKey]
    if (diff !== 0) return diff
    return a.memberName.localeCompare(b.memberName, 'ko')
  })
  return assignCompetitionRanks(
    sorted.map((row) => ({ ...row, totalScore: row.scores[scoreKey] })),
  )
}
