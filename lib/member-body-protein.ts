import {
  DEFAULT_MEMBER_PROTEIN_SETTINGS,
  PROTEIN_GOAL_MODE_MULTIPLIERS,
  PROTEIN_INTAKE_SLOTS,
  type MemberProteinSettings,
  type ProteinIntakeBySlot,
  type ProteinIntakeSlotId,
  type ProteinStatus,
} from '@/lib/member-body-protein-types'

export type {
  MemberProteinSettings,
  ProteinGoalMode,
  ProteinIntakeBySlot,
  ProteinIntakeSlotId,
  ProteinQuickFood,
  ProteinStatus,
} from '@/lib/member-body-protein-types'

export {
  DEFAULT_MEMBER_PROTEIN_SETTINGS,
  PROTEIN_GOAL_MODE_MULTIPLIERS,
  PROTEIN_INTAKE_SLOTS,
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

const PROTEIN_SLOT_IDS = new Set<ProteinIntakeSlotId>(
  PROTEIN_INTAKE_SLOTS.map((slot) => slot.id),
)

function parseProteinSlotGrams(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed)
}

export function emptyProteinIntakeBySlot(): ProteinIntakeBySlot {
  return {}
}

export function normalizeProteinIntakeBySlot(
  slots: ProteinIntakeBySlot | null | undefined,
): ProteinIntakeBySlot {
  if (!slots) return {}
  const next: ProteinIntakeBySlot = {}
  for (const [key, value] of Object.entries(slots)) {
    if (!PROTEIN_SLOT_IDS.has(key as ProteinIntakeSlotId)) continue
    const grams = parseProteinSlotGrams(value)
    if (grams == null || grams <= 0) continue
    next[key as ProteinIntakeSlotId] = grams
  }
  return next
}

export function parseProteinIntakeBySlot(raw: unknown): ProteinIntakeBySlot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  return normalizeProteinIntakeBySlot(raw as ProteinIntakeBySlot)
}

export function sumProteinIntakeBySlot(
  slots: ProteinIntakeBySlot | null | undefined,
): number {
  return Object.values(normalizeProteinIntakeBySlot(slots)).reduce(
    (sum, grams) => sum + grams,
    0,
  )
}

export function proteinIntakeBySlotFromRecord(record: {
  protein_intake_by_slot?: unknown
}): ProteinIntakeBySlot {
  return parseProteinIntakeBySlot(record.protein_intake_by_slot)
}

export function getProteinSlotInputValue(
  slots: ProteinIntakeBySlot,
  slotId: ProteinIntakeSlotId,
): string {
  const grams = normalizeProteinIntakeBySlot(slots)[slotId]
  return grams != null && grams > 0 ? String(grams) : ''
}

export function setProteinSlotInputValue(
  slots: ProteinIntakeBySlot,
  slotId: ProteinIntakeSlotId,
  rawValue: string,
): ProteinIntakeBySlot {
  const next = { ...normalizeProteinIntakeBySlot(slots) }
  const trimmed = rawValue.trim()
  if (!trimmed) {
    delete next[slotId]
    return next
  }
  const grams = parseProteinSlotGrams(trimmed)
  if (grams == null) return next
  next[slotId] = grams
  return next
}

export function addProteinSlotGrams(
  slots: ProteinIntakeBySlot,
  slotId: ProteinIntakeSlotId,
  grams: number,
): ProteinIntakeBySlot {
  if (!Number.isFinite(grams) || grams <= 0) return normalizeProteinIntakeBySlot(slots)
  const next = { ...normalizeProteinIntakeBySlot(slots) }
  next[slotId] = (next[slotId] ?? 0) + Math.round(grams)
  return next
}

export function formatProteinIntakeBreakdown(
  slots: ProteinIntakeBySlot | null | undefined,
): string {
  const normalized = normalizeProteinIntakeBySlot(slots)
  const parts = PROTEIN_INTAKE_SLOTS.flatMap((slot) => {
    const grams = normalized[slot.id]
    if (grams == null || grams <= 0) return []
    return [`${slot.label} ${grams}g`]
  })
  return parts.length > 0 ? parts.join(' · ') : ''
}
