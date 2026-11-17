export const CARB_WEIGHT_MIN_KG = 35
export const CARB_WEIGHT_MAX_KG = 150
export const CARB_WEIGHT_DEFAULT_KG = 74

export const CARB_HEIGHT_MIN_CM = 120
export const CARB_HEIGHT_MAX_CM = 220

export const PROTEIN_G_PER_KG = { min: 1.6, max: 2.2 } as const

export const CARB_STORAGE_KEY = 'onestep-carb-calculator'

export function carbStorageKey(memberId?: string | null) {
  return memberId ? `${CARB_STORAGE_KEY}:${memberId}` : CARB_STORAGE_KEY
}

export const CARB_DISCLAIMER =
  '개인별 스포츠영양 처방이 아닌 교육용 시작 범위입니다. 특히 고강도 및 장거리 훈련에서는 탄수화물 필요량이 더 많을 수 있습니다.'

export const CARB_MEAL_NOTE =
  '배분 비율은 개인별로 조정할 수 있는 예시입니다. 60분 이상 장거리 훈련 중 섭취량은 이 끼니 배분과 별도로 계획하세요.'

export type CarbIntensityId = 'jog' | 'steady' | 'hard'
export type CarbRunTime = 'morning' | 'afternoon' | 'evening'
export type CarbMealPlan = '3' | 'snack'

export type CarbRange = { min: number; max: number }

type IntensityDef = {
  id: CarbIntensityId
  label: string
  normal: CarbRange
  diet: CarbRange
}

export const CARB_INTENSITIES: IntensityDef[] = [
  { id: 'jog', label: '회복 조깅', normal: { min: 3, max: 5 }, diet: { min: 2, max: 3 } },
  { id: 'steady', label: '지속주', normal: { min: 4, max: 6 }, diet: { min: 3, max: 4 } },
  {
    id: 'hard',
    label: '인터벌/템포/장거리',
    normal: { min: 5, max: 7 },
    diet: { min: 4, max: 5 },
  },
]

export const CARB_RUN_TIMES: { id: CarbRunTime; label: string }[] = [
  { id: 'morning', label: '아침' },
  { id: 'afternoon', label: '오후' },
  { id: 'evening', label: '저녁' },
]

export const CARB_MEAL_PLANS: { id: CarbMealPlan; label: string }[] = [
  { id: '3', label: '3끼' },
  { id: 'snack', label: '3끼+간식' },
]

export type CarbMealSlot = {
  id: string
  label: string
  ratio: number
}

const MEAL_SLOTS: Record<CarbMealPlan, Record<CarbRunTime, CarbMealSlot[]>> = {
  '3': {
    morning: [
      { id: 'breakfast', label: '아침', ratio: 40 },
      { id: 'lunch', label: '점심', ratio: 35 },
      { id: 'dinner', label: '저녁', ratio: 25 },
    ],
    afternoon: [
      { id: 'breakfast', label: '아침', ratio: 30 },
      { id: 'lunch', label: '점심', ratio: 40 },
      { id: 'dinner', label: '저녁', ratio: 30 },
    ],
    evening: [
      { id: 'breakfast', label: '아침', ratio: 25 },
      { id: 'lunch', label: '점심', ratio: 30 },
      { id: 'dinner', label: '저녁', ratio: 45 },
    ],
  },
  snack: {
    morning: [
      { id: 'snack', label: '운동 간식', ratio: 20 },
      { id: 'breakfast', label: '아침', ratio: 30 },
      { id: 'lunch', label: '점심', ratio: 30 },
      { id: 'dinner', label: '저녁', ratio: 20 },
    ],
    afternoon: [
      { id: 'breakfast', label: '아침', ratio: 25 },
      { id: 'lunch', label: '점심', ratio: 25 },
      { id: 'snack', label: '운동 간식', ratio: 25 },
      { id: 'dinner', label: '저녁', ratio: 25 },
    ],
    evening: [
      { id: 'breakfast', label: '아침', ratio: 20 },
      { id: 'lunch', label: '점심', ratio: 25 },
      { id: 'dinner', label: '저녁', ratio: 30 },
      { id: 'snack', label: '운동 간식', ratio: 25 },
    ],
  },
}

export type CarbSettings = {
  weightKg: number
  intensity: CarbIntensityId
  diet: boolean
  heightCm: number | null
  runTime: CarbRunTime
  meals: CarbMealPlan
}

export const DEFAULT_CARB_SETTINGS: CarbSettings = {
  weightKg: CARB_WEIGHT_DEFAULT_KG,
  intensity: 'jog',
  diet: false,
  heightCm: null,
  runTime: 'evening',
  meals: '3',
}

export function clampCarbWeight(value: number): number {
  if (!Number.isFinite(value)) return CARB_WEIGHT_DEFAULT_KG
  return Math.min(CARB_WEIGHT_MAX_KG, Math.max(CARB_WEIGHT_MIN_KG, Math.round(value)))
}

export function parseCarbHeight(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '.') return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return null
  const rounded = Math.round(parsed * 10) / 10
  if (rounded < CARB_HEIGHT_MIN_CM || rounded > CARB_HEIGHT_MAX_CM) return null
  return rounded
}

export function formatCarbHeight(cm: number): string {
  return Number.isInteger(cm) ? String(cm) : cm.toFixed(1)
}

export function carbCoefficient(intensity: CarbIntensityId, diet: boolean): CarbRange {
  const found = CARB_INTENSITIES.find((item) => item.id === intensity) ?? CARB_INTENSITIES[0]
  return diet ? found.diet : found.normal
}

export function gramsFromCoefficient(weightKg: number, coefficient: number): number {
  return Math.round(weightKg * coefficient)
}

export function carbGramRange(weightKg: number, intensity: CarbIntensityId, diet: boolean): CarbRange {
  const coefficient = carbCoefficient(intensity, diet)
  return {
    min: gramsFromCoefficient(weightKg, coefficient.min),
    max: gramsFromCoefficient(weightKg, coefficient.max),
  }
}

export function proteinGramRange(weightKg: number): CarbRange {
  return {
    min: gramsFromCoefficient(weightKg, PROTEIN_G_PER_KG.min),
    max: gramsFromCoefficient(weightKg, PROTEIN_G_PER_KG.max),
  }
}

/** 장거리 러닝에서 자주 보이는 참고 범위. 건강 진단이나 목표 체중이 아님. */
export const LONG_DISTANCE_BMI = { min: 18.5, max: 22 } as const

export function calculateBmi(weightKg: number, heightCm: number): number {
  const meters = heightCm / 100
  return weightKg / (meters * meters)
}

export function longDistanceBmiStatus(bmi: number): 'below' | 'within' | 'above' {
  if (bmi < LONG_DISTANCE_BMI.min) return 'below'
  if (bmi > LONG_DISTANCE_BMI.max) return 'above'
  return 'within'
}

export function bmiReferenceLabel(bmi: number): string {
  if (bmi < 18.5) return '저체중'
  if (bmi < 25) return '정상'
  if (bmi < 30) return '과체중'
  return '비만'
}

export function mealSlotsFor(runTime: CarbRunTime, meals: CarbMealPlan): CarbMealSlot[] {
  return MEAL_SLOTS[meals][runTime]
}

/** 마지막 끼니에서 반올림 오차를 보정한다. */
export function splitCarbGrams(total: number, ratios: number[]): number[] {
  if (ratios.length === 0) return []
  const safeTotal = Math.max(0, Math.round(total))
  const portions = ratios.map((ratio) => Math.round((safeTotal * ratio) / 100))
  const lastIndex = portions.length - 1
  const sumExceptLast = portions.slice(0, lastIndex).reduce((sum, value) => sum + value, 0)
  portions[lastIndex] = safeTotal - sumExceptLast
  if (portions[lastIndex] < 0) {
    let debt = -portions[lastIndex]
    portions[lastIndex] = 0
    for (let index = lastIndex - 1; index >= 0 && debt > 0; index -= 1) {
      const take = Math.min(portions[index], debt)
      portions[index] -= take
      debt -= take
    }
  }
  return portions
}

export type CarbMealPortion = CarbMealSlot & { minGrams: number; maxGrams: number }

export function mealPortions(
  weightKg: number,
  intensity: CarbIntensityId,
  diet: boolean,
  runTime: CarbRunTime,
  meals: CarbMealPlan,
): CarbMealPortion[] {
  const slots = mealSlotsFor(runTime, meals)
  const daily = carbGramRange(weightKg, intensity, diet)
  const ratios = slots.map((slot) => slot.ratio)
  const minGrams = splitCarbGrams(daily.min, ratios)
  const maxGrams = splitCarbGrams(daily.max, ratios)
  return slots.map((slot, index) => ({
    ...slot,
    minGrams: minGrams[index] ?? 0,
    maxGrams: maxGrams[index] ?? 0,
  }))
}

function isIntensity(value: string | null): value is CarbIntensityId {
  return value === 'jog' || value === 'steady' || value === 'hard'
}

function isRunTime(value: string | null): value is CarbRunTime {
  return value === 'morning' || value === 'afternoon' || value === 'evening'
}

function isMealPlan(value: string | null): value is CarbMealPlan {
  return value === '3' || value === 'snack'
}

export function settingsToSearchParams(settings: CarbSettings): URLSearchParams {
  const params = new URLSearchParams()
  params.set('w', String(settings.weightKg))
  params.set('i', settings.intensity)
  params.set('diet', settings.diet ? '1' : '0')
  if (settings.heightCm != null) params.set('h', String(settings.heightCm))
  params.set('run', settings.runTime)
  params.set('meals', settings.meals)
  return params
}

export function settingsFromSearchParams(params: URLSearchParams): CarbSettings | null {
  const keys = ['w', 'i', 'diet', 'h', 'run', 'meals']
  if (!keys.some((key) => params.has(key))) return null

  const weightRaw = Number(params.get('w'))
  const heightRaw = params.get('h')
  const intensity = params.get('i')
  const runTime = params.get('run')
  const meals = params.get('meals')
  const dietRaw = params.get('diet')

  return {
    weightKg: params.has('w') ? clampCarbWeight(weightRaw) : DEFAULT_CARB_SETTINGS.weightKg,
    intensity: isIntensity(intensity) ? intensity : DEFAULT_CARB_SETTINGS.intensity,
    diet: dietRaw === '1' ? true : dietRaw === '0' ? false : DEFAULT_CARB_SETTINGS.diet,
    heightCm: heightRaw ? parseCarbHeight(heightRaw) : null,
    runTime: isRunTime(runTime) ? runTime : DEFAULT_CARB_SETTINGS.runTime,
    meals: isMealPlan(meals) ? meals : DEFAULT_CARB_SETTINGS.meals,
  }
}

export function intensityLabel(id: CarbIntensityId): string {
  return CARB_INTENSITIES.find((item) => item.id === id)?.label ?? CARB_INTENSITIES[0].label
}

export function runTimeLabel(id: CarbRunTime): string {
  return CARB_RUN_TIMES.find((item) => item.id === id)?.label ?? ''
}

export function mealPlanLabel(id: CarbMealPlan): string {
  return CARB_MEAL_PLANS.find((item) => item.id === id)?.label ?? ''
}

export function formatCarbResultText(settings: CarbSettings): string {
  const coefficient = carbCoefficient(settings.intensity, settings.diet)
  const carbs = carbGramRange(settings.weightKg, settings.intensity, settings.diet)
  const protein = proteinGramRange(settings.weightKg)
  const portions = mealPortions(
    settings.weightKg,
    settings.intensity,
    settings.diet,
    settings.runTime,
    settings.meals,
  )
  const lines = [
    'ONE STEP TRAINING CENTER',
    '러닝 탄수화물 계산기',
    '',
    `체중 ${settings.weightKg}kg`,
  ]
  if (settings.heightCm != null) {
    const bmi = calculateBmi(settings.weightKg, settings.heightCm)
    lines.push(
      `키 ${settings.heightCm}cm · BMI ${bmi.toFixed(1)} (${bmiReferenceLabel(bmi)})`,
      `장거리 적합 BMI ${LONG_DISTANCE_BMI.min}–${LONG_DISTANCE_BMI.max} (참고, 건강 기준 아님)`,
    )
  }
  lines.push(
    `운동 강도: ${intensityLabel(settings.intensity)}`,
    `다이어트 중이에요: ${settings.diet ? '켜짐' : '꺼짐'}`,
    `탄수화물 ${carbs.min}–${carbs.max}g/일 (${coefficient.min}–${coefficient.max}g/kg)`,
    `단백질 참고 ${protein.min}–${protein.max}g/일 (${PROTEIN_G_PER_KG.min}–${PROTEIN_G_PER_KG.max}g/kg)`,
    '',
    `러닝 시간대: ${runTimeLabel(settings.runTime)}`,
    `식사: ${mealPlanLabel(settings.meals)}`,
    ...portions.map(
      (slot) => `${slot.label} ${slot.minGrams}–${slot.maxGrams}g (${slot.ratio}%)`,
    ),
    '',
    CARB_DISCLAIMER,
    CARB_MEAL_NOTE,
  )
  return lines.join('\n')
}
