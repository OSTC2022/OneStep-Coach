import type { RunningLeagueStatus, RunningLeagueTargetGroup } from '@/lib/types'

export const RUNNING_LEAGUE_STATUS_LABELS: Record<RunningLeagueStatus, string> = {
  draft: '예정',
  active: '진행중',
  closed: '종료',
}

export const RUNNING_LEAGUE_TARGET_GROUPS: ReadonlyArray<{
  value: RunningLeagueTargetGroup
  label: string
}> = [
  { value: 'all', label: '성인 러닝 전체' },
  { value: 'beginner', label: '입문자' },
  { value: '5km', label: '5km반' },
  { value: '10km', label: '10km반' },
  { value: 'half_marathon', label: '하프/마라톤반' },
]

export const RUNNING_LEAGUE_DEFAULT_DESCRIPTION =
  '출석, 개인 목표, 기록 향상, 마일리지, 회복관리를 기준으로 진행하는 성인 러닝 리그입니다.'

export const RECOVERY_CHECK_ITEMS = [
  { type: 'stretching' as const, label: '수업 후 스트레칭', points: 3 },
  { type: 'pain_check' as const, label: '통증 체크 입력', points: 3 },
  { type: 'condition_check' as const, label: '컨디션 체크 입력', points: 3 },
  { type: 'recovery_jog' as const, label: '회복 조깅/휴식', points: 5 },
  { type: 'intensity_compliance' as const, label: '코치 강도 준수', points: 5 },
] as const

/** @deprecated running_league_daily_recovery 일일 체크로 대체됨 */

export function targetGroupLabel(value: RunningLeagueTargetGroup | string | null | undefined): string {
  return RUNNING_LEAGUE_TARGET_GROUPS.find((item) => item.value === value)?.label ?? '성인 러닝 전체'
}

export function statusBadgeClass(status: RunningLeagueStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    case 'closed':
      return 'bg-muted text-muted-foreground border-border'
    default:
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  }
}
