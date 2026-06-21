import type {
  RunningLeagueDailyRecovery,
  RecoveryCoachCompliance,
  RecoveryCondition,
  RecoveryIntensity,
  RecoveryPain,
  RecoveryStretching,
} from '@/lib/types'

export type RecoveryAlertType = 'pain_severe' | 'overtraining' | 'coach_overtraining'

export interface RecoveryAlert {
  type: RecoveryAlertType
  label: string
  memberId: string
  memberName: string
  participantId: string
  loggedAt: string
  detail: string
}

export interface DailyRecoveryFormState {
  condition: RecoveryCondition | ''
  pain: RecoveryPain | ''
  stretching: RecoveryStretching | ''
  intensity: RecoveryIntensity | ''
  coach_compliance: RecoveryCoachCompliance | ''
}

export const EMPTY_DAILY_RECOVERY_FORM: DailyRecoveryFormState = {
  condition: '',
  pain: '',
  stretching: '',
  intensity: '',
  coach_compliance: '',
}

export const DAILY_RECOVERY_FIELDS = [
  {
    key: 'condition' as const,
    label: '오늘 컨디션',
    description: '몸 상태를 솔직하게 기록해주세요.',
    options: [
      { value: 'good' as const, label: '좋음' },
      { value: 'normal' as const, label: '보통' },
      { value: 'tired' as const, label: '피곤함' },
    ],
  },
  {
    key: 'pain' as const,
    label: '통증 여부',
    description: '불편한 부위가 있으면 코치가 확인합니다.',
    options: [
      { value: 'none' as const, label: '없음' },
      { value: 'mild' as const, label: '조금 있음' },
      { value: 'severe' as const, label: '심함' },
    ],
  },
  {
    key: 'stretching' as const,
    label: '스트레칭',
    description: '수업 후 스트레칭·이완을 했는지 기록합니다.',
    options: [
      { value: 'done' as const, label: '완료' },
      { value: 'not_done' as const, label: '미완료' },
    ],
  },
  {
    key: 'intensity' as const,
    label: '운동 강도',
    description: '오늘 뛴 강도를 선택해주세요.',
    options: [
      { value: 'light' as const, label: '가벼움' },
      { value: 'moderate' as const, label: '적당함' },
      { value: 'hard' as const, label: '힘듦' },
      { value: 'excessive' as const, label: '무리함' },
    ],
  },
  {
    key: 'coach_compliance' as const,
    label: '코치 강도 준수',
    description: '코치가 정한 페이스·강도를 지켰는지 기록합니다.',
    options: [
      { value: 'followed' as const, label: '지킴' },
      { value: 'slightly_fast' as const, label: '조금 빠름' },
      { value: 'excessive' as const, label: '무리함' },
    ],
  },
] as const

export function isDailyRecoveryComplete(form: DailyRecoveryFormState): boolean {
  return (
    form.condition !== '' &&
    form.pain !== '' &&
    form.stretching !== '' &&
    form.intensity !== '' &&
    form.coach_compliance !== ''
  )
}

/** 일일 회복관리 점수 — 꾸준한 체크와 회복 습관을 반영 */
export function dailyRecoveryPoints(entry: {
  condition: RecoveryCondition
  pain: RecoveryPain
  stretching: RecoveryStretching
  intensity: RecoveryIntensity
  coach_compliance: RecoveryCoachCompliance
}): number {
  let points = 4

  if (entry.condition === 'good') points += 3
  else if (entry.condition === 'normal') points += 2
  else points += 1

  if (entry.pain === 'none') points += 3
  else if (entry.pain === 'mild') points += 1

  if (entry.stretching === 'done') points += 3

  if (entry.intensity === 'light') points += 3
  else if (entry.intensity === 'moderate') points += 2
  else if (entry.intensity === 'hard') points += 1

  if (entry.coach_compliance === 'followed') points += 3
  else if (entry.coach_compliance === 'slightly_fast') points += 1

  return points
}

/** 월간 누적 일일 점수 → 0~100 (입력 횟수·회복 습관 반영) */
export function monthlyRecoveryScoreFromEntries(
  entries: ReadonlyArray<{ points: number }>,
): number {
  if (entries.length === 0) return 0
  const total = entries.reduce((sum, entry) => sum + entry.points, 0)
  const targetTotal = 120
  return Math.min(100, Math.round((total / targetTotal) * 100))
}

export function dailyRecoveryToFormState(
  entry: RunningLeagueDailyRecovery | null | undefined,
): DailyRecoveryFormState {
  if (!entry) return { ...EMPTY_DAILY_RECOVERY_FORM }
  return {
    condition: entry.condition,
    pain: entry.pain,
    stretching: entry.stretching,
    intensity: entry.intensity,
    coach_compliance: entry.coach_compliance,
  }
}

export function recoveryFieldLabel(
  key: keyof DailyRecoveryFormState,
  value: string,
): string {
  const field = DAILY_RECOVERY_FIELDS.find((item) => item.key === key)
  return field?.options.find((option) => option.value === value)?.label ?? value
}

export function analyzeRecoveryEntry(
  entry: RunningLeagueDailyRecovery,
  memberName: string,
): RecoveryAlert[] {
  const alerts: RecoveryAlert[] = []

  if (entry.pain === 'severe') {
    alerts.push({
      type: 'pain_severe',
      label: '통증 심함',
      memberId: entry.member_id,
      memberName,
      participantId: entry.participant_id,
      loggedAt: entry.logged_at,
      detail: `${entry.logged_at} · 통증 심함 — 훈련 강도 조절이 필요합니다.`,
    })
  }

  if (entry.intensity === 'excessive') {
    alerts.push({
      type: 'overtraining',
      label: '운동 강도 무리함',
      memberId: entry.member_id,
      memberName,
      participantId: entry.participant_id,
      loggedAt: entry.logged_at,
      detail: `${entry.logged_at} · 오늘 강도가 무리함으로 기록되었습니다.`,
    })
  }

  if (entry.coach_compliance === 'excessive') {
    alerts.push({
      type: 'coach_overtraining',
      label: '코치 강도 미준수',
      memberId: entry.member_id,
      memberName,
      participantId: entry.participant_id,
      loggedAt: entry.logged_at,
      detail: `${entry.logged_at} · 코치가 정한 강도보다 무리하게 뛴 것으로 기록되었습니다.`,
    })
  }

  return alerts
}

export function collectRecoveryAlerts(
  entries: RunningLeagueDailyRecovery[],
  memberNameById: Map<string, string>,
  options?: { days?: number },
): RecoveryAlert[] {
  const days = options?.days ?? 14
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffIso = cutoff.toISOString().slice(0, 10)

  const alerts: RecoveryAlert[] = []
  for (const entry of entries) {
    if (entry.logged_at < cutoffIso) continue
    const memberName = memberNameById.get(entry.member_id) ?? '회원'
    alerts.push(...analyzeRecoveryEntry(entry, memberName))
  }

  return alerts.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
}

export function hasOvertrainingRisk(form: DailyRecoveryFormState): boolean {
  return form.intensity === 'excessive' || form.coach_compliance === 'excessive'
}

export function hasSeverePain(form: DailyRecoveryFormState): boolean {
  return form.pain === 'severe'
}
