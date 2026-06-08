import type { MemberBodyRecord } from '@/lib/actions/member-body-records'
import {
  buildCoachCheckReport,
  COACH_CHECK_STATUS_LABELS,
  type CoachCheckStatus,
} from '@/lib/member-body-analysis'
export const MEMBER_REPORT_MIN_RECORDS = 3

export type PortalStatusTone =
  | 'input_needed'
  | 'pending_analysis'
  | 'accumulating'
  | 'stable'
  | 'watch'
  | 'caution'
  | 'recovery'
  | 'neutral'

export type PortalStatusDisplay = {
  label: string
  hint: string
  tone: PortalStatusTone
}

function mapCoachStatusToTone(status: CoachCheckStatus): PortalStatusTone {
  switch (status) {
    case 'stable':
      return 'stable'
    case 'watch':
      return 'watch'
    case 'caution':
      return 'caution'
    case 'recovery':
      return 'recovery'
    case 'insufficient_records':
      return 'accumulating'
    default:
      return 'neutral'
  }
}

function buildCoachBasedStatus(
  records: MemberBodyRecord[],
  hint: string,
): PortalStatusDisplay {
  const report = buildCoachCheckReport(records)
  return {
    label: COACH_CHECK_STATUS_LABELS[report.overallStatus],
    hint,
    tone: mapCoachStatusToTone(report.overallStatus),
  }
}

export function buildAthletePortalStatus(
  records: MemberBodyRecord[],
  todayRecorded: boolean,
  wellnessRecordCount: number,
): PortalStatusDisplay {
  if (!todayRecorded) {
    return {
      label: '입력 대기',
      hint: '오늘 상태 기록이 필요합니다.',
      tone: 'input_needed',
    }
  }

  if (wellnessRecordCount < MEMBER_REPORT_MIN_RECORDS) {
    return {
      label: '기록 누적 중',
      hint: `${wellnessRecordCount}회 기록 · 3회 이상 시 분석`,
      tone: 'accumulating',
    }
  }

  return buildCoachBasedStatus(records, '오늘·최근 기록 기준')
}

export function buildRecentConditionPortalStatus(
  records: MemberBodyRecord[],
  wellnessRecordCount: number,
): PortalStatusDisplay {
  if (wellnessRecordCount < MEMBER_REPORT_MIN_RECORDS) {
    return {
      label: '분석 전',
      hint: '3회 이상 기록 시 분석',
      tone: 'pending_analysis',
    }
  }

  return buildCoachBasedStatus(records, '최근 기록 흐름 기준')
}

export function portalStatusToneClass(tone: PortalStatusTone): string {
  switch (tone) {
    case 'input_needed':
      return 'text-amber-300'
    case 'pending_analysis':
      return 'text-sky-300/80'
    case 'accumulating':
      return 'text-sky-300'
    case 'stable':
      return 'text-emerald-300'
    case 'watch':
      return 'text-orange-300'
    case 'caution':
    case 'recovery':
      return 'text-red-300'
    default:
      return 'text-foreground/80'
  }
}
