export const MEMBER_DRINK_PREFERENCES = [
  'water',
  'bcaa_grape',
  'bcaa_watermelon',
  'bcaa_lemon',
  'bcaa_mango',
] as const

export type MemberDrinkPreference = (typeof MEMBER_DRINK_PREFERENCES)[number]

export const MEMBER_DRINK_PREFERENCE_MAX_LENGTH = 20

export type MemberDrinkPreferenceDisplay = {
  value: string
  label: string
  shortLabel: string
  kind: 'water' | 'bcaa' | 'custom'
  chipClassName: string
}

export type MemberDrinkPreferenceOption = {
  value: MemberDrinkPreference
  label: string
  shortLabel: string
  group: 'water' | 'bcaa'
  /** Tailwind classes for the compact chip on schedule tiles */
  chipClassName: string
}

export const MEMBER_DRINK_PREFERENCE_OPTIONS: MemberDrinkPreferenceOption[] = [
  {
    value: 'water',
    label: '일반 생수',
    shortLabel: '생',
    group: 'water',
    chipClassName: 'border-sky-500/50 bg-sky-500/20 text-sky-300',
  },
  {
    value: 'bcaa_grape',
    label: 'BCAA 포도',
    shortLabel: '포',
    group: 'bcaa',
    chipClassName: 'border-violet-500/50 bg-violet-500/20 text-violet-300',
  },
  {
    value: 'bcaa_watermelon',
    label: 'BCAA 수박',
    shortLabel: '수',
    group: 'bcaa',
    chipClassName: 'border-rose-500/50 bg-rose-500/20 text-rose-300',
  },
  {
    value: 'bcaa_lemon',
    label: 'BCAA 레몬',
    shortLabel: '레',
    group: 'bcaa',
    chipClassName: 'border-amber-400/50 bg-amber-400/20 text-amber-200',
  },
  {
    value: 'bcaa_mango',
    label: 'BCAA 망고',
    shortLabel: '망',
    group: 'bcaa',
    chipClassName: 'border-orange-500/50 bg-orange-500/20 text-orange-300',
  },
]

const CUSTOM_CHIP_CLASS =
  'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'

export function isMemberDrinkPreference(
  value: string | null | undefined,
): value is MemberDrinkPreference {
  return (
    typeof value === 'string' &&
    (MEMBER_DRINK_PREFERENCES as readonly string[]).includes(value)
  )
}

export function normalizeMemberDrinkPreferenceInput(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null
  return trimmed.slice(0, MEMBER_DRINK_PREFERENCE_MAX_LENGTH)
}

export function getMemberDrinkPreferenceOption(
  value: string | null | undefined,
): MemberDrinkPreferenceOption | null {
  if (!isMemberDrinkPreference(value)) return null
  return MEMBER_DRINK_PREFERENCE_OPTIONS.find((option) => option.value === value) ?? null
}

/** 프리셋 + 수동 입력 공통 표시 정보 */
export function getMemberDrinkPreferenceDisplay(
  value: string | null | undefined,
): MemberDrinkPreferenceDisplay | null {
  const normalized = normalizeMemberDrinkPreferenceInput(value)
  if (!normalized) return null

  const preset = getMemberDrinkPreferenceOption(normalized)
  if (preset) {
    return {
      value: preset.value,
      label: preset.label,
      shortLabel: preset.shortLabel,
      kind: preset.group,
      chipClassName: preset.chipClassName,
    }
  }

  return {
    value: normalized,
    label: normalized,
    shortLabel: normalized.slice(0, 2),
    kind: 'custom',
    chipClassName: CUSTOM_CHIP_CLASS,
  }
}

export function formatMemberDrinkPreferenceLabel(
  value: string | null | undefined,
): string {
  return getMemberDrinkPreferenceDisplay(value)?.label ?? '미설정'
}
