import {
  calculateProteinAchievementPercent,
  calculateProteinTarget,
  deriveProteinStatus,
  normalizeProteinIntakeBySlot,
  proteinStatusLabel,
  resolveProteinMultiplier,
  sumProteinIntakeBySlot,
  type MemberProteinSettings,
} from '@/lib/member-body-protein'
import type { ProteinIntakeBySlot } from '@/lib/member-body-protein-types'
import type { ProteinIntakeBySlot } from '@/lib/member-body-protein-types'
import { wellnessToneClasses } from '@/lib/member-body-wellness'

export type ProteinStatus = 'sufficient' | 'normal' | 'insufficient'
export type PostWorkoutMealStatus = 'done' | 'normal' | 'missed'
export type HydrationStatus = 'sufficient' | 'normal' | 'insufficient'
export type SupplementItemStatus = 'taken' | 'missed' | 'not_applicable'

export type SupplementId =
  | 'multivitamin'
  | 'omega3'
  | 'magnesium'
  | 'iron'

export type SupplementStatusMap = Partial<Record<SupplementId, SupplementItemStatus>>

export type MemberBodyRecordNutrition = {
  protein_status: ProteinStatus | null
  protein_target_g: number | null
  protein_intake_g: number | null
  protein_intake_by_slot: ProteinIntakeBySlot | null
  protein_goal_multiplier: number | null
  post_workout_meal_status: PostWorkoutMealStatus | null
  hydration_status: HydrationStatus | null
  supplement_status: SupplementStatusMap | null
  nutrition_note: string | null
}

export type BodyNutritionInput = {
  protein_status?: ProteinStatus | null
  protein_target_g?: number | null
  protein_intake_g?: number | null
  protein_intake_by_slot?: ProteinIntakeBySlot | null
  protein_goal_multiplier?: number | null
  post_workout_meal_status?: PostWorkoutMealStatus | null
  hydration_status?: HydrationStatus | null
  supplement_status?: SupplementStatusMap | null
  nutrition_note?: string | null
}

export const EMPTY_BODY_NUTRITION: MemberBodyRecordNutrition = {
  protein_status: null,
  protein_target_g: null,
  protein_intake_g: null,
  protein_intake_by_slot: null,
  protein_goal_multiplier: null,
  post_workout_meal_status: null,
  hydration_status: null,
  supplement_status: null,
  nutrition_note: null,
}

function parseProteinGrams(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed)
}

function parseProteinMultiplier(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Number(parsed.toFixed(2))
}

export function buildProteinNutritionFields(
  input: {
    protein_intake_g?: number | null
    protein_intake_by_slot?: ProteinIntakeBySlot | null
    protein_target_g?: number | null
    protein_goal_multiplier?: number | null
    protein_status?: ProteinStatus | null
  },
  weightKg?: number | null,
  settings?: Partial<MemberProteinSettings>,
): Pick<
  MemberBodyRecordNutrition,
  | 'protein_target_g'
  | 'protein_intake_g'
  | 'protein_intake_by_slot'
  | 'protein_goal_multiplier'
  | 'protein_status'
> {
  const multiplier =
    parseProteinMultiplier(input.protein_goal_multiplier) ??
    resolveProteinMultiplier(settings)
  const bySlot = normalizeProteinIntakeBySlot(input.protein_intake_by_slot)
  const slotTotal = sumProteinIntakeBySlot(bySlot)
  const intake =
    slotTotal > 0 ? slotTotal : parseProteinGrams(input.protein_intake_g)
  const target =
    parseProteinGrams(input.protein_target_g) ??
    calculateProteinTarget(weightKg, multiplier)

  const status =
    input.protein_status && !intake
      ? input.protein_status
      : deriveProteinStatus(intake, target)

  if (intake == null) {
    return {
      protein_target_g: null,
      protein_intake_g: null,
      protein_intake_by_slot: null,
      protein_goal_multiplier: null,
      protein_status: null,
    }
  }

  return {
    protein_target_g: target,
    protein_intake_g: intake,
    protein_intake_by_slot: Object.keys(bySlot).length > 0 ? bySlot : null,
    protein_goal_multiplier: multiplier,
    protein_status: status,
  }
}

export type NutritionChoice<T extends string> = { value: T; label: string }

export const PROTEIN_STATUS_CHOICES: NutritionChoice<ProteinStatus>[] = [
  { value: 'sufficient', label: '충분' },
  { value: 'normal', label: '보통' },
  { value: 'insufficient', label: '부족' },
]

export const POST_WORKOUT_MEAL_CHOICES: NutritionChoice<PostWorkoutMealStatus>[] = [
  { value: 'done', label: '챙김' },
  { value: 'normal', label: '보통' },
  { value: 'missed', label: '못 챙김' },
]

export const HYDRATION_STATUS_CHOICES: NutritionChoice<HydrationStatus>[] = [
  { value: 'sufficient', label: '충분' },
  { value: 'normal', label: '보통' },
  { value: 'insufficient', label: '부족' },
]

export const SUPPLEMENT_ITEM_CHOICES: NutritionChoice<SupplementItemStatus>[] = [
  { value: 'taken', label: '복용' },
  { value: 'missed', label: '미복용' },
  { value: 'not_applicable', label: '해당 없음' },
]

/** 선수별 관리 설정용 — 추후 멤버 설정에서 enabled/required 변경 */
export type SupplementItemConfig = {
  id: SupplementId
  label: string
  defaultEnabled: boolean
  required: boolean
}

export const SUPPLEMENT_ITEM_DEFINITIONS: SupplementItemConfig[] = [
  { id: 'multivitamin', label: '멀티비타민', defaultEnabled: true, required: false },
  { id: 'omega3', label: '오메가3', defaultEnabled: false, required: false },
  { id: 'magnesium', label: '마그네슘', defaultEnabled: false, required: false },
  { id: 'iron', label: '철분', defaultEnabled: false, required: false },
]

export type MemberSupplementConfig = {
  items: SupplementItemConfig[]
}

export function getDefaultSupplementConfig(): MemberSupplementConfig {
  return { items: [...SUPPLEMENT_ITEM_DEFINITIONS] }
}

export function getVisibleSupplementItems(
  config: MemberSupplementConfig = getDefaultSupplementConfig(),
): SupplementItemConfig[] {
  return config.items.filter((item) => item.defaultEnabled)
}

export type NutritionFieldCategory =
  | 'protein_status'
  | 'post_workout_meal_status'
  | 'hydration_status'
  | 'supplement_item'

const NUTRITION_LABEL_MAP: Record<string, string> = {
  sufficient: '충분',
  normal: '보통',
  insufficient: '부족',
  done: '챙김',
  missed: '못 챙김',
  taken: '복용',
  not_applicable: '해당 없음',
}

export function nutritionValueLabel(value: string | null | undefined): string {
  if (!value) return ''
  return NUTRITION_LABEL_MAP[value] ?? value
}

export function nutritionChoiceLabel(
  category: NutritionFieldCategory,
  value: string | null | undefined,
  supplementLabel?: string,
): string {
  if (!value) return ''
  if (category === 'supplement_item' && supplementLabel) {
    return `${supplementLabel} ${nutritionValueLabel(value)}`
  }
  const choiceMap: Record<
    Exclude<NutritionFieldCategory, 'supplement_item'>,
    NutritionChoice<string>[]
  > = {
    protein_status: PROTEIN_STATUS_CHOICES,
    post_workout_meal_status: POST_WORKOUT_MEAL_CHOICES,
    hydration_status: HYDRATION_STATUS_CHOICES,
  }
  if (category === 'supplement_item') return nutritionValueLabel(value)
  const choice = choiceMap[category].find((item) => item.value === value)
  return choice?.label ?? nutritionValueLabel(value)
}

export function getNutritionChoiceTone(
  category: NutritionFieldCategory,
  value: string | null | undefined,
  options?: { required?: boolean },
): WellnessTone | null {
  if (!value) return null

  if (category === 'supplement_item') {
    const status = value as SupplementItemStatus
    if (status === 'taken') return 'good'
    if (status === 'not_applicable') return 'neutral'
    if (status === 'missed') return options?.required ? 'bad' : 'neutral'
    return null
  }

  const goodValues = new Set(['sufficient', 'done', 'taken'])
  const cautionValues = new Set(['normal'])
  const badValues = new Set(['insufficient', 'missed'])

  if (goodValues.has(value)) return 'good'
  if (cautionValues.has(value)) return 'caution'
  if (badValues.has(value)) return 'bad'
  return null
}

export function nutritionToneClasses(tone: WellnessTone): string {
  if (tone === 'neutral') {
    return 'bg-muted/20 border-border/70 text-foreground/55'
  }
  return wellnessToneClasses(tone)
}

function isNutritionChoice<T extends string>(
  value: unknown,
  choices: NutritionChoice<T>[],
): value is T {
  return typeof value === 'string' && choices.some((choice) => choice.value === value)
}

function parseSupplementStatus(value: unknown): SupplementStatusMap | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const result: SupplementStatusMap = {}
  for (const def of SUPPLEMENT_ITEM_DEFINITIONS) {
    const raw = (value as Record<string, unknown>)[def.id]
    if (isNutritionChoice(raw, SUPPLEMENT_ITEM_CHOICES)) {
      result[def.id] = raw
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

export function normalizeNutritionInput(
  input?: BodyNutritionInput,
  options?: { weightKg?: number | null; proteinSettings?: Partial<MemberProteinSettings> },
): MemberBodyRecordNutrition {
  if (!input) return { ...EMPTY_BODY_NUTRITION }

  const protein = buildProteinNutritionFields(
    {
      protein_intake_g: input.protein_intake_g,
      protein_intake_by_slot: input.protein_intake_by_slot,
      protein_target_g: input.protein_target_g,
      protein_goal_multiplier: input.protein_goal_multiplier,
      protein_status: isNutritionChoice(input.protein_status, PROTEIN_STATUS_CHOICES)
        ? input.protein_status
        : null,
    },
    options?.weightKg,
    options?.proteinSettings,
  )

  return {
    ...protein,
    post_workout_meal_status: isNutritionChoice(
      input.post_workout_meal_status,
      POST_WORKOUT_MEAL_CHOICES,
    )
      ? input.post_workout_meal_status
      : null,
    hydration_status: isNutritionChoice(input.hydration_status, HYDRATION_STATUS_CHOICES)
      ? input.hydration_status
      : null,
    supplement_status: parseSupplementStatus(input.supplement_status),
    nutrition_note:
      typeof input.nutrition_note === 'string' && input.nutrition_note.trim()
        ? input.nutrition_note.trim()
        : null,
  }
}

export function hasProteinRecordData(
  nutrition: Partial<MemberBodyRecordNutrition>,
): boolean {
  return nutrition.protein_intake_g != null || nutrition.protein_status != null
}

export function hasNutritionData(
  nutrition: Partial<MemberBodyRecordNutrition>,
): boolean {
  return Boolean(
    hasProteinRecordData(nutrition) ||
      nutrition.post_workout_meal_status ||
      nutrition.hydration_status ||
      (nutrition.supplement_status &&
        Object.keys(nutrition.supplement_status).length > 0),
  )
}

export function buildNutritionHistoryBadges(
  nutrition: Partial<MemberBodyRecordNutrition>,
  config: MemberSupplementConfig = getDefaultSupplementConfig(),
): WellnessHistoryBadge[] {
  const badges: WellnessHistoryBadge[] = []

  if (
    nutrition.protein_intake_g != null &&
    nutrition.protein_target_g != null &&
    nutrition.protein_status
  ) {
    badges.push({
      label: `단백질 ${Math.round(nutrition.protein_intake_g)}/${Math.round(nutrition.protein_target_g)}g ${proteinStatusLabel(nutrition.protein_status)}`,
      tone: getNutritionChoiceTone('protein_status', nutrition.protein_status)!,
    })
  } else if (nutrition.protein_status) {
    badges.push({
      label: `단백질 ${nutritionChoiceLabel('protein_status', nutrition.protein_status)}`,
      tone: getNutritionChoiceTone('protein_status', nutrition.protein_status)!,
    })
  } else if (
    !hasProteinRecordData(nutrition) &&
    Boolean(
      nutrition.post_workout_meal_status ||
        nutrition.hydration_status ||
        (nutrition.supplement_status && Object.keys(nutrition.supplement_status).length > 0),
    )
  ) {
    badges.push({
      label: '단백질 기록 필요',
      tone: 'neutral',
    })
  }
  if (nutrition.post_workout_meal_status) {
    badges.push({
      label: `회복식 ${nutritionChoiceLabel('post_workout_meal_status', nutrition.post_workout_meal_status)}`,
      tone: getNutritionChoiceTone(
        'post_workout_meal_status',
        nutrition.post_workout_meal_status,
      )!,
    })
  }
  if (nutrition.hydration_status) {
    badges.push({
      label: `수분 ${nutritionChoiceLabel('hydration_status', nutrition.hydration_status)}`,
      tone: getNutritionChoiceTone('hydration_status', nutrition.hydration_status)!,
    })
  }

  const visibleItems = getVisibleSupplementItems(config)
  for (const item of visibleItems) {
    const status = nutrition.supplement_status?.[item.id]
    if (!status) continue
    badges.push({
      label: nutritionChoiceLabel('supplement_item', status, item.label),
      tone: getNutritionChoiceTone('supplement_item', status, {
        required: item.required,
      })!,
    })
  }

  return badges
}

export type NutritionCoachHint = {
  message: string
  priority: number
}

/** 코치 멘트용 영양 우선순위 메시지 (낮을수록 우선) */
export function buildNutritionCoachHints(
  nutrition: Partial<MemberBodyRecordNutrition>,
  wellness?: { meal_status?: string | null; fatigue?: string | null },
  config: MemberSupplementConfig = getDefaultSupplementConfig(),
): NutritionCoachHint[] {
  const hints: NutritionCoachHint[] = []

  if (wellness?.meal_status === 'poor' && wellness.fatigue === 'high') {
    hints.push({
      priority: 4,
      message:
        '식사 부족과 피로도 상승이 함께 기록되었습니다. 오늘은 고강도 훈련보다 회복 상태를 먼저 확인하고, 훈련 후 식사 보완이 필요합니다.',
    })
  }

  const proteinPercent = calculateProteinAchievementPercent(
    nutrition.protein_intake_g,
    nutrition.protein_target_g,
  )

  if (nutrition.protein_status === 'sufficient') {
    hints.push({
      priority: 5,
      message:
        '오늘 단백질 섭취가 목표에 가깝게 기록되었습니다. 현재 식사 패턴을 유지하면서 수면과 수분 섭취도 함께 관리해주세요.',
    })
  } else if (nutrition.protein_status === 'normal') {
    hints.push({
      priority: 5,
      message:
        '단백질 섭취가 목표보다 조금 부족합니다. 훈련 후 식사에서 단백질 식품을 한 번 더 챙기면 회복 관리에 도움이 됩니다.',
    })
  } else if (nutrition.protein_status === 'insufficient') {
    if (wellness?.meal_status === 'poor') {
      hints.push({
        priority: 4,
        message:
          '전체 식사량과 단백질 섭취가 모두 부족합니다. 성장기 선수는 무리한 감량보다 충분한 식사와 회복이 우선입니다.',
      })
    } else if (wellness?.fatigue === 'high') {
      hints.push({
        priority: 4,
        message:
          '단백질 섭취 부족과 피로도 상승이 함께 기록되었습니다. 오늘은 고강도 훈련 후 회복식을 꼭 챙기고, 피로가 지속되면 훈련 강도 조절이 필요합니다.',
      })
    } else {
      hints.push({
        priority: 5,
        message:
          proteinPercent != null
            ? `오늘 단백질 섭취가 목표 대비 ${proteinPercent}%로 부족합니다. 훈련 후 회복을 위해 계란, 고기, 생선, 두부, 우유류 같은 단백질 식품을 함께 챙겨주세요.`
            : '오늘 단백질 섭취가 목표 대비 부족합니다. 훈련 후 회복을 위해 계란, 고기, 생선, 두부, 우유류 같은 단백질 식품을 함께 챙겨주세요.',
      })
    }
  }

  if (nutrition.post_workout_meal_status === 'missed') {
    hints.push({
      priority: 5,
      message:
        '운동 후 회복식 기록이 부족합니다. 훈련량이 많은 날에는 운동 후 식사나 간식을 통해 회복 상태를 확인해주세요.',
    })
  }

  if (nutrition.hydration_status === 'insufficient') {
    hints.push({
      priority: 6,
      message:
        '수분 섭취가 부족으로 기록되었습니다. 훈련 전후 물 섭취 상태를 확인해주세요.',
    })
  }

  const visibleItems = getVisibleSupplementItems(config)
  const missedRequired = visibleItems.filter(
    (item) =>
      item.required && nutrition.supplement_status?.[item.id] === 'missed',
  )
  if (missedRequired.length > 0) {
    hints.push({
      priority: 7,
      message:
        '설정된 영양제 복용 기록이 누락되었습니다. 꾸준한 관리가 필요한 항목이라면 보호자와 함께 복용 여부를 확인해주세요.',
    })
  }

  return hints.sort((a, b) => a.priority - b.priority)
}
