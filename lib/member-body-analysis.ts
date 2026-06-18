import { differenceInDays, format, parseISO, startOfWeek, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { MemberBodyRecord } from '@/lib/actions/member-body-records'
import type { BodyPeriodMode, BodyPeriodRange } from '@/lib/member-body-period-settings'
import {
  getDefaultSupplementConfig,
  type MemberSupplementConfig,
} from '@/lib/member-body-nutrition'
import { calculateProteinAchievementPercent } from '@/lib/member-body-protein'
import {
  formatPainAreaLabel,
  hasConditionData,
  painLevelToChartScore,
  wellnessChoiceLabel,
  wellnessReportLabel,
  wellnessValueLabel,
  type BodyCondition,
  type FatigueLevel,
  type MuscleSoreness,
  type PainArea,
  type SleepHours,
} from '@/lib/member-body-wellness'
import { calculateMemberBmi, roundBodyMetric } from '@/lib/member-utils'

export type BodyAnalysisStats = {
  latest: number | null
  first: number | null
  min: number | null
  max: number | null
  average: number | null
  delta: number | null
  recordCount: number
  latestBmi: number | null
}

/** 기간 범위에 맞는 기록만 반환 (bootstrap 포함) */
export function filterRecordsByPeriod(
  records: MemberBodyRecord[],
  range: BodyPeriodRange | null,
): MemberBodyRecord[] {
  if (!range) return records
  return records.filter((record) => {
    const date = record.recorded_at
    return date >= range.from && date <= range.to
  })
}

export type BodyChartGranularity = 'raw' | 'daily' | 'weekly'

export function resolveBodyChartGranularity(mode: BodyPeriodMode): BodyChartGranularity {
  if (mode === 'daily') return 'daily'
  if (mode === 'weekly') return 'weekly'
  return 'raw'
}

/** 그래프용 기록 — 1일·1주 단위일 때 하루/주당 1점 */
export function prepareRecordsForChart(
  records: MemberBodyRecord[],
  granularity: BodyChartGranularity,
): MemberBodyRecord[] {
  const sorted = [...records].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  if (granularity === 'raw') return sorted

  if (granularity === 'daily') {
    const byDay = new Map<string, MemberBodyRecord>()
    for (const record of sorted) {
      byDay.set(record.recorded_at, record)
    }
    return [...byDay.values()].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  }

  const byWeek = new Map<string, MemberBodyRecord>()
  for (const record of sorted) {
    const weekStart = format(
      startOfWeek(parseISO(record.recorded_at), { weekStartsOn: 1, locale: ko }),
      'yyyy-MM-dd',
    )
    const existing = byWeek.get(weekStart)
    if (!existing || record.recorded_at > existing.recorded_at) {
      byWeek.set(weekStart, record)
    }
  }
  return [...byWeek.values()].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
}

export function chartSpanYears(records: MemberBodyRecord[]): boolean {
  if (records.length < 2) return false
  const firstYear = records[0].recorded_at.slice(0, 4)
  const lastYear = records.at(-1)!.recorded_at.slice(0, 4)
  return firstYear !== lastYear
}

export function buildChartAxisDateLabel(
  date: string,
  options?: { includeYear?: boolean; weekly?: boolean },
): string {
  const parsed = parseISO(date)
  const pattern = options?.includeYear ? 'yy.M.d' : 'M/d'
  if (options?.weekly) {
    return format(
      startOfWeek(parsed, { weekStartsOn: 1, locale: ko }),
      pattern,
      { locale: ko },
    )
  }
  return format(parsed, pattern, { locale: ko })
}

/** 기록별 BMI — 기록에 입력한 현재 키 우선, 없으면 신체정보 초기 키 */
export function resolveRecordHeight(
  baselineHeightCm?: number | null,
  recordHeightCm?: number | null,
): number | null {
  return recordHeightCm ?? baselineHeightCm ?? null
}

export function buildBodyAnalysisStats(
  records: MemberBodyRecord[],
  baselineHeightCm?: number | null,
  baselineWeightKg?: number | null,
): BodyAnalysisStats {
  if (records.length === 0) {
    return {
      latest: null,
      first: null,
      min: null,
      max: null,
      average: null,
      delta: null,
      recordCount: 0,
      latestBmi: null,
    }
  }

  const weights = records.map((row) => roundBodyMetric(row.weight_kg) ?? row.weight_kg)
  const latest = weights.at(-1) ?? null
  const firstRecord = weights[0] ?? null
  const first =
    baselineWeightKg != null
      ? roundBodyMetric(baselineWeightKg) ?? baselineWeightKg
      : firstRecord
  const min = roundBodyMetric(Math.min(...weights)) ?? Math.min(...weights)
  const max = roundBodyMetric(Math.max(...weights)) ?? Math.max(...weights)
  const average = Number(
    (weights.reduce((sum, value) => sum + value, 0) / weights.length).toFixed(1),
  )
  const delta =
    latest != null && first != null
      ? Number((latest - first).toFixed(1))
      : null

  return {
    latest,
    first,
    min,
    max,
    average,
    delta,
    recordCount: records.length,
    latestBmi: calculateMemberBmi(
      resolveRecordHeight(baselineHeightCm, records.at(-1)?.height_cm),
      latest,
    ),
  }
}

export type TrainingReadiness = {
  label: string
  description: string
  tone: 'good' | 'normal' | 'caution' | 'none'
}

/** BMI·체중 변화 기반 훈련 준비도 */
export function getTrainingReadiness(
  bmi: number | null,
  delta: number | null,
): TrainingReadiness {
  if (bmi == null) {
    return { label: '-', description: '체중 기록이 필요합니다', tone: 'none' }
  }
  if (bmi < 18.5 || bmi >= 25) {
    return { label: '주의', description: '체형·컨디션 점검 필요', tone: 'caution' }
  }
  if (delta != null && Math.abs(delta) >= 3) {
    return { label: '변동', description: '수면·피로 기록 필요', tone: 'caution' }
  }
  if (bmi >= 18.5 && bmi < 23) {
    return { label: '좋음', description: '수면·피로 기록 필요', tone: 'good' }
  }
  return { label: '보통', description: '수면·피로 기록 필요', tone: 'normal' }
}

export type BodyWarningSignal = {
  label: string
  description: string
  hasWarning: boolean
}

/** BMI·급변·체중 편차 주의 신호 */
export function getBodyWarningSignals(
  bmi: number | null,
  delta: number | null,
  min: number | null,
  max: number | null,
): BodyWarningSignal {
  const notes: string[] = []
  if (bmi != null && (bmi < 18.5 || bmi >= 25)) notes.push('BMI 범위 확인')
  if (delta != null && Math.abs(delta) >= 3) notes.push('급격한 체중 변화')
  if (min != null && max != null && max - min >= 5) notes.push('체중 편차 큼')
  if (notes.length === 0) {
    return { label: '정상', description: '급격한 변화 없음', hasWarning: false }
  }
  return { label: '주의', description: notes.join(' · '), hasWarning: true }
}

/** 최근 체중 비교 기준 — 이 일수 이내의 직전 기록만 비교 */
export const RECENT_WEIGHT_COMPARE_MAX_DAYS = 30

export type RecentWeightChange = {
  delta: number | null
  daysAgo: number | null
  description: string
}

/** N일 전 · N주 전 표기 */
export function formatWeightCompareDaysAgo(daysAgo: number): string {
  if (daysAgo <= 0) return '직전 기록'
  if (daysAgo < 7) return `${daysAgo}일 전`
  const weeks = Math.round(daysAgo / 7)
  if (daysAgo <= 30) {
    return weeks <= 1 ? '1주 전' : `${weeks}주 전`
  }
  return `${daysAgo}일 전`
}

/** 최신 체중과 30일 이내 직전 기록 비교 */
export function buildRecentWeightChange(
  records: MemberBodyRecord[],
): RecentWeightChange {
  const sorted = [...records].sort((a, b) =>
    a.recorded_at.localeCompare(b.recorded_at),
  )

  if (sorted.length < 2) {
    return {
      delta: null,
      daysAgo: null,
      description: '비교할 최근 기록이 없습니다',
    }
  }

  const latest = sorted.at(-1)!
  const previous = sorted.at(-2)!
  const latestDate = parseISO(latest.recorded_at)
  const previousDate = parseISO(previous.recorded_at)
  const daysAgo = differenceInDays(latestDate, previousDate)

  if (daysAgo > RECENT_WEIGHT_COMPARE_MAX_DAYS) {
    return {
      delta: null,
      daysAgo: null,
      description: `최근 ${RECENT_WEIGHT_COMPARE_MAX_DAYS}일 이내 비교 기록이 없습니다`,
    }
  }

  const latestWeight = roundBodyMetric(latest.weight_kg) ?? latest.weight_kg
  const previousWeight =
    roundBodyMetric(previous.weight_kg) ?? previous.weight_kg
  const delta = Number((latestWeight - previousWeight).toFixed(1))
  const timeLabel = formatWeightCompareDaysAgo(daysAgo)

  let changeLabel = '동일'
  if (delta > 0) changeLabel = '증가'
  else if (delta < 0) changeLabel = '감소'

  return {
    delta,
    daysAgo,
    description: `${timeLabel} 기록 대비 ${changeLabel}`,
  }
}

/** @deprecated buildRecentWeightChange 사용 */
export function getRecentWeightChangeDescription(delta: number | null): string {
  if (delta == null) return '비교할 기록이 없습니다'
  if (delta > 0) return '최근 기록 대비 증가'
  if (delta < 0) return '최근 기록 대비 감소'
  return '최근 기록과 동일'
}

export function trainingReadinessToneClass(tone: TrainingReadiness['tone']) {
  switch (tone) {
    case 'good':
      return 'text-primary'
    case 'normal':
      return 'text-foreground'
    case 'caution':
      return 'text-amber-300'
    default:
      return ''
  }
}

export type GrowthStatus = {
  label: string
  description: string
  tone: 'good' | 'normal' | 'caution' | 'none'
}

/** BMI 기반 성장·체형 상태 (성장기 선수 안내용) */
export function getGrowthStatus(bmi: number | null): GrowthStatus {
  if (bmi == null) {
    return { label: '-', description: '체중·키 기록 필요', tone: 'none' }
  }
  if (bmi < 18.5) {
    return {
      label: '성장 점검',
      description: `BMI ${bmi.toFixed(1)} · 회복·영양 확인`,
      tone: 'caution',
    }
  }
  if (bmi < 23) {
    return {
      label: '성장 양호',
      description: `BMI ${bmi.toFixed(1)} · 균형 유지`,
      tone: 'good',
    }
  }
  if (bmi < 25) {
    return {
      label: '보통',
      description: `BMI ${bmi.toFixed(1)} · 컨디션 함께 확인`,
      tone: 'normal',
    }
  }
  return {
    label: '체중 관리',
    description: `BMI ${bmi.toFixed(1)} · 무리한 감량 주의`,
    tone: 'caution',
  }
}

export type ConditionStatus = {
  label: string
  description: string
  tone: 'good' | 'normal' | 'caution' | 'none'
}

/** 최근 컨디션 기록 표시 */
export function getLatestConditionStatus(records: MemberBodyRecord[]): ConditionStatus {
  const latestWithCondition = [...records]
    .reverse()
    .find((record) => !record.id.startsWith('bootstrap-') && record.condition)

  if (!latestWithCondition?.condition) {
    return { label: '컨디션 기록 필요', description: '오늘 상태에서 입력해주세요', tone: 'none' }
  }

  const label = wellnessReportLabel('condition', latestWithCondition.condition)
  const toneMap: Record<BodyCondition, ConditionStatus['tone']> = {
    good: 'good',
    normal: 'normal',
    bad: 'caution',
  }

  return {
    label,
    description: '최근 컨디션 기록',
    tone: toneMap[latestWithCondition.condition],
  }
}

export function conditionStatusToneClass(tone: ConditionStatus['tone']) {
  switch (tone) {
    case 'good':
      return 'text-emerald-300'
    case 'normal':
      return 'text-amber-300'
    case 'caution':
      return 'text-red-300'
    default:
      return 'text-foreground/60'
  }
}

export function wellnessSummaryToneClass(
  tone: 'good' | 'normal' | 'caution' | 'none',
): string {
  switch (tone) {
    case 'good':
      return 'text-emerald-300'
    case 'normal':
      return 'text-amber-300'
    case 'caution':
      return 'text-red-300'
    default:
      return ''
  }
}

/** 코치 체크 4단계 + 기록 부족 */
export type CoachCheckStatus =
  | 'stable'
  | 'watch'
  | 'caution'
  | 'recovery'
  | 'insufficient_records'

export type CoachCheckReport = {
  overallStatus: CoachCheckStatus
  /** 훈련 강도 조절에 직접 영향 — 주의 신호 */
  warningSignals: string[]
  /** 회복 관리 보완 — 직접적 위험 신호는 아님 */
  recoveryPoints: string[]
  /** 최근 컨디션·피로 등 개선 흐름 */
  positiveFlows: string[]
  /** 체중 등 기록 품질 확인 안내 — 훈련 판단과 분리 */
  recordCheckNotes: string[]
  recommendation: string
  /** 기록 이력 기준 안내 멘트 */
  historyNote: string
}

export const COACH_CHECK_STATUS_LABELS: Record<CoachCheckStatus, string> = {
  stable: '안정',
  watch: '관찰 필요',
  caution: '주의 필요',
  recovery: '회복 권장',
  insufficient_records: '기록 부족',
}

export function coachCheckStatusClasses(status: CoachCheckStatus): string {
  switch (status) {
    case 'stable':
      return 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300'
    case 'watch':
      return 'border-amber-400/60 bg-amber-500/15 text-amber-300'
    case 'caution':
      return 'border-orange-400/60 bg-orange-500/15 text-orange-200'
    case 'recovery':
      return 'border-red-400/60 bg-red-500/15 text-red-300'
    case 'insufficient_records':
      return 'border-amber-400/60 bg-amber-500/15 text-amber-200'
  }
}

function getRealRecords(records: MemberBodyRecord[]): MemberBodyRecord[] {
  return records.filter((record) => !record.id.startsWith('bootstrap-'))
}

function recordsWithinDays(
  records: MemberBodyRecord[],
  days: number,
  referenceDate: string,
): MemberBodyRecord[] {
  const cutoff = format(subDays(parseISO(referenceDate), days), 'yyyy-MM-dd')
  return records.filter(
    (record) => record.recorded_at >= cutoff && record.recorded_at <= referenceDate,
  )
}

function hasPainSignal(record: MemberBodyRecord): boolean {
  return Boolean(record.pain_area && record.pain_area !== 'none')
}

const COACH_SCORE_WEIGHT_TODAY = 0.6
const COACH_SCORE_WEIGHT_RECENT3 = 0.3
const COACH_SCORE_WEIGHT_CHANGE = 0.1
const COACH_MAX_WARNING_SIGNALS = 3
const COACH_MAX_RECOVERY_POINTS = 3
const POST_WORKOUT_RECOVERY_LABEL = '운동 후 회복식 보완 필요'

type TrainingRecordScore = {
  sleep: number
  condition: number
  fatigue: number
  soreness: number
  pain: number
  meal: number
  total: number
}

type RecoveryRecordScore = {
  protein: number
  proteinNeedsRecord: boolean
  postWorkout: number
  hydration: number
  supplement: number
}

function getValidWeightRecords(records: MemberBodyRecord[]): MemberBodyRecord[] {
  return records.filter(
    (record) =>
      !record.id.startsWith('bootstrap-') &&
      Number.isFinite(record.weight_kg) &&
      record.weight_kg > 0,
  )
}

function computeWeightChange(
  weightRecords: MemberBodyRecord[],
): { pct: number | null; direction: 'up' | 'down' | 'flat' } {
  if (weightRecords.length < 2) return { pct: null, direction: 'flat' }
  const first = weightRecords[0].weight_kg
  const last = weightRecords[weightRecords.length - 1].weight_kg
  if (!first) return { pct: null, direction: 'flat' }
  const delta = last - first
  const pct = Math.abs((delta / first) * 100)
  return {
    pct: Number(pct.toFixed(1)),
    direction: delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat',
  }
}

const WEIGHT_RECORD_CHECK_PCT = 0.04
const WEIGHT_SUSPICIOUS_JUMP_PCT = 0.05
const WEIGHT_JUMP_MAX_DAYS = 3
const WEIGHT_RECORD_CHECK_LABEL =
  '최근 체중 기록에 큰 차이가 있어 입력값 확인이 필요합니다.'
const WEIGHT_SUSPICIOUS_REFERENCE_NOTE =
  '입력 오류 가능성이 있는 체중 기록은 훈련 판단에 강하게 반영하지 않습니다.'

function getMaxNearbyWeightJumpPct(
  weightRecords: MemberBodyRecord[],
): number | null {
  const sorted = [...weightRecords].sort((a, b) =>
    a.recorded_at.localeCompare(b.recorded_at),
  )
  let maxPct: number | null = null
  for (let i = 1; i < sorted.length; i++) {
    const days = differenceInDays(
      parseISO(sorted[i].recorded_at),
      parseISO(sorted[i - 1].recorded_at),
    )
    if (days > WEIGHT_JUMP_MAX_DAYS) continue
    const prev = sorted[i - 1].weight_kg
    if (prev <= 0) continue
    const pct = Math.abs(sorted[i].weight_kg - prev) / prev
    if (maxPct == null || pct > maxPct) maxPct = pct
  }
  return maxPct
}

function scoreWeightChangePct(pct: number | null): number {
  if (pct == null) return 0
  if (pct < 1) return 0
  if (pct < 2) return 1
  if (pct < 3) return 2
  return 3
}

function assessWeightChange(
  validWeightRecords14d: MemberBodyRecord[],
  realRecordCount: number,
): WeightChangeAssessment {
  const empty: WeightChangeAssessment = {
    eligible: false,
    earlyStage: realRecordCount > 0 && realRecordCount < CHART_TREND_MIN_RECORDS,
    referenceOnly: true,
    suspiciousJump: false,
    needsRecordCheck: false,
    warningLabel: null,
    referenceLabel: null,
    recordCheckLabel: null,
    referenceNote: null,
    affectsCaution: false,
    pct: null,
    direction: 'flat',
    trend: 'stable',
  }

  if (validWeightRecords14d.length < WEIGHT_CHANGE_MIN_RECORDS_14D) {
    return empty
  }

  const sorted = [...validWeightRecords14d].sort((a, b) =>
    a.recorded_at.localeCompare(b.recorded_at),
  )
  const { pct, direction } = computeWeightChange(sorted)
  const trend = weightTrendLevel(pct)
  const earlyStage = realRecordCount < CHART_TREND_MIN_RECORDS
  const nearbyJumpPct = getMaxNearbyWeightJumpPct(sorted)
  const suspiciousJump =
    nearbyJumpPct != null && nearbyJumpPct >= WEIGHT_SUSPICIOUS_JUMP_PCT
  const needsRecordCheck =
    nearbyJumpPct != null && nearbyJumpPct >= WEIGHT_RECORD_CHECK_PCT
  const referenceOnly = earlyStage || suspiciousJump

  if (suspiciousJump) {
    return {
      ...empty,
      eligible: true,
      earlyStage,
      referenceOnly: true,
      suspiciousJump: true,
      needsRecordCheck: true,
      recordCheckLabel: WEIGHT_RECORD_CHECK_LABEL,
      referenceNote: WEIGHT_SUSPICIOUS_REFERENCE_NOTE,
      pct,
      direction,
      trend,
    }
  }

  if (needsRecordCheck) {
    return {
      ...empty,
      eligible: true,
      earlyStage,
      referenceOnly: true,
      suspiciousJump: false,
      needsRecordCheck: true,
      recordCheckLabel: WEIGHT_RECORD_CHECK_LABEL,
      pct,
      direction,
      trend,
    }
  }

  if (earlyStage) {
    return {
      ...empty,
      eligible: true,
      earlyStage: true,
      referenceOnly: true,
      suspiciousJump: false,
      pct,
      direction,
      trend,
      referenceLabel: '참고 · 초기 기록 단계',
    }
  }

  const warningLabel =
    pct != null && pct >= 2 ? '최근 체중 변화 폭이 큼' : null
  const referenceLabel =
    pct != null && pct >= 1 && pct < 2
      ? '참고 · 최근 체중 변화 추세 관찰 중'
      : null

  return {
    eligible: true,
    earlyStage: false,
    referenceOnly: false,
    suspiciousJump: false,
    warningLabel,
    referenceLabel,
    affectsCaution: pct != null && pct >= 2,
    pct,
    direction,
    trend,
  }
}

function weightTrendLevel(pct: number | null): 'stable' | 'watch' | 'caution' | 'severe' {
  if (pct == null) return 'stable'
  if (pct < 1) return 'stable'
  if (pct < 2) return 'watch'
  if (pct < 3) return 'caution'
  return 'severe'
}

type WeightChangeAssessment = {
  eligible: boolean
  earlyStage: boolean
  referenceOnly: boolean
  suspiciousJump: boolean
  needsRecordCheck: boolean
  warningLabel: string | null
  referenceLabel: string | null
  recordCheckLabel: string | null
  referenceNote: string | null
  affectsCaution: boolean
  pct: number | null
  direction: 'up' | 'down' | 'flat'
  trend: 'stable' | 'watch' | 'caution' | 'severe'
}

type FatigueTrend = 'recovery' | 'worsening' | 'accumulation' | 'neutral'

type FatiguePatternAnalysis = {
  consecutiveHigh: number
  highInRecent3: number
  latestIsHigh: boolean
  latestIsLow: boolean
  trend: FatigueTrend
  trendDelta: number
  flowDescription: string | null
  positiveFlowLabel: string | null
  minStatus: CoachCheckStatus
  warningLabel: string | null
  showAsRepeatPattern: boolean
  forcesCaution: boolean
  forcesRecovery: boolean
}

type PainRepeatAnalysis = {
  repeatedArea: PainArea | null
  repeatCount: number
  minStatus: CoachCheckStatus
  warningLabel: string | null
  forcesCaution: boolean
  forcesRecovery: boolean
}

type CoachAnalysisContext = {
  todayRecord: MemberBodyRecord | null
  primaryRecord: MemberBodyRecord | null
  recent3: MemberBodyRecord[]
  records14d: MemberBodyRecord[]
  validWeightRecords14d: MemberBodyRecord[]
  realRecordCount: number
  weightAssessment: WeightChangeAssessment
  fatiguePattern: FatiguePatternAnalysis
  painPattern: PainRepeatAnalysis
  insufficientWellness: boolean
  wellnessHistoryCount: number
  noRecords: boolean
  supplementConfig: MemberSupplementConfig
  blendedTrainingScore: number
  todayTrainingScore: TrainingRecordScore | null
  recent3TrainingAvg: number
  weightScore: number
}

export const CHART_TREND_MIN_RECORDS = 3
const WELLNESS_HISTORY_TARGET = CHART_TREND_MIN_RECORDS
const RECENT_WELLNESS_DAYS = 7
const WEIGHT_CHANGE_MIN_RECORDS_14D = 2

export const CHART_TREND_INITIAL_NOTICE =
  '현재는 초기 기록 단계입니다. 최근 3회 이상 기록 후 추세 분석이 제공됩니다.'

export function shouldShowChartTrendNotice(records: MemberBodyRecord[]): boolean {
  const count = getRealRecords(records).length
  return count > 0 && count < CHART_TREND_MIN_RECORDS
}

/** 기록 이력·최근성에 따른 코치 체크 하단 멘트 */
export function buildRecordHistoryNote(
  records: MemberBodyRecord[],
  referenceDate: string = format(new Date(), 'yyyy-MM-dd'),
): string {
  const realRecords = getRealRecords(records)
  if (realRecords.length === 0) return '기록이 없습니다'

  const wellnessRecords = realRecords.filter((record) => hasConditionData(record))
  const recentWellness7d = recordsWithinDays(wellnessRecords, RECENT_WELLNESS_DAYS, referenceDate)

  if (recentWellness7d.length === 0) {
    return '분석 제한: 최근 컨디션·수면·피로 기록이 필요합니다.'
  }
  if (realRecords.length < WELLNESS_HISTORY_TARGET) {
    return '초기 기록 단계입니다. 최근 3회 이상 기록 후 추세 분석이 제공됩니다.'
  }

  return '최근 흐름 분석 가능'
}

function buildCoachAnalysisContext(
  records: MemberBodyRecord[],
  referenceDate: string,
): CoachAnalysisContext {
  const realRecords = getRealRecords(records)
  const todayRecord =
    realRecords.find((record) => record.recorded_at === referenceDate) ?? null
  const recent3 = realRecords.slice(-3)
  const records14d = recordsWithinDays(realRecords, 14, referenceDate)
  const validWeightRecords14d = getValidWeightRecords(records14d)
  const primaryRecord = todayRecord ?? recent3.at(-1) ?? null

  const wellnessHistoryCount = realRecords.filter((record) =>
    hasConditionData(record),
  ).length
  const insufficientWellness = realRecords.length > 0 && wellnessHistoryCount === 0
  const weightAssessment = assessWeightChange(
    validWeightRecords14d,
    realRecords.length,
  )
  const fatiguePattern = analyzeFatiguePattern(recent3)
  const painPattern = analyzePainRepeat(recent3, primaryRecord)
  const todayTrainingScore = todayRecord
    ? scoreTrainingRecord(todayRecord)
    : primaryRecord
      ? scoreTrainingRecord(primaryRecord)
      : null
  const recent3TrainingAvg = averageTrainingScore(recent3)
  const weightScore =
    weightAssessment.eligible &&
    !weightAssessment.suspiciousJump &&
    !weightAssessment.needsRecordCheck
      ? scoreWeightChangePct(weightAssessment.pct)
      : 0
  const blendedTrainingScore = Math.round(
    (todayTrainingScore?.total ?? 0) * COACH_SCORE_WEIGHT_TODAY +
      recent3TrainingAvg * COACH_SCORE_WEIGHT_RECENT3 +
      weightScore * COACH_SCORE_WEIGHT_CHANGE,
  )

  return {
    todayRecord,
    primaryRecord,
    recent3,
    records14d,
    validWeightRecords14d,
    realRecordCount: realRecords.length,
    weightAssessment,
    fatiguePattern,
    painPattern,
    insufficientWellness,
    wellnessHistoryCount,
    noRecords: realRecords.length === 0,
    supplementConfig: getDefaultSupplementConfig(),
    blendedTrainingScore,
    todayTrainingScore,
    recent3TrainingAvg,
    weightScore,
  }
}

function isHighFatigue(record: MemberBodyRecord): boolean {
  return record.fatigue === 'high'
}

function recentFatigueLevels(recent3: MemberBodyRecord[]): FatigueLevel[] {
  return recent3
    .map((record) => record.fatigue)
    .filter((level): level is FatigueLevel => Boolean(level))
}

function formatFatigueFlow(levels: FatigueLevel[]): string {
  return levels.map((level) => wellnessValueLabel(level)).join(' → ')
}

function isFatigueRecoveryFlow(levels: FatigueLevel[]): boolean {
  const latest = levels.at(-1)
  if (latest !== 'low') return false
  if (levels.length >= 3) {
    const [first, second, third] = levels.slice(-3)
    if (first === 'high' && second === 'normal' && third === 'low') return true
  }
  if (levels.length >= 2) {
    const [prev, last] = levels.slice(-2)
    if (prev === 'high' && last === 'low') return true
    if (prev === 'normal' && last === 'low') return true
  }
  return levels.length >= 2 && levels.slice(0, -1).some((level) => level !== 'low')
}

function isFatigueWorseningFlow(levels: FatigueLevel[]): boolean {
  if (levels.length >= 3) {
    const [first, second, third] = levels.slice(-3)
    if (first === 'low' && second === 'normal' && third === 'high') return true
  }
  if (levels.length >= 2) {
    const [prev, last] = levels.slice(-2)
    if (prev === 'normal' && last === 'high') return true
    if (prev === 'low' && last === 'high') return true
  }
  return false
}

function countTrailingConsecutiveHighFatigue(records: MemberBodyRecord[]): number {
  let count = 0
  for (let i = records.length - 1; i >= 0; i--) {
    if (isHighFatigue(records[i])) count++
    else break
  }
  return count
}

function analyzeFatiguePattern(recent3: MemberBodyRecord[]): FatiguePatternAnalysis {
  const fatigueLevels = recentFatigueLevels(recent3)
  const consecutiveHigh = countTrailingConsecutiveHighFatigue(recent3)
  const highInRecent3 = recent3.filter(isHighFatigue).length
  const latestFatigue = recent3.at(-1)?.fatigue
  const latestIsHigh = latestFatigue === 'high'
  const latestIsLow = latestFatigue === 'low'

  let trend: FatigueTrend = 'neutral'
  let trendDelta = 0
  let flowDescription: string | null = null
  let positiveFlowLabel: string | null = null

  if (latestIsLow && isFatigueRecoveryFlow(fatigueLevels)) {
    trend = 'recovery'
    trendDelta = -1
    flowDescription = formatFatigueFlow(fatigueLevels)
    positiveFlowLabel = `피로도는 최근 ${flowDescription}으로 회복되는 흐름입니다.`
  } else if (isFatigueWorseningFlow(fatigueLevels)) {
    trend = 'worsening'
    trendDelta = 1
  } else if (
    latestIsHigh &&
    (consecutiveHigh >= 2 || (highInRecent3 >= 2 && latestIsHigh))
  ) {
    trend = 'accumulation'
  }

  let forcesRecovery = false
  let forcesCaution = false
  let minStatus: CoachCheckStatus = 'stable'
  let warningLabel: string | null = null
  let showAsRepeatPattern = false

  if (latestIsHigh) {
    if (consecutiveHigh >= 3) {
      forcesRecovery = true
      minStatus = 'recovery'
      showAsRepeatPattern = true
      warningLabel = '피로도 높음 3회 연속 기록'
    } else if (consecutiveHigh >= 2 || highInRecent3 >= 2) {
      forcesCaution = true
      minStatus = 'caution'
      showAsRepeatPattern = true
      warningLabel =
        consecutiveHigh >= 2
          ? '피로도 높음 2회 연속 기록'
          : '최근 3회 중 피로도 높음 반복'
    } else {
      minStatus = 'watch'
      warningLabel = '피로도 높음'
    }
  } else if (latestIsLow && trend === 'recovery') {
    minStatus = 'stable'
  } else if (latestFatigue === 'normal' && trend === 'worsening') {
    minStatus = 'watch'
  }

  return {
    consecutiveHigh,
    highInRecent3,
    latestIsHigh,
    latestIsLow,
    trend,
    trendDelta,
    flowDescription,
    positiveFlowLabel,
    minStatus,
    warningLabel,
    showAsRepeatPattern,
    forcesCaution,
    forcesRecovery,
  }
}

function isSeverePainLevel(painLevel: number | null | undefined): boolean {
  return painLevel != null && painLevel >= 7
}

function analyzePainRepeat(
  recent3: MemberBodyRecord[],
  primaryRecord: MemberBodyRecord | null,
): PainRepeatAnalysis {
  const empty: PainRepeatAnalysis = {
    repeatedArea: null,
    repeatCount: 0,
    minStatus: 'stable',
    warningLabel: null,
    forcesCaution: false,
    forcesRecovery: false,
  }

  const counts = new Map<PainArea, number>()
  for (const record of recent3) {
    if (!hasPainSignal(record) || !record.pain_area) continue
    counts.set(record.pain_area, (counts.get(record.pain_area) ?? 0) + 1)
  }

  let repeatedArea: PainArea | null = null
  let repeatCount = 0
  for (const [area, count] of counts) {
    if (count >= 2 && count > repeatCount) {
      repeatedArea = area
      repeatCount = count
    }
  }

  const r = primaryRecord
  const hasTodayPain = Boolean(r && hasPainSignal(r))

  if (repeatCount >= 2 && repeatedArea) {
    const areaLabel = formatPainAreaLabel(repeatedArea, null)
    const warningLabel = `${areaLabel} 통증 반복`
    const fatigueHigh = r?.fatigue === 'high'
    const sleepLow = r?.sleep_hours === 'under_6'
    const severeSoreness = r?.muscle_soreness === 'severe'
    const severePainInRepeat = recent3.some(
      (record) =>
        record.pain_area === repeatedArea && isSeverePainLevel(record.pain_level),
    )
    const severePainToday =
      Boolean(r?.pain_area === repeatedArea) && isSeverePainLevel(r?.pain_level)

    if (severePainInRepeat || severePainToday) {
      return {
        repeatedArea,
        repeatCount,
        minStatus: 'recovery',
        warningLabel,
        forcesCaution: false,
        forcesRecovery: true,
      }
    }
    if (severeSoreness) {
      return {
        repeatedArea,
        repeatCount,
        minStatus: 'recovery',
        warningLabel,
        forcesCaution: false,
        forcesRecovery: true,
      }
    }
    if (fatigueHigh || sleepLow) {
      return {
        repeatedArea,
        repeatCount,
        minStatus: 'caution',
        warningLabel,
        forcesCaution: true,
        forcesRecovery: false,
      }
    }
    return {
      repeatedArea,
      repeatCount,
      minStatus: 'watch',
      warningLabel,
      forcesCaution: false,
      forcesRecovery: false,
    }
  }

  if (hasTodayPain && r) {
    return {
      ...empty,
      minStatus: 'watch',
      warningLabel: `${formatPainAreaLabel(r.pain_area!, r.pain_area_note)} 통증 기록`,
    }
  }

  return empty
}

function scoreSleep(sleep: SleepHours | null | undefined): number {
  if (!sleep) return 0
  if (sleep === 'over_8' || sleep === '7_8') return 0
  if (sleep === '6_7') return 1
  return 2
}

function scoreCondition(condition: BodyCondition | null | undefined): number {
  if (!condition) return 0
  if (condition === 'good') return 0
  if (condition === 'normal') return 1
  return 3
}

function scoreFatigue(fatigue: MemberBodyRecord['fatigue']): number {
  if (!fatigue) return 0
  if (fatigue === 'low') return 0
  if (fatigue === 'normal') return 1
  return 3
}

function scoreSoreness(soreness: MuscleSoreness | null | undefined): number {
  if (!soreness || soreness === 'none') return 0
  if (soreness === 'mild') return 1
  return 3
}

function scorePainArea(painArea: PainArea | null | undefined): number {
  if (!painArea || painArea === 'none') return 0
  if (painArea === 'knee' || painArea === 'ankle' || painArea === 'back') {
    return 3
  }
  return 2
}

function scoreMeal(meal: MemberBodyRecord['meal_status']): number {
  if (!meal) return 0
  if (meal === 'good') return 0
  if (meal === 'normal') return 1
  return 2
}

function scoreTrainingRecord(record: MemberBodyRecord): TrainingRecordScore {
  const sleep = scoreSleep(record.sleep_hours)
  const condition = scoreCondition(record.condition)
  const fatigue = scoreFatigue(record.fatigue)
  const soreness = scoreSoreness(record.muscle_soreness)
  const pain = scorePainArea(record.pain_area)
  const meal = scoreMeal(record.meal_status)
  return {
    sleep,
    condition,
    fatigue,
    soreness,
    pain,
    meal,
    total: sleep + condition + fatigue + soreness + pain + meal,
  }
}

function averageTrainingScore(records: MemberBodyRecord[]): number {
  if (records.length === 0) return 0
  const scored = records.map(scoreTrainingRecord)
  const sum = scored.reduce((acc, row) => acc + row.total, 0)
  return sum / scored.length
}

function scoreRecoveryRecord(
  record: MemberBodyRecord,
  supplementConfig: MemberSupplementConfig,
): RecoveryRecordScore {
  const proteinPct = calculateProteinAchievementPercent(
    record.protein_intake_g,
    record.protein_target_g,
  )
  let protein = 0
  let proteinNeedsRecord = false

  if (record.protein_intake_g == null && record.protein_status == null) {
    protein = 1
    proteinNeedsRecord = true
  } else if (proteinPct != null) {
    if (proteinPct < 50) protein = 2
    else if (proteinPct < 80) protein = 1
  } else if (record.protein_status === 'insufficient') {
    protein = 2
  } else if (record.protein_status === 'normal') {
    protein = 1
  }

  let postWorkout = 0
  if (record.post_workout_meal_status === 'normal') postWorkout = 1
  else if (record.post_workout_meal_status === 'missed') postWorkout = 1

  let hydration = 0
  if (record.hydration_status === 'normal') hydration = 1
  else if (record.hydration_status === 'insufficient') hydration = 2

  let supplement = 0
  const missedRequired = supplementConfig.items.filter(
    (item) =>
      item.required && record.supplement_status?.[item.id] === 'missed',
  )
  if (missedRequired.length > 0) supplement = 1

  return { protein, proteinNeedsRecord, postWorkout, hydration, supplement }
}

function recordForSignal(ctx: CoachAnalysisContext): MemberBodyRecord | null {
  return ctx.todayRecord ?? ctx.primaryRecord
}

function statusFromScore(score: number): CoachCheckStatus {
  if (score <= 2) return 'stable'
  if (score <= 5) return 'watch'
  if (score <= 8) return 'caution'
  return 'recovery'
}

const STATUS_RANK: Record<CoachCheckStatus, number> = {
  stable: 0,
  watch: 1,
  caution: 2,
  recovery: 3,
  insufficient_records: -1,
}

function maxStatus(
  a: CoachCheckStatus,
  b: CoachCheckStatus,
): CoachCheckStatus {
  if (a === 'insufficient_records') return b
  if (b === 'insufficient_records') return a
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b
}

function capStatus(
  status: CoachCheckStatus,
  max: CoachCheckStatus,
): CoachCheckStatus {
  if (status === 'insufficient_records') return status
  return STATUS_RANK[status] > STATUS_RANK[max] ? max : status
}

const ORDERED_COACH_STATUSES: CoachCheckStatus[] = [
  'stable',
  'watch',
  'caution',
  'recovery',
]

function adjustCoachStatus(
  status: CoachCheckStatus,
  delta: number,
  floor: CoachCheckStatus = 'stable',
): CoachCheckStatus {
  const idx = ORDERED_COACH_STATUSES.indexOf(status)
  const floorIdx = ORDERED_COACH_STATUSES.indexOf(floor)
  const nextIdx = Math.max(
    floorIdx,
    Math.min(ORDERED_COACH_STATUSES.length - 1, idx + delta),
  )
  return ORDERED_COACH_STATUSES[nextIdx]
}

function isLatestRecordFavorable(record: MemberBodyRecord): boolean {
  return (
    record.fatigue === 'low' &&
    record.condition === 'good' &&
    (record.sleep_hours === '7_8' || record.sleep_hours === 'over_8')
  )
}

function hasAnyPainContext(
  ctx: CoachAnalysisContext,
  record: MemberBodyRecord | null,
): boolean {
  return Boolean(
    (record && hasPainSignal(record)) ||
      ctx.painPattern.repeatCount >= 2 ||
      ctx.painPattern.warningLabel,
  )
}

function isProteinBelowHalf(record: MemberBodyRecord): boolean {
  const pct = calculateProteinAchievementPercent(
    record.protein_intake_g,
    record.protein_target_g,
  )
  if (pct != null) return pct < 50
  return record.protein_status === 'insufficient'
}

function meetsForcedCaution(ctx: CoachAnalysisContext, r: MemberBodyRecord | null): boolean {
  if (ctx.fatiguePattern.forcesCaution) return true
  if (ctx.painPattern.forcesCaution) return true
  if (!r) return false
  if (r.sleep_hours === 'under_6') return true
  if (r.condition === 'bad') return true
  if (r.muscle_soreness === 'severe') return true
  if (r.meal_status === 'poor') return true
  return false
}

function meetsForcedRecovery(ctx: CoachAnalysisContext, r: MemberBodyRecord | null): boolean {
  if (ctx.fatiguePattern.forcesRecovery) return true
  if (ctx.painPattern.forcesRecovery) return true
  if (!r) return false
  const fatigueHigh = r.fatigue === 'high'
  if (fatigueHigh && r.sleep_hours === 'under_6') return true
  if (fatigueHigh && r.condition === 'bad') return true
  if (fatigueHigh && r.muscle_soreness === 'severe') return true
  if (hasPainSignal(r) && r.muscle_soreness === 'severe') return true
  if (r.meal_status === 'poor' && isProteinBelowHalf(r)) return true
  if (
    ctx.weightAssessment.direction === 'down' &&
    (ctx.weightAssessment.pct ?? 0) >= 3 &&
    !ctx.weightAssessment.referenceOnly &&
    !ctx.weightAssessment.suspiciousJump &&
    (r.meal_status === 'poor' || fatigueHigh)
  ) {
    return true
  }
  return false
}

function determineCoachStatus(ctx: CoachAnalysisContext): CoachCheckStatus {
  if (ctx.noRecords || ctx.insufficientWellness) return 'insufficient_records'

  const r = recordForSignal(ctx)
  let status = statusFromScore(ctx.blendedTrainingScore)

  status = maxStatus(status, ctx.fatiguePattern.minStatus)
  status = maxStatus(status, ctx.painPattern.minStatus)

  if (meetsForcedCaution(ctx, r)) {
    status = maxStatus(status, 'caution')
  }
  if (meetsForcedRecovery(ctx, r)) {
    status = maxStatus(status, 'recovery')
  }

  if (ctx.fatiguePattern.trendDelta !== 0) {
    const painFloor: CoachCheckStatus = hasAnyPainContext(ctx, r) ? 'watch' : 'stable'
    status = adjustCoachStatus(status, ctx.fatiguePattern.trendDelta, painFloor)
  }

  if (r && !ctx.painPattern.forcesRecovery && !ctx.fatiguePattern.forcesRecovery) {
    const todayNeedsRecovery =
      r.fatigue === 'high' &&
      (r.sleep_hours === 'under_6' ||
        r.condition === 'bad' ||
        r.muscle_soreness === 'severe')
    const improvingFlow =
      ctx.fatiguePattern.trend === 'recovery' || isLatestRecordFavorable(r)

    if (!todayNeedsRecovery && improvingFlow) {
      if (ctx.painPattern.forcesCaution) {
        status = capStatus(status, 'caution')
      } else if (ctx.painPattern.repeatCount >= 2) {
        status = capStatus(status, 'watch')
      } else {
        status = capStatus(status, 'watch')
      }
    }
  }

  return status
}

function limitList(items: string[], max: number): string[] {
  return items.slice(0, max)
}

type PrioritizedLabel = { priority: number; label: string }

function buildWarningSignals(ctx: CoachAnalysisContext): string[] {
  const r = recordForSignal(ctx)
  const candidates: PrioritizedLabel[] = []
  const fp = ctx.fatiguePattern
  const pain = ctx.painPattern

  if (pain.warningLabel) {
    candidates.push({ priority: 1, label: pain.warningLabel })
  } else if (r && hasPainSignal(r)) {
    candidates.push({
      priority: 1,
      label: `${formatPainAreaLabel(r.pain_area!, r.pain_area_note)} 통증 기록`,
    })
  }

  if (fp.warningLabel && (fp.showAsRepeatPattern || fp.latestIsHigh)) {
    candidates.push({ priority: 2, label: fp.warningLabel })
  }

  if (r) {
    if (r.sleep_hours === 'under_6') {
      candidates.push({ priority: 3, label: '수면 6시간 이하' })
    }
    if (r.condition === 'bad') {
      candidates.push({ priority: 4, label: '컨디션 나쁨' })
    }
    if (r.muscle_soreness === 'severe') {
      candidates.push({ priority: 5, label: '근육통 심함' })
    }
    if (r.meal_status === 'poor') {
      candidates.push({ priority: 6, label: '식사 부족' })
    }
  }

  return limitList(
    candidates
      .sort((a, b) => a.priority - b.priority)
      .map((item) => item.label),
    COACH_MAX_WARNING_SIGNALS,
  )
}

function buildPositiveFlows(ctx: CoachAnalysisContext): string[] {
  const flows: string[] = []
  if (ctx.fatiguePattern.positiveFlowLabel) {
    flows.push(ctx.fatiguePattern.positiveFlowLabel)
  }
  return flows
}

function buildRecordCheckNotes(ctx: CoachAnalysisContext): string[] {
  const notes: string[] = []
  const weight = ctx.weightAssessment

  if (weight.recordCheckLabel) {
    notes.push(weight.recordCheckLabel)
  }
  if (weight.referenceNote) {
    notes.push(weight.referenceNote)
  }
  if (weight.referenceLabel && !weight.suspiciousJump) {
    notes.push(weight.referenceLabel)
  }
  if (weight.warningLabel && !weight.suspiciousJump && !weight.needsRecordCheck) {
    notes.push(`참고 · ${weight.warningLabel}`)
  }

  return limitList(notes, 3)
}

function buildRecoveryPoints(ctx: CoachAnalysisContext): string[] {
  const r = recordForSignal(ctx)
  if (!r) return []

  const recovery = scoreRecoveryRecord(r, ctx.supplementConfig)
  const candidates: PrioritizedLabel[] = []

  if (recovery.proteinNeedsRecord) {
    candidates.push({ priority: 1, label: '단백질 기록 필요' })
  } else if (recovery.protein >= 1) {
    candidates.push({ priority: 1, label: '단백질 부족' })
  }

  if (r.hydration_status === 'insufficient') {
    candidates.push({ priority: 2, label: '수분 섭취 부족' })
  } else if (r.hydration_status === 'normal') {
    candidates.push({ priority: 2, label: '수분 섭취 보통' })
  }

  if (r.post_workout_meal_status === 'missed') {
    candidates.push({ priority: 3, label: POST_WORKOUT_RECOVERY_LABEL })
  }

  if (recovery.supplement > 0) {
    candidates.push({ priority: 4, label: '영양제 복용 누락' })
  }

  return limitList(
    candidates
      .sort((a, b) => a.priority - b.priority)
      .map((item) => item.label),
    COACH_MAX_RECOVERY_POINTS,
  )
}

function hasFatigueAccumulation(ctx: CoachAnalysisContext): boolean {
  const fp = ctx.fatiguePattern
  return (
    fp.trend === 'accumulation' &&
    fp.latestIsHigh &&
    (fp.consecutiveHigh >= 2 || fp.highInRecent3 >= 2)
  )
}

function buildCoachRecommendation(
  ctx: CoachAnalysisContext,
  status: CoachCheckStatus,
  warningSignals: string[],
  recoveryPoints: string[],
): string {
  if (status === 'insufficient_records') {
    return '키·몸무게와 컨디션·수면·피로 상태를 기록하면 더 정확한 코치 체크를 받을 수 있습니다.'
  }

  const sentences: string[] = []
  const r = recordForSignal(ctx)
  const hasPainRepeat = warningSignals.some((s) => s.includes('통증 반복'))
  const hasPain = warningSignals.some((s) => s.includes('통증'))
  const hasHydrationRecovery = recoveryPoints.some((s) => s.includes('수분'))
  const hasPostWorkoutRecovery = recoveryPoints.some((s) => s.includes('회복식'))
  const fatigueAccumulation = hasFatigueAccumulation(ctx)
  const fatigueRecovering = ctx.fatiguePattern.trend === 'recovery'

  if (fatigueAccumulation) {
    sentences.push(
      '최근 피로 누적 가능성이 있습니다. 오늘은 고강도 반복주나 전력 질주보다 워밍업 반응을 먼저 확인하고, 움직임이 무겁다면 훈련량을 20~30% 줄여주세요.',
    )
  } else if (hasPainRepeat) {
    const area =
      ctx.painPattern.repeatedArea != null
        ? formatPainAreaLabel(ctx.painPattern.repeatedArea, null)
        : '해당 부위'
    sentences.push(
      `오늘은 훈련 전 ${area} 상태와 워밍업 반응을 확인하세요. 통증이 없거나 가벼우면 예정된 훈련을 진행하되, 점프·스프린트·급가속 동작은 반응을 보며 조절하세요.`,
    )
  } else if (fatigueRecovering && status === 'watch') {
    sentences.push(
      '피로는 회복 흐름입니다. 오늘은 워밍업 반응을 확인하고 예정된 훈련을 진행해도 좋습니다.',
    )
  } else {
    switch (status) {
      case 'stable':
        sentences.push(
          '예정된 훈련을 진행해도 좋습니다. 수면과 식사 패턴을 꾸준히 유지해주세요.',
        )
        break
      case 'watch':
        sentences.push(
          '워밍업 반응을 확인하고, 후반부 피로에 따라 강도를 조절하세요.',
        )
        break
      case 'caution':
        if (hasPain) {
          sentences.push(
            '오늘은 고강도 훈련 전 워밍업 반응을 확인하고, 통증이 지속되면 점프·스프린트·반복주 강도를 낮춰주세요.',
          )
        } else {
          sentences.push(
            '오늘은 고강도 훈련보다 회복 조깅, 보강, 스트레칭 중심으로 조절하세요.',
          )
        }
        break
      case 'recovery':
        sentences.push(
          '오늘은 고강도 훈련보다 회복 조깅, 보강, 스트레칭 중심으로 조절하세요.',
        )
        if (hasPain && r && hasPainSignal(r)) {
          const area = formatPainAreaLabel(r.pain_area!, r.pain_area_note)
          sentences.push(
            `${area} 통증이 이어지면 점프·스프린트·반복주 강도를 낮추고 워밍업 반응을 꼭 확인해주세요.`,
          )
        }
        break
    }
  }

  if (hasPostWorkoutRecovery || hasHydrationRecovery) {
    sentences.push('훈련 후에는 수분과 회복식을 함께 챙겨주세요.')
  } else if (recoveryPoints.some((p) => p.includes('단백질'))) {
    sentences.push(
      fatigueAccumulation
        ? '훈련 후에는 수분과 탄수화물, 단백질을 함께 챙겨 회복 상태를 확인해주세요.'
        : '훈련 후에는 탄수화물과 단백질을 함께 챙겨 회복 상태를 확인해주세요.',
    )
  } else if (fatigueAccumulation) {
    sentences.push(
      '훈련 후에는 수분과 탄수화물, 단백질을 함께 챙겨 회복 상태를 확인해주세요.',
    )
  }

  return sentences.slice(0, 3).join(' ')
}

/** 코치·부모님 안내 리포트 — 오늘·최근 기록 중심 */
export function buildCoachCheckReport(
  records: MemberBodyRecord[],
  referenceDate: string = format(new Date(), 'yyyy-MM-dd'),
): CoachCheckReport {
  const ctx = buildCoachAnalysisContext(records, referenceDate)
  const overallStatus = determineCoachStatus(ctx)

  if (overallStatus === 'insufficient_records') {
    return {
      overallStatus,
      warningSignals: [],
      recoveryPoints: [],
      positiveFlows: [],
      recordCheckNotes: [],
      recommendation: buildCoachRecommendation(ctx, overallStatus, [], []),
      historyNote: buildRecordHistoryNote(records, referenceDate),
    }
  }

  const warningSignals = buildWarningSignals(ctx)
  const recoveryPoints = buildRecoveryPoints(ctx)
  const positiveFlows = buildPositiveFlows(ctx)
  const recordCheckNotes = buildRecordCheckNotes(ctx)

  return {
    overallStatus,
    warningSignals:
      warningSignals.length > 0
        ? warningSignals
        : overallStatus === 'stable'
          ? ['특이 주의 신호 없음']
          : [],
    recoveryPoints,
    positiveFlows,
    recordCheckNotes,
    recommendation: buildCoachRecommendation(
      ctx,
      overallStatus,
      warningSignals,
      recoveryPoints,
    ),
    historyNote: buildRecordHistoryNote(records, referenceDate),
  }
}

/** @deprecated buildCoachCheckReport 사용 */
export function coachCheckToneClasses(
  tone: 'good' | 'caution' | 'bad' | 'default' | undefined,
): string {
  switch (tone) {
    case 'good':
      return coachCheckStatusClasses('stable')
    case 'caution':
      return coachCheckStatusClasses('watch')
    case 'bad':
      return coachCheckStatusClasses('recovery')
    default:
      return 'border-border/60 bg-background/40 text-foreground/90'
  }
}

const CONDITION_SCORE: Record<BodyCondition, number> = {
  good: 3,
  normal: 2,
  bad: 1,
}

const SLEEP_SCORE: Record<SleepHours, number> = {
  under_6: 1,
  '6_7': 2,
  '7_8': 3,
  over_8: 4,
}

const SORENESS_SCORE: Record<MuscleSoreness, number> = {
  none: 3,
  mild: 2,
  severe: 1,
}

export function buildConditionChartPoints(
  records: MemberBodyRecord[],
  labelForDate: (date: string) => string,
) {
  return records.flatMap((record) => {
    if (!record.condition || record.id.startsWith('bootstrap-')) return []
    return [
      {
        date: record.recorded_at,
        label: labelForDate(record.recorded_at),
        value: CONDITION_SCORE[record.condition],
      },
    ]
  })
}

export function buildSleepChartPoints(
  records: MemberBodyRecord[],
  labelForDate: (date: string) => string,
) {
  return records.flatMap((record) => {
    if (!record.sleep_hours || record.id.startsWith('bootstrap-')) return []
    return [
      {
        date: record.recorded_at,
        label: labelForDate(record.recorded_at),
        value: SLEEP_SCORE[record.sleep_hours],
      },
    ]
  })
}

function painRecordChartScore(record: MemberBodyRecord): number | null {
  const scores: number[] = []

  if (record.muscle_soreness) {
    scores.push(SORENESS_SCORE[record.muscle_soreness])
  }

  if (record.pain_area && record.pain_area !== 'none') {
    scores.push(
      record.pain_level != null
        ? painLevelToChartScore(record.pain_level)
        : 2,
    )
  }

  if (scores.length === 0) return null
  return Math.min(...scores)
}

export function buildPainChartPoints(
  records: MemberBodyRecord[],
  labelForDate: (date: string) => string,
) {
  return records.flatMap((record) => {
    if (record.id.startsWith('bootstrap-')) return []
    const score = painRecordChartScore(record)
    if (score == null) return []
    return [
      {
        date: record.recorded_at,
        label: labelForDate(record.recorded_at),
        value: score,
      },
    ]
  })
}

export function chartTabAvailability(records: MemberBodyRecord[]) {
  const real = records.filter((r) => !r.id.startsWith('bootstrap-'))
  return {
    weight: real.length > 0,
    bmi: real.length > 0,
    condition: real.some((r) => r.condition),
    sleep: real.some((r) => r.sleep_hours),
    pain: real.some(
      (r) =>
        (r.pain_area && r.pain_area !== 'none') ||
        (r.muscle_soreness && r.muscle_soreness !== 'none'),
    ),
    records: true,
  }
}
