import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  countMemberAttendanceStats,
  isAttendanceKingQualifiedLog,
  resolveAttendanceDayKey,
} from '@/lib/running-league/attendance-king'
import { maskMemberNameForRanking } from '@/lib/running-league/mask-member-name'
import { filterMileageLogsForPeriod } from '@/lib/running-league/ranking-period'
import type { LeagueMileageComparisonChart } from '@/lib/running-league/league-mileage-comparison'
import type { LeagueRankMemberSeries } from '@/lib/running-league/league-rank-comparison'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'

export type LeagueAttendanceComparisonChart = LeagueMileageComparisonChart

function formatChartDate(value: string): string {
  try {
    return format(parseISO(value.slice(0, 10)), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

function collectAttendanceSnapshotDays(
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  period?: { start: string; end: string },
  maxPoints = 12,
): string[] {
  const scopedLogs = period ? filterMileageLogsForPeriod(logs, period) : logs
  const days = new Set<string>()
  for (const log of scopedLogs) {
    if (!isAttendanceKingQualifiedLog(log)) continue
    days.add(resolveAttendanceDayKey(log.logged_at))
  }
  const sorted = [...days].sort()
  if (sorted.length <= maxPoints) return sorted
  return sorted.slice(-maxPoints)
}

function countAttendanceUpToDay(
  memberId: string,
  logs: ReadonlyArray<RunningLeagueMileageLog>,
  asOfDay: string,
  period?: { start: string; end: string },
): number {
  return countMemberAttendanceStats(memberId, logs, { asOfDate: asOfDay, period })
    .attendanceCount
}

function resolveRankedMembersAtLatest(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  latestDay: string
  period?: { start: string; end: string }
  maxMembers: number
}): Array<{ memberId: string; memberName: string; count: number }> {
  return input.participants
    .map((participant) => ({
      memberId: participant.member_id,
      memberName: participant.member?.name?.trim() || '회원',
      count: countAttendanceUpToDay(
        participant.member_id,
        input.logs,
        input.latestDay,
        input.period,
      ),
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.memberName.localeCompare(b.memberName, 'ko'))
    .slice(0, input.maxMembers)
}

/** 전체 회원 출석 횟수 비교 (3km+ · 같은 날 여러 번 뛰어도 출석 1회) */
export function buildLeagueAttendanceComparisonChart(input: {
  participants: ReadonlyArray<RunningLeagueParticipant>
  logs: ReadonlyArray<RunningLeagueMileageLog>
  period?: { start: string; end: string }
  maxMembers?: number
  ensureMemberIds?: ReadonlyArray<string | null | undefined>
}): LeagueAttendanceComparisonChart | null {
  const days = collectAttendanceSnapshotDays(input.logs, input.period)
  if (days.length === 0) return null

  const latestDay = days[days.length - 1]
  const rankedMembers = resolveRankedMembersAtLatest({
    participants: input.participants,
    logs: input.logs,
    latestDay,
    period: input.period,
    maxMembers: input.maxMembers ?? 20,
  })

  const memberRows = [...rankedMembers]
  for (const rawId of input.ensureMemberIds ?? []) {
    const memberId = rawId?.trim()
    if (!memberId) continue
    if (memberRows.some((row) => row.memberId === memberId)) continue
    const participant = input.participants.find((row) => row.member_id === memberId)
    if (!participant) continue
    memberRows.push({
      memberId: participant.member_id,
      memberName: participant.member?.name?.trim() || '회원',
      count: countAttendanceUpToDay(
        participant.member_id,
        input.logs,
        latestDay,
        input.period,
      ),
    })
  }
  if (memberRows.length === 0) return null

  const members: LeagueRankMemberSeries[] = memberRows.map((row) => ({
    memberId: row.memberId,
    memberName: maskMemberNameForRanking(row.memberName),
    isSelected: false,
  }))

  const rows = days.map((day) => {
    const row: LeagueAttendanceComparisonChart['rows'][number] = {
      date: day,
      label: formatChartDate(day),
    }
    for (const member of members) {
      row[`km_${member.memberId}`] = countAttendanceUpToDay(
        member.memberId,
        input.logs,
        day,
        input.period,
      )
    }
    return row
  })

  return { rows, members }
}
