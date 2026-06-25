import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { maskMemberNameForRanking } from '@/lib/running-league/mask-member-name'
import type { LeagueRankMemberSeries } from '@/lib/running-league/league-rank-comparison'
import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { resolvePbTimeSeconds } from '@/lib/running-league/pb-leaderboard'
import {
  bestPbSecondsAsOf,
  collectPbRankSnapshotDates,
} from '@/lib/running-league/ranking-history'
import type { RunningLeagueParticipant, RunningLeagueRecord } from '@/lib/types'

export type LeaguePbRecordComparisonRow = {
  date: string
  label: string
  [key: `time_${string}`]: number | null | undefined
}

export type LeaguePbRecordComparisonChart = {
  rows: LeaguePbRecordComparisonRow[]
  members: LeagueRankMemberSeries[]
}

function formatChartDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

/** 전체 회원 PB 기록 추이(누적 최저 기록) */
export function buildLeaguePbRecordComparisonChart(input: {
  distance: PbLeaderboardDistance
  participants: ReadonlyArray<RunningLeagueParticipant>
  records: ReadonlyArray<RunningLeagueRecord>
  maxMembers?: number
}): LeaguePbRecordComparisonChart | null {
  const dates = collectPbRankSnapshotDates({
    distance: input.distance,
    records: input.records,
    memberPoints: [],
  })
  if (dates.length === 0) return null

  const latestDate = dates[dates.length - 1]
  const maxMembers = input.maxMembers ?? 20

  const rankedMembers = input.participants
    .map((participant) => {
      const timeSeconds = bestPbSecondsAsOf({
        participantId: participant.id,
        distance: input.distance,
        records: input.records,
        asOfDate: latestDate,
      })
      return {
        memberId: participant.member_id,
        memberName: participant.member?.name?.trim() || '회원',
        timeSeconds,
      }
    })
    .filter((row) => row.timeSeconds != null)
    .sort(
      (a, b) =>
        (a.timeSeconds as number) - (b.timeSeconds as number) ||
        a.memberName.localeCompare(b.memberName, 'ko'),
    )
    .slice(0, maxMembers)

  if (rankedMembers.length === 0) return null

  const members: LeagueRankMemberSeries[] = rankedMembers.map((row) => ({
    memberId: row.memberId,
    memberName: maskMemberNameForRanking(row.memberName),
    isSelected: false,
  }))

  const participantByMemberId = new Map(
    input.participants.map((row) => [row.member_id, row]),
  )

  const rows: LeaguePbRecordComparisonRow[] = dates.map((date) => {
    const row: LeaguePbRecordComparisonRow = {
      date,
      label: formatChartDate(date),
    }

    for (const member of members) {
      const participant = participantByMemberId.get(member.memberId)
      if (!participant) {
        row[`time_${member.memberId}`] = null
        continue
      }

      const hasRecordOnOrBefore = input.records.some((record) => {
        if (record.participant_id !== participant.id) return false
        if (record.distance_event !== input.distance) return false
        if (record.measured_at > date) return false
        return resolvePbTimeSeconds(record) != null
      })

      row[`time_${member.memberId}`] = hasRecordOnOrBefore
        ? bestPbSecondsAsOf({
            participantId: participant.id,
            distance: input.distance,
            records: input.records,
            asOfDate: date,
          })
        : null
    }

    return row
  })

  const hasAnyValue = rows.some((row) =>
    members.some((member) => row[`time_${member.memberId}`] != null),
  )
  if (!hasAnyValue) return null

  return { rows, members }
}
