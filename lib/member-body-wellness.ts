export type SleepHours = 'under_6' | '6_7' | '7_8' | 'over_8'
export type BodyCondition = 'good' | 'normal' | 'bad'
export type FatigueLevel = 'low' | 'normal' | 'high'
export type MuscleSoreness = 'none' | 'mild' | 'severe'
export type PainArea = 'none' | 'knee' | 'shoulder' | 'back' | 'ankle' | 'other'
export type MealStatus = 'good' | 'normal' | 'poor'

export type BodyWellnessInput = {
  sleep_hours?: SleepHours | null
  condition?: BodyCondition | null
  fatigue?: FatigueLevel | null
  muscle_soreness?: MuscleSoreness | null
  pain_area?: PainArea | null
  pain_level?: number | null
  pain_area_note?: string | null
  meal_status?: MealStatus | null
}

export type MemberBodyRecordWellness = {
  sleep_hours: SleepHours | null
  condition: BodyCondition | null
  fatigue: FatigueLevel | null
  muscle_soreness: MuscleSoreness | null
  pain_area: PainArea | null
  pain_level: number | null
  pain_area_note: string | null
  meal_status: MealStatus | null
}

export const EMPTY_BODY_WELLNESS: MemberBodyRecordWellness = {
  sleep_hours: null,
  condition: null,
  fatigue: null,
  muscle_soreness: null,
  pain_area: null,
  pain_level: null,
  pain_area_note: null,
  meal_status: null,
}

export type WellnessChoice<T extends string> = { value: T; label: string }

export const SLEEP_HOUR_CHOICES: WellnessChoice<SleepHours>[] = [
  { value: 'under_6', label: '6시간↓' },
  { value: '6_7', label: '6~7시간' },
  { value: '7_8', label: '7~8시간' },
  { value: 'over_8', label: '8시간↑' },
]

export const CONDITION_CHOICES: WellnessChoice<BodyCondition>[] = [
  { value: 'good', label: '좋음' },
  { value: 'normal', label: '보통' },
  { value: 'bad', label: '나쁨' },
]

export const FATIGUE_CHOICES: WellnessChoice<FatigueLevel>[] = [
  { value: 'low', label: '낮음' },
  { value: 'normal', label: '보통' },
  { value: 'high', label: '높음' },
]

export const MUSCLE_SORENESS_CHOICES: WellnessChoice<MuscleSoreness>[] = [
  { value: 'none', label: '없음' },
  { value: 'mild', label: '약간' },
  { value: 'severe', label: '심함' },
]

export const PAIN_AREA_CHOICES: WellnessChoice<PainArea>[] = [
  { value: 'none', label: '없음' },
  { value: 'knee', label: '무릎' },
  { value: 'shoulder', label: '어깨' },
  { value: 'back', label: '허리' },
  { value: 'ankle', label: '발목' },
  { value: 'other', label: '기타' },
]

export const MEAL_STATUS_CHOICES: WellnessChoice<MealStatus>[] = [
  { value: 'good', label: '잘 먹음' },
  { value: 'normal', label: '보통' },
  { value: 'poor', label: '부족' },
]

const LABEL_MAP: Record<string, string> = {
  under_6: '6시간↓',
  '6_7': '6~7시간',
  '7_8': '7~8시간',
  over_8: '8시간↑',
  good: '좋음',
  normal: '보통',
  bad: '나쁨',
  low: '낮음',
  high: '높음',
  none: '없음',
  mild: '약간',
  severe: '심함',
  knee: '무릎',
  shoulder: '어깨',
  back: '허리',
  ankle: '발목',
  other: '기타',
  poor: '부족',
}

export function wellnessValueLabel(value: string | null | undefined): string {
  if (!value) return ''
  return LABEL_MAP[value] ?? value
}

export function parsePainLevel(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  const rounded = Math.round(parsed)
  if (rounded < 1 || rounded > 10) return null
  return rounded
}

export function formatPainAreaLabel(
  painArea: PainArea,
  painAreaNote?: string | null,
): string {
  if (painArea === 'other') {
    const note = painAreaNote?.trim()
    return note || wellnessChoiceLabel('pain_area', painArea)
  }
  return wellnessChoiceLabel('pain_area', painArea)
}

export function formatPainAreaSummary(
  painArea: PainArea,
  painLevel?: number | null,
  painAreaNote?: string | null,
): string {
  if (painArea === 'none') return '통증 없음'
  const areaLabel = formatPainAreaLabel(painArea, painAreaNote)
  return painLevel != null ? `통증 ${areaLabel} ${painLevel}` : `통증 ${areaLabel}`
}

/** 통증 정도(1~10)에 따른 표시 색상 — 높을수록 빨간색 */
export function getPainDisplayTone(
  painArea: PainArea | null | undefined,
  painLevel?: number | null,
): WellnessTone {
  if (!painArea || painArea === 'none') return 'good'
  if (painLevel != null) {
    if (painLevel >= 7) return 'bad'
    if (painLevel >= 4) return 'caution'
    return 'caution'
  }
  return getWellnessChoiceTone('pain_area', painArea) ?? 'caution'
}

/** 통증 그래프 점수 (3=양호 · 2=약간 · 1=주의) */
export function painLevelToChartScore(painLevel: number): number {
  if (painLevel >= 7) return 1
  if (painLevel >= 4) return 2
  return 3
}

/** 상태 의미 색상 — 좋음(초록) · 보통(주황) · 나쁨(빨강) · 기타(보라) · 수면 충분(하늘) · 해당없음(회색) */
export type WellnessTone = 'good' | 'caution' | 'bad' | 'other' | 'info' | 'neutral'

export type WellnessFieldCategory =
  | 'sleep_hours'
  | 'condition'
  | 'fatigue'
  | 'muscle_soreness'
  | 'pain_area'
  | 'meal_status'

const WELLNESS_TONE_CLASSES: Record<WellnessTone, string> = {
  good: 'bg-emerald-500/15 border-emerald-400/60 text-emerald-300',
  caution: 'bg-amber-500/15 border-amber-400/60 text-amber-300',
  bad: 'bg-red-500/15 border-red-400/60 text-red-300',
  other: 'bg-violet-500/15 border-violet-400/60 text-violet-300',
  info: 'bg-sky-500/15 border-sky-400/60 text-sky-300',
  neutral: 'bg-muted/20 border-border/70 text-foreground/55',
}

export function wellnessToneClasses(tone: WellnessTone): string {
  return WELLNESS_TONE_CLASSES[tone]
}

export function wellnessChoiceLabel(
  category: WellnessFieldCategory,
  value: string | null | undefined,
): string {
  if (!value) return ''
  const choiceMap: Record<WellnessFieldCategory, WellnessChoice<string>[]> = {
    sleep_hours: SLEEP_HOUR_CHOICES,
    condition: CONDITION_CHOICES,
    fatigue: FATIGUE_CHOICES,
    muscle_soreness: MUSCLE_SORENESS_CHOICES,
    pain_area: PAIN_AREA_CHOICES,
    meal_status: MEAL_STATUS_CHOICES,
  }
  const choice = choiceMap[category].find((item) => item.value === value)
  return choice?.label ?? wellnessValueLabel(value)
}

/** 리포트·이력·코치 체크용 표시 라벨 (입력 버튼 문구와 분리) */
export function wellnessReportLabel(
  category: WellnessFieldCategory,
  value: string | null | undefined,
): string {
  if (category === 'condition' && value === 'bad') return '주의 필요'
  return wellnessChoiceLabel(category, value)
}

export function getWellnessChoiceTone(
  category: WellnessFieldCategory,
  value: string | null | undefined,
): WellnessTone | null {
  if (!value) return null

  switch (category) {
    case 'sleep_hours': {
      const map: Record<SleepHours, WellnessTone> = {
        under_6: 'bad',
        '6_7': 'caution',
        '7_8': 'good',
        over_8: 'info',
      }
      return map[value as SleepHours] ?? null
    }
    case 'condition': {
      const map: Record<BodyCondition, WellnessTone> = {
        good: 'good',
        normal: 'caution',
        bad: 'bad',
      }
      return map[value as BodyCondition] ?? null
    }
    case 'fatigue': {
      const map: Record<FatigueLevel, WellnessTone> = {
        low: 'good',
        normal: 'caution',
        high: 'bad',
      }
      return map[value as FatigueLevel] ?? null
    }
    case 'muscle_soreness': {
      const map: Record<MuscleSoreness, WellnessTone> = {
        none: 'good',
        mild: 'caution',
        severe: 'bad',
      }
      return map[value as MuscleSoreness] ?? null
    }
    case 'pain_area': {
      const map: Record<PainArea, WellnessTone> = {
        none: 'good',
        knee: 'caution',
        shoulder: 'caution',
        back: 'caution',
        ankle: 'caution',
        other: 'other',
      }
      return map[value as PainArea] ?? null
    }
    case 'meal_status': {
      const map: Record<MealStatus, WellnessTone> = {
        good: 'good',
        normal: 'caution',
        poor: 'bad',
      }
      return map[value as MealStatus] ?? null
    }
    default:
      return null
  }
}

export type WellnessHistoryBadge = {
  label: string
  tone: WellnessTone
}

/** 기록 이력용 상태 배지 목록 */
export function buildWellnessHistoryBadges(
  wellness: Partial<MemberBodyRecordWellness>,
): WellnessHistoryBadge[] {
  const badges: WellnessHistoryBadge[] = []

  if (wellness.sleep_hours) {
    badges.push({
      label: `수면 ${wellnessChoiceLabel('sleep_hours', wellness.sleep_hours)}`,
      tone: getWellnessChoiceTone('sleep_hours', wellness.sleep_hours)!,
    })
  }
  if (wellness.condition) {
    badges.push({
      label: `컨디션 ${wellnessReportLabel('condition', wellness.condition)}`,
      tone: getWellnessChoiceTone('condition', wellness.condition)!,
    })
  }
  if (wellness.fatigue) {
    badges.push({
      label: `피로 ${wellnessChoiceLabel('fatigue', wellness.fatigue)}`,
      tone: getWellnessChoiceTone('fatigue', wellness.fatigue)!,
    })
  }
  if (wellness.muscle_soreness) {
    badges.push({
      label: `근육통 ${wellnessChoiceLabel('muscle_soreness', wellness.muscle_soreness)}`,
      tone: getWellnessChoiceTone('muscle_soreness', wellness.muscle_soreness)!,
    })
  }
  if (wellness.pain_area) {
    badges.push({
      label: formatPainAreaSummary(
        wellness.pain_area,
        wellness.pain_level,
        wellness.pain_area_note,
      ),
      tone: getPainDisplayTone(wellness.pain_area, wellness.pain_level),
    })
  }
  if (wellness.meal_status) {
    badges.push({
      label: `식사 ${wellnessChoiceLabel('meal_status', wellness.meal_status)}`,
      tone: getWellnessChoiceTone('meal_status', wellness.meal_status)!,
    })
  }

  return badges
}

export function hasConditionData(wellness: Partial<MemberBodyRecordWellness>): boolean {
  return Boolean(
    wellness.condition ||
      wellness.fatigue ||
      wellness.sleep_hours ||
      wellness.muscle_soreness ||
      wellness.pain_area ||
      wellness.meal_status,
  )
}

/** 기록 이력 2줄째 — 컨디션 · 피로도 · 통증 */
export function formatWellnessHistoryLine(
  wellness: Partial<MemberBodyRecordWellness>,
): string {
  if (!hasConditionData(wellness)) return '컨디션·회복 기록 없음'

  const parts: string[] = []
  if (wellness.condition) {
    parts.push(`컨디션 ${wellnessReportLabel('condition', wellness.condition)}`)
  }
  if (wellness.fatigue) {
    parts.push(`피로도 ${wellnessValueLabel(wellness.fatigue)}`)
  }
  if (wellness.pain_area) {
    parts.push(
      formatPainAreaSummary(
        wellness.pain_area,
        wellness.pain_level,
        wellness.pain_area_note,
      ),
    )
  } else if (wellness.muscle_soreness === 'none') {
    parts.push('통증 없음')
  } else if (wellness.muscle_soreness) {
    parts.push(`근육통 ${wellnessValueLabel(wellness.muscle_soreness)}`)
  }

  return parts.length > 0 ? parts.join(' · ') : '컨디션·회복 기록 없음'
}

export function formatWellnessSummary(wellness: Partial<MemberBodyRecordWellness>): string {
  const parts: string[] = []
  if (wellness.sleep_hours) parts.push(`수면 ${wellnessValueLabel(wellness.sleep_hours)}`)
  if (wellness.condition) parts.push(`컨디션 ${wellnessReportLabel('condition', wellness.condition)}`)
  if (wellness.fatigue) parts.push(`피로 ${wellnessValueLabel(wellness.fatigue)}`)
  if (wellness.muscle_soreness && wellness.muscle_soreness !== 'none') {
    parts.push(`근육통 ${wellnessValueLabel(wellness.muscle_soreness)}`)
  }
  if (wellness.pain_area && wellness.pain_area !== 'none') {
    parts.push(
      formatPainAreaSummary(
        wellness.pain_area,
        wellness.pain_level,
        wellness.pain_area_note,
      ),
    )
  }
  if (wellness.meal_status) parts.push(`식사 ${wellnessValueLabel(wellness.meal_status)}`)
  return parts.join(' · ')
}

export function hasWellnessData(wellness: Partial<MemberBodyRecordWellness>): boolean {
  return Boolean(formatWellnessSummary(wellness))
}

function isChoice<T extends string>(value: unknown, choices: WellnessChoice<T>[]): value is T {
  return typeof value === 'string' && choices.some((choice) => choice.value === value)
}

export function parseWellnessField<T extends string>(
  value: unknown,
  choices: WellnessChoice<T>[],
): T | null {
  return isChoice(value, choices) ? value : null
}

export function normalizeWellnessInput(
  input?: BodyWellnessInput,
): MemberBodyRecordWellness {
  if (!input) return { ...EMPTY_BODY_WELLNESS }

  const painArea = parseWellnessField(input.pain_area, PAIN_AREA_CHOICES)

  return {
    sleep_hours: parseWellnessField(input.sleep_hours, SLEEP_HOUR_CHOICES),
    condition: parseWellnessField(input.condition, CONDITION_CHOICES),
    fatigue: parseWellnessField(input.fatigue, FATIGUE_CHOICES),
    muscle_soreness: parseWellnessField(input.muscle_soreness, MUSCLE_SORENESS_CHOICES),
    pain_area: painArea,
    pain_level: painArea && painArea !== 'none' ? parsePainLevel(input.pain_level) : null,
    pain_area_note:
      painArea === 'other'
        ? typeof input.pain_area_note === 'string'
          ? input.pain_area_note.trim() || null
          : null
        : null,
    meal_status: parseWellnessField(input.meal_status, MEAL_STATUS_CHOICES),
  }
}
