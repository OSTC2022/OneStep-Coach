import type { RunningLeagueGoalType, RunningLeagueMemberLevel } from '@/lib/types'
import { goalScoreFromAchievementRate } from '@/lib/running-league/scoring'

export const RUNNING_LEAGUE_MEMBER_LEVELS: ReadonlyArray<{
  value: RunningLeagueMemberLevel
  label: string
  suggestions: readonly string[]
}> = [
  {
    value: 'beginner',
    label: '입문',
    suggestions: ['20분 연속 달리기', '5km 완주', '주 2회 출석'],
  },
  {
    value: 'elementary',
    label: '초급',
    suggestions: ['5km 완주', '5km 기록 단축', '월 40km 달성'],
  },
  {
    value: 'intermediate',
    label: '중급',
    suggestions: ['5km PB 달성', '10km 목표 페이스 유지', '월 60km 달성'],
  },
  {
    value: 'race_prep',
    label: '대회 준비',
    suggestions: ['10km 목표 기록 달성', '하프 준비 롱런 수행', '목표 페이스 적응'],
  },
]

export const RUNNING_LEAGUE_GOAL_TYPES: ReadonlyArray<{
  value: RunningLeagueGoalType
  label: string
  defaultGoal: string
}> = [
  { value: 'finish', label: '완주', defaultGoal: '5km 완주' },
  { value: 'record_improvement', label: '기록 향상', defaultGoal: '5km 기록 단축' },
  { value: 'attendance', label: '출석', defaultGoal: '주 2회 출석' },
  { value: 'mileage', label: '마일리지', defaultGoal: '월 40km 달성' },
  { value: 'health', label: '체중/건강관리', defaultGoal: '주 2회 출석 + 체중관리' },
  { value: 'race_prep', label: '대회 준비', defaultGoal: '10km 목표 기록 달성' },
]

const LEGACY_LEVEL_MAP: Record<string, RunningLeagueMemberLevel> = {
  입문자: 'beginner',
  초급자: 'elementary',
  중급자: 'intermediate',
  '10km반': 'intermediate',
  '하프/마라톤반': 'race_prep',
  '다이어트 목적': 'beginner',
  입문: 'beginner',
  초급: 'elementary',
  중급: 'intermediate',
  '대회 준비': 'race_prep',
}

export function normalizeMemberLevel(
  value: string | null | undefined,
): RunningLeagueMemberLevel | '' {
  if (!value?.trim()) return ''
  const trimmed = value.trim()
  if (LEGACY_LEVEL_MAP[trimmed]) return LEGACY_LEVEL_MAP[trimmed]
  const found = RUNNING_LEAGUE_MEMBER_LEVELS.find(
    (item) => item.value === trimmed || item.label === trimmed,
  )
  return found?.value ?? ''
}

export function memberLevelLabel(value: string | null | undefined): string {
  const normalized = normalizeMemberLevel(value)
  if (!normalized) return value?.trim() || '미설정'
  return RUNNING_LEAGUE_MEMBER_LEVELS.find((item) => item.value === normalized)?.label ?? value ?? '미설정'
}

export function goalTypeLabel(value: string | null | undefined): string {
  if (!value) return '미설정'
  return RUNNING_LEAGUE_GOAL_TYPES.find((item) => item.value === value)?.label ?? value
}

export function suggestionsForLevel(level: RunningLeagueMemberLevel | ''): string[] {
  if (!level) return []
  return [...(RUNNING_LEAGUE_MEMBER_LEVELS.find((item) => item.value === level)?.suggestions ?? [])]
}

export function defaultGoalForType(type: RunningLeagueGoalType | ''): string {
  if (!type) return ''
  return RUNNING_LEAGUE_GOAL_TYPES.find((item) => item.value === type)?.defaultGoal ?? ''
}

export function goalScorePreview(ratePercent: number | null | undefined): number {
  if (ratePercent == null || Number.isNaN(ratePercent)) return 0
  return goalScoreFromAchievementRate(ratePercent)
}

export const EMPTY_GOAL_FORM: ParticipantGoalFormState = {
  goal_level: '',
  goal_type: '',
  personal_goal: '',
  goal_achievement_rate: 0,
  goal_score: 0,
}

export interface ParticipantGoalFormState {
  goal_level: RunningLeagueMemberLevel | ''
  goal_type: RunningLeagueGoalType | ''
  personal_goal: string
  goal_achievement_rate: number
  goal_score: number
}

export function participantToGoalForm(participant: {
  goal_level: string | null
  goal_type?: string | null
  personal_goal: string | null
  goal_achievement_rate: number | null
  goal_score: number
}): ParticipantGoalFormState {
  const rate = participant.goal_achievement_rate ?? 0
  const normalizedLevel = normalizeMemberLevel(participant.goal_level)
  const goalType = (participant.goal_type as RunningLeagueGoalType) ?? ''
  return {
    goal_level: normalizedLevel,
    goal_type: goalType,
    personal_goal: participant.personal_goal ?? '',
    goal_achievement_rate: rate,
    goal_score: participant.goal_score || goalScorePreview(rate),
  }
}

export function applyAchievementRate(
  state: ParticipantGoalFormState,
  rate: number,
): ParticipantGoalFormState {
  const clamped = Math.max(0, Math.min(100, rate))
  return {
    ...state,
    goal_achievement_rate: clamped,
    goal_score: goalScorePreview(clamped),
  }
}
