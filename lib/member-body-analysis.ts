import { format, parseISO, subDays } from 'date-fns'
import type { MemberBodyRecord } from '@/lib/actions/member-body-records'
import type { BodyPeriodRange } from '@/lib/member-body-period-settings'
import {
  buildNutritionCoachHints,
  getDefaultSupplementConfig,
  nutritionChoiceLabel,
  type MemberSupplementConfig,
} from '@/lib/member-body-nutrition'
import {
  hasConditionData,
  wellnessChoiceLabel,
  wellnessValueLabel,
  type BodyCondition,
  type MuscleSoreness,
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

/** 최근 체중 변화 부가 설명 */
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

  const label = wellnessValueLabel(latestWithCondition.condition)
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

export type CoachCheckBox = {
  title: string
  text: string
  status: CoachCheckStatus
}

export type CoachCheckReport = {
  boxes: CoachCheckBox[]
  overallStatus: CoachCheckStatus
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

function isAdequateSleep(sleep: SleepHours | null | undefined): boolean {
  return sleep === '7_8' || sleep === 'over_8'
}

function computeWeightChange(
  records14d: MemberBodyRecord[],
): { pct: number | null; direction: 'up' | 'down' | 'flat' } {
  if (records14d.length < 2) return { pct: null, direction: 'flat' }
  const first = records14d[0].weight_kg
  const last = records14d[records14d.length - 1].weight_kg
  if (!first) return { pct: null, direction: 'flat' }
  const delta = last - first
  const pct = Math.abs((delta / first) * 100)
  return {
    pct: Number(pct.toFixed(1)),
    direction: delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat',
  }
}

function weightTrendLevel(pct: number | null): 'stable' | 'watch' | 'caution' | 'severe' {
  if (pct == null) return 'stable'
  if (pct < 1) return 'stable'
  if (pct < 2) return 'watch'
  if (pct < 3) return 'caution'
  return 'severe'
}

type CoachAnalysisContext = {
  todayRecord: MemberBodyRecord | null
  primaryRecord: MemberBodyRecord | null
  recent3: MemberBodyRecord[]
  records14d: MemberBodyRecord[]
  weightChangePct: number | null
  weightDirection: 'up' | 'down' | 'flat'
  weightTrend: 'stable' | 'watch' | 'caution' | 'severe'
  insufficientWellness: boolean
  noRecords: boolean
  supplementConfig: MemberSupplementConfig
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
  const { pct, direction } = computeWeightChange(records14d)
  const primaryRecord = todayRecord ?? recent3.at(-1) ?? null

  const recentWellnessCount = recent3.filter((record) => hasConditionData(record)).length
  const insufficientWellness =
    realRecords.length > 0 &&
    (recentWellnessCount < 2 ||
      (!todayRecord && !recent3.some((record) => hasConditionData(record))))

  return {
    todayRecord,
    primaryRecord,
    recent3,
    records14d,
    weightChangePct: pct,
    weightDirection: direction,
    weightTrend: weightTrendLevel(pct),
    insufficientWellness,
    noRecords: realRecords.length === 0,
    supplementConfig: getDefaultSupplementConfig(),
  }
}

function countInRecent3(
  recent3: MemberBodyRecord[],
  predicate: (record: MemberBodyRecord) => boolean,
): number {
  return recent3.filter(predicate).length
}

function recordForSignal(
  ctx: CoachAnalysisContext,
): MemberBodyRecord | null {
  return ctx.todayRecord ?? ctx.primaryRecord
}

function hasRecoverySignals(ctx: CoachAnalysisContext): boolean {
  const r = recordForSignal(ctx)
  const badConditionCount = countInRecent3(ctx.recent3, (rec) => rec.condition === 'bad')
  const highFatigueCount = countInRecent3(ctx.recent3, (rec) => rec.fatigue === 'high')

  if (badConditionCount >= 2 || highFatigueCount >= 2) return true

  if (r) {
    if (r.meal_status === 'poor' && r.fatigue === 'high') return true
    if (r.sleep_hours === 'under_6' && r.fatigue === 'high') return true
    if (r.condition === 'bad' && r.fatigue === 'high') return true
    if (hasPainSignal(r) && r.muscle_soreness === 'severe') return true
    if (
      r.meal_status === 'poor' &&
      ctx.weightDirection === 'down' &&
      (ctx.weightChangePct ?? 0) >= 2
    ) {
      return true
    }
    if (
      (ctx.weightChangePct ?? 0) >= 3 &&
      (r.condition === 'bad' || r.fatigue === 'high' || r.meal_status === 'poor')
    ) {
      return true
    }
  }

  return false
}

function hasCautionSignals(ctx: CoachAnalysisContext): boolean {
  const r = recordForSignal(ctx)
  if (!r) return ctx.weightTrend === 'caution' || ctx.weightTrend === 'severe'

  if (r.condition === 'bad') return true
  if (r.fatigue === 'high') return true
  if (r.muscle_soreness === 'severe') return true
  if (r.meal_status === 'poor') return true
  if (r.protein_status === 'insufficient') return true
  if (r.post_workout_meal_status === 'missed') return true
  if (r.hydration_status === 'insufficient') return true
  if (r.sleep_hours === 'under_6') return true
  if (hasPainSignal(r)) return true
  if (ctx.weightTrend === 'caution' || ctx.weightTrend === 'severe') return true

  const missedRequired = ctx.supplementConfig.items.filter(
    (item) =>
      item.required && r.supplement_status?.[item.id] === 'missed',
  )
  if (missedRequired.length > 0) return true

  return false
}

function hasWatchSignals(ctx: CoachAnalysisContext): boolean {
  const r = recordForSignal(ctx)
  if (!r) return ctx.weightTrend === 'watch'

  if (r.sleep_hours === '6_7') return true
  if (r.fatigue === 'normal') return true
  if (r.condition === 'normal') return true
  if (r.muscle_soreness === 'mild') return true
  if (r.meal_status === 'normal') return true
  if (ctx.weightTrend === 'watch') return true

  return false
}

function isStableState(ctx: CoachAnalysisContext): boolean {
  const r = recordForSignal(ctx)
  if (!r) return ctx.weightTrend === 'stable' && !ctx.insufficientWellness

  const painClear = !hasPainSignal(r) && r.muscle_soreness !== 'severe'
  const fatigueOk = r.fatigue === 'low' || r.fatigue === 'normal' || !r.fatigue
  const conditionOk =
    r.condition === 'good' || r.condition === 'normal' || !r.condition
  const sleepOk = isAdequateSleep(r.sleep_hours) || !r.sleep_hours
  const mealOk =
    r.meal_status === 'good' || r.meal_status === 'normal' || !r.meal_status
  const weightOk = ctx.weightTrend === 'stable'

  return painClear && fatigueOk && conditionOk && sleepOk && mealOk && weightOk
}

function determineCoachStatus(ctx: CoachAnalysisContext): CoachCheckStatus {
  if (ctx.noRecords) return 'insufficient_records'
  if (hasRecoverySignals(ctx)) return 'recovery'
  if (hasCautionSignals(ctx)) return 'caution'
  if (hasWatchSignals(ctx)) return 'watch'
  if (isStableState(ctx) && !ctx.insufficientWellness) return 'stable'
  if (ctx.insufficientWellness) return 'watch'
  return 'watch'
}

function buildSignalSummary(ctx: CoachAnalysisContext): string {
  const r = recordForSignal(ctx)
  if (!r) return ''

  const parts: string[] = []
  if (r.condition) {
    parts.push(`컨디션 ${wellnessChoiceLabel('condition', r.condition)}`)
  }
  if (r.sleep_hours) {
    parts.push(`수면 ${wellnessChoiceLabel('sleep_hours', r.sleep_hours)}`)
  }
  if (r.fatigue) {
    parts.push(`피로 ${wellnessChoiceLabel('fatigue', r.fatigue)}`)
  }
  if (hasPainSignal(r)) {
    parts.push(`통증 ${wellnessChoiceLabel('pain_area', r.pain_area)}`)
  } else if (r.muscle_soreness && r.muscle_soreness !== 'none') {
    parts.push(`근육통 ${wellnessChoiceLabel('muscle_soreness', r.muscle_soreness)}`)
  }
  if (r.meal_status) {
    parts.push(`식사 ${wellnessChoiceLabel('meal_status', r.meal_status)}`)
  }
  if (r.protein_intake_g != null && r.protein_target_g != null && r.protein_status) {
    parts.push(
      `단백질 ${Math.round(r.protein_intake_g)}/${Math.round(r.protein_target_g)}g ${nutritionChoiceLabel('protein_status', r.protein_status)}`,
    )
  } else if (r.protein_status) {
    parts.push(`단백질 ${nutritionChoiceLabel('protein_status', r.protein_status)}`)
  }
  if (r.hydration_status) {
    parts.push(`수분 ${nutritionChoiceLabel('hydration_status', r.hydration_status)}`)
  }
  if (ctx.weightChangePct != null && ctx.records14d.length >= 2) {
    const dir =
      ctx.weightDirection === 'up'
        ? '증가'
        : ctx.weightDirection === 'down'
          ? '감소'
          : '유지'
    parts.push(`최근 14일 체중 ${dir} ${ctx.weightChangePct}%`)
  }

  return parts.join(' · ')
}

function buildTrainingJudgment(
  status: CoachCheckStatus,
  ctx: CoachAnalysisContext,
): CoachCheckBox {
  const summary = buildSignalSummary(ctx)
  const reason = summary ? `(${summary}) ` : ''

  switch (status) {
    case 'stable':
      return {
        title: '오늘 훈련 판단',
        status: 'stable',
        text: `${reason}최근 신체 변화와 컨디션 흐름이 안정적입니다. 예정된 훈련을 진행해도 좋으며, 수면과 식사 패턴을 꾸준히 유지해주세요.`,
      }
    case 'watch':
      return {
        title: '오늘 훈련 판단',
        status: 'watch',
        text: `${reason}큰 문제는 없지만 회복 상태를 함께 확인할 필요가 있습니다. 오늘 훈련 전 워밍업 반응을 확인하고, 후반부 피로 반응에 따라 강도를 조절해주세요.`,
      }
    case 'caution':
      return {
        title: '오늘 훈련 판단',
        status: 'caution',
        text: `${reason}오늘 상태에서 주의 신호가 확인됩니다. 고강도 훈련 전 워밍업 반응을 확인하고, 통증이나 피로가 지속되면 훈련 강도를 낮추는 것을 권장합니다.`,
      }
    case 'recovery':
      return {
        title: '오늘 훈련 판단',
        status: 'recovery',
        text: `${reason}최근 기록에서 회복 부족 신호가 반복되고 있습니다. 오늘은 고강도 훈련보다 회복 조깅, 보강, 스트레칭 중심으로 조절하는 것을 권장합니다.`,
      }
    case 'insufficient_records':
      return {
        title: '오늘 훈련 판단',
        status: 'insufficient_records',
        text: '아직 충분한 기록이 없어 오늘 훈련 강도를 정확히 판단하기 어렵습니다. 키·몸무게와 함께 컨디션·수면·피로 상태를 기록하면 더 정확한 안내를 받을 수 있습니다.',
      }
  }
}

function buildNextActionPoint(
  status: CoachCheckStatus,
  ctx: CoachAnalysisContext,
): CoachCheckBox {
  const r = recordForSignal(ctx)
  if (r && !ctx.insufficientWellness) {
    const nutritionHints = buildNutritionCoachHints(
      r,
      { meal_status: r.meal_status, fatigue: r.fatigue },
      ctx.supplementConfig,
    )
    if (nutritionHints.length > 0) {
      const hint = nutritionHints[0]
      const hintStatus: CoachCheckStatus =
        hint.priority <= 4 ? 'recovery' : hint.priority <= 6 ? 'caution' : 'watch'
      return {
        title: '다음 관리 포인트',
        status: hintStatus,
        text: hint.message,
      }
    }
  }

  if (ctx.insufficientWellness) {
    return {
      title: '다음 관리 포인트',
      status: 'insufficient_records',
      text: '최근 컨디션 기록이 부족합니다. 다음 기록 시 수면, 피로도, 통증, 식사와 회복·영양 체크를 함께 입력하면 선수 상태를 더 정확히 확인할 수 있습니다.',
    }
  }

  switch (status) {
    case 'stable':
      return {
        title: '다음 관리 포인트',
        status: 'stable',
        text: '체중은 경기력과 컨디션을 확인하는 참고 지표입니다. 수면·식사·회복·영양 기록을 꾸준히 남기면 훈련 조절에 도움이 됩니다.',
      }
    case 'watch':
      return {
        title: '다음 관리 포인트',
        status: 'watch',
        text: '훈련 후 피로 반응과 수면 시간을 함께 기록해주세요. 작은 변화도 빠르게 확인할 수 있습니다.',
      }
    case 'caution':
      return {
        title: '다음 관리 포인트',
        status: 'caution',
        text: '통증 부위와 피로도를 매일 기록해 변화를 추적해주세요. 증상이 이어지면 훈련 강도 조절과 회복 시간 확보를 우선해주세요.',
      }
    case 'recovery':
      return {
        title: '다음 관리 포인트',
        status: 'recovery',
        text: '수면 시간 확보와 영양 섭취를 우선해주세요. 체중 변화가 보이더라도 성장·회복·훈련 지속성을 먼저 챙기는 것이 중요합니다.',
      }
    case 'insufficient_records':
      return {
        title: '다음 관리 포인트',
        status: 'insufficient_records',
        text: '오늘 상태 기록에서 수면, 컨디션, 피로도, 통증, 식사와 회복·영양 체크를 버튼으로 빠르게 입력해보세요.',
      }
  }
}

/** 코치·부모님 안내 리포트 — 오늘·최근 기록 중심, 최대 2개 박스 */
export function buildCoachCheckReport(
  records: MemberBodyRecord[],
  referenceDate: string = format(new Date(), 'yyyy-MM-dd'),
): CoachCheckReport {
  const ctx = buildCoachAnalysisContext(records, referenceDate)
  const overallStatus = determineCoachStatus(ctx)

  if (ctx.noRecords) {
    return {
      overallStatus: 'insufficient_records',
      boxes: [
        {
          title: '오늘 훈련 판단',
          status: 'insufficient_records',
          text: '체중·컨디션 기록이 없어 상태 분석이 어렵습니다. 키와 몸무게부터 기록을 시작해주세요.',
        },
        {
          title: '다음 관리 포인트',
          status: 'insufficient_records',
          text: '다음 기록 시 수면, 피로도, 통증, 식사와 회복·영양 체크를 함께 입력하면 선수 상태를 더 정확히 확인할 수 있습니다.',
        },
      ],
    }
  }

  const boxes: CoachCheckBox[] = [
    buildTrainingJudgment(overallStatus, ctx),
    buildNextActionPoint(overallStatus, ctx),
  ]

  return { overallStatus, boxes: boxes.slice(0, 2) }
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

export function buildPainChartPoints(
  records: MemberBodyRecord[],
  labelForDate: (date: string) => string,
) {
  return records.flatMap((record) => {
    if (record.id.startsWith('bootstrap-')) return []
    const score =
      record.muscle_soreness != null
        ? SORENESS_SCORE[record.muscle_soreness]
        : record.pain_area && record.pain_area !== 'none'
          ? 1
          : null
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
