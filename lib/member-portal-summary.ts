import { format } from 'date-fns'
import type { MemberBodyRecord } from '@/lib/actions/member-body-records'
import { calculateProteinAchievementPercent } from '@/lib/member-body-protein'
import {
  buildAthletePortalStatus,
  buildRecentConditionPortalStatus,
  MEMBER_REPORT_MIN_RECORDS,
  type PortalStatusDisplay,
} from '@/lib/member-portal-status'
import {
  hasConditionData,
  wellnessChoiceLabel,
} from '@/lib/member-body-wellness'

export { MEMBER_REPORT_MIN_RECORDS }

export type MemberPortalSummary = {
  athleteStatus: PortalStatusDisplay
  recentCondition: PortalStatusDisplay
  recentAttendanceDate: string | null
  todayRecorded: boolean
  wellnessRecordCount: number
  todayRecordSummary: string | null
}

function getRealRecords(records: MemberBodyRecord[]): MemberBodyRecord[] {
  return records.filter((record) => !record.id.startsWith('bootstrap-'))
}

export function buildTodayRecordSummaryLine(
  record: MemberBodyRecord | undefined,
): string | null {
  if (!record || !hasConditionData(record)) return null

  const parts: string[] = []

  if (record.sleep_hours) {
    parts.push(`수면 ${wellnessChoiceLabel('sleep_hours', record.sleep_hours)}`)
  }
  if (record.condition) {
    parts.push(`컨디션 ${wellnessChoiceLabel('condition', record.condition)}`)
  }
  if (record.fatigue) {
    parts.push(`피로도 ${wellnessChoiceLabel('fatigue', record.fatigue)}`)
  }

  const proteinPct = calculateProteinAchievementPercent(
    record.protein_intake_g,
    record.protein_target_g,
  )
  if (proteinPct != null) {
    parts.push(`단백질 ${proteinPct}%`)
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

export function buildMemberPortalSummary(
  bodyRecords: MemberBodyRecord[],
  recentAttendanceDate: string | null,
): MemberPortalSummary {
  const today = format(new Date(), 'yyyy-MM-dd')
  const realRecords = getRealRecords(bodyRecords)
  const todayRecord = realRecords.find((record) => record.recorded_at === today)
  const wellnessRecordCount = realRecords.filter((record) =>
    hasConditionData(record),
  ).length

  const todayRecorded = Boolean(todayRecord && hasConditionData(todayRecord))

  return {
    athleteStatus: buildAthletePortalStatus(
      bodyRecords,
      todayRecorded,
      wellnessRecordCount,
    ),
    recentCondition: buildRecentConditionPortalStatus(
      bodyRecords,
      wellnessRecordCount,
    ),
    recentAttendanceDate,
    todayRecorded,
    wellnessRecordCount,
    todayRecordSummary: buildTodayRecordSummaryLine(todayRecord),
  }
}
