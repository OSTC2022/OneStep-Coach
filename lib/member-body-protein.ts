import {
  DEFAULT_MEMBER_PROTEIN_SETTINGS,
  PROTEIN_GOAL_MODE_MULTIPLIERS,
  type MemberProteinSettings,
  type ProteinStatus,
} from '@/lib/member-body-protein-types'

export type {
  MemberProteinSettings,
  ProteinGoalMode,
  ProteinQuickFood,
  ProteinStatus,
} from '@/lib/member-body-protein-types'

export {
  DEFAULT_MEMBER_PROTEIN_SETTINGS,
  PROTEIN_GOAL_MODE_MULTIPLIERS,
  PROTEIN_QUICK_FOODS,
} from '@/lib/member-body-protein-types'

export function resolveProteinMultiplier(settings?: Partial<MemberProteinSettings>): number {
  if (settings?.protein_goal_multiplier != null && settings.protein_goal_multiplier > 0) {
    return settings.protein_goal_multiplier
  }
  const mode = settings?.protein_goal_mode ?? DEFAULT_MEMBER_PROTEIN_SETTINGS.protein_goal_mode
  return PROTEIN_GOAL_MODE_MULTIPLIERS[mode] ?? DEFAULT_MEMBER_PROTEIN_SETTINGS.protein_goal_multiplier
}

export function calculateProteinTarget(
  weightKg: number | null | undefined,
  multiplier: number,
): number | null {
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return null
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null
  return Math.round(weightKg * multiplier)
}

export function calculateProteinRemaining(
  intakeG: number | null | undefined,
  targetG: number | null | undefined,
): number | null {
  if (targetG == null || intakeG == null) return null
  return Math.max(0, Math.round(targetG - intakeG))
}

export function calculateProteinAchievementPercent(
  intakeG: number | null | undefined,
  targetG: number | null | undefined,
): number | null {
  if (targetG == null || targetG <= 0 || intakeG == null) return null
  return Math.min(100, Math.round((intakeG / targetG) * 100))
}

/** 목표 대비 자동 판정 — 입력 없음은 null */
export function deriveProteinStatus(
  intakeG: number | null | undefined,
  targetG: number | null | undefined,
): ProteinStatus | null {
  if (intakeG == null || !Number.isFinite(intakeG) || intakeG < 0) return null
  if (targetG == null || targetG <= 0) return null

  const ratio = intakeG / targetG
  if (ratio >= 0.8) return 'sufficient'
  if (ratio >= 0.5) return 'normal'
  return 'insufficient'
}

export function proteinStatusLabel(status: ProteinStatus | null | undefined): string {
  switch (status) {
    case 'sufficient':
      return '충분'
    case 'normal':
      return '보통'
    case 'insufficient':
      return '부족'
    default:
      return '기록 필요'
  }
}

export function parseProteinGramsInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed)
}

export function formatProteinGrams(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return String(Math.round(value))
}
