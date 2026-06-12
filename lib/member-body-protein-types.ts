export type ProteinStatus = 'sufficient' | 'normal' | 'insufficient'

export type ProteinGoalMode =
  | 'basic'
  | 'training'
  | 'high_intensity'
  | 'recovery'

export type MemberProteinSettings = {
  protein_goal_multiplier: number
  protein_goal_mode: ProteinGoalMode
}

export const PROTEIN_GOAL_MODE_MULTIPLIERS: Record<ProteinGoalMode, number> = {
  basic: 1.3,
  training: 1.5,
  high_intensity: 1.7,
  recovery: 1.9,
}

export const DEFAULT_MEMBER_PROTEIN_SETTINGS: MemberProteinSettings = {
  protein_goal_multiplier: 1.5,
  protein_goal_mode: 'training',
}

/** 빠른 입력 — 추후 관리자 설정으로 교체 가능 */
export type ProteinQuickFood = {
  id: string
  label: string
  grams: number
}

export const PROTEIN_QUICK_FOODS: ProteinQuickFood[] = [
  { id: 'egg', label: '계란 1개', grams: 6 },
  { id: 'chicken', label: '닭가슴살 100g', grams: 23 },
  { id: 'meat_fish', label: '고기/생선 100g', grams: 20 },
  { id: 'tofu', label: '두부 1/2모', grams: 15 },
  { id: 'milk', label: '우유 200ml', grams: 6 },
  { id: 'yogurt', label: '그릭요거트 1개', grams: 10 },
  { id: 'protein_shake', label: '프로틴 1회', grams: 20 },
]

export type ProteinIntakeSlotId =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'pre_workout'
  | 'post_workout'
  | 'snack'

export const PROTEIN_INTAKE_SLOTS: ReadonlyArray<{
  id: ProteinIntakeSlotId
  label: string
}> = [
  { id: 'breakfast', label: '아침' },
  { id: 'lunch', label: '점심' },
  { id: 'dinner', label: '저녁' },
  { id: 'pre_workout', label: '운동 전' },
  { id: 'post_workout', label: '운동 후' },
  { id: 'snack', label: '간식' },
]

export type ProteinIntakeBySlot = Partial<Record<ProteinIntakeSlotId, number>>
