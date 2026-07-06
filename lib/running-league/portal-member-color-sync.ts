import { buildMemberChartColorMap } from '@/lib/running-league/chart-member-colors'
import { buildLeagueAttendanceComparisonChart } from '@/lib/running-league/league-attendance-comparison'
import { buildLeagueMileageComparisonChart } from '@/lib/running-league/league-mileage-comparison'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'

/** 집계 그래프와 동일한 회원 ID 집합으로 색상 맵 생성 (룰렛·차트 동기화) */
export function buildPortalRouletteMemberColorMap(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  mileageLogs: ReadonlyArray<RunningLeagueMileageLog>
  period: { start: string; end: string }
  beatRivalMemberId?: string | null
  attendanceMemberIds?: readonly string[]
}): Map<string, string> {
  const memberIds = new Set<string>()

  const mileageChart = buildLeagueMileageComparisonChart({
    participants: input.participants,
    logs: input.mileageLogs,
    beatRivalMemberId: input.beatRivalMemberId,
  })
  for (const member of mileageChart?.members ?? []) {
    memberIds.add(member.memberId)
  }

  const attendanceChart = buildLeagueAttendanceComparisonChart({
    participants: input.participants,
    logs: input.mileageLogs,
    period: input.period,
  })
  for (const member of attendanceChart?.members ?? []) {
    memberIds.add(member.memberId)
  }

  for (const memberId of input.attendanceMemberIds ?? []) {
    if (memberId) memberIds.add(memberId)
  }

  return buildMemberChartColorMap([...memberIds], {
    beatRivalMemberId: input.beatRivalMemberId,
  })
}
