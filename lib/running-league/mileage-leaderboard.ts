import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'

/**
 * 마일리지 랭킹 — member_id 기준 월 distance_km 합계, 내림차순.
 *
 * 이 프로젝트에는 running_records 테이블이 없습니다.
 * 실제 저장 위치: running_league_mileage_logs
 *
 * SQL 개념 매핑:
 *   SELECT m.id AS member_id, m.name, SUM(l.distance_km) AS monthly_distance
 *   FROM running_league_mileage_logs l
 *   JOIN members m ON m.id = l.member_id
 *   WHERE l.logged_at >= month_start AND l.logged_at <= month_end
 *   GROUP BY m.id, m.name
 *   ORDER BY monthly_distance DESC;
 */
export interface MileageDistanceRankRow {
  participantId: string
  memberId: string
  memberName: string
  mileageKm: number
  rank: number
}

export interface MileageDistanceLeaderboard {
  ranked: MileageDistanceRankRow[]
  unranked: Array<{
    participantId: string
    memberId: string
    memberName: string
  }>
}

/** 로그 distance_km 합산 — syncParticipantMileageFromLogs 와 동일 */
export function sumMileageLogsKm(
  logs: ReadonlyArray<Pick<RunningLeagueMileageLog, 'distance_km'>>,
): number {
  const total = logs.reduce((sum, row) => sum + Number(row.distance_km ?? 0), 0)
  return Math.round(total * 10) / 10
}

/**
 * GROUP BY member_id — SUM(distance_km) AS monthly_distance
 */
export function aggregateMonthlyMileageByMember(
  logs: ReadonlyArray<Pick<RunningLeagueMileageLog, 'member_id' | 'distance_km'>>,
): Map<string, number> {
  const totals = new Map<string, number>()

  for (const log of logs) {
    if (!log.member_id) continue
    const next = (totals.get(log.member_id) ?? 0) + Number(log.distance_km ?? 0)
    totals.set(log.member_id, next)
  }

  for (const [memberId, km] of totals) {
    totals.set(memberId, Math.round(km * 10) / 10)
  }

  return totals
}

/** 월 누적 거리 비교 — 내림차순(클수록 상위) */
export function compareMileageDistanceDesc(kmA: number, kmB: number): number {
  if (kmB !== kmA) return kmB - kmA
  return 0
}

export function formatMileageKmDisplay(km: number): string {
  return `${km.toFixed(1)}km`
}

function assignMileageRanks(
  rows: Array<Omit<MileageDistanceRankRow, 'rank'>>,
): MileageDistanceRankRow[] {
  let rank = 0
  let previousKm: number | null = null

  return rows.map((row, index) => {
    if (previousKm === null || row.mileageKm !== previousKm) {
      rank = index + 1
      previousKm = row.mileageKm
    }
    return { ...row, rank }
  })
}

export function buildMileageDistanceLeaderboard(
  participants: RunningLeagueParticipant[],
  monthlyLogs: RunningLeagueMileageLog[],
): MileageDistanceLeaderboard {
  const monthlyDistanceByMember = aggregateMonthlyMileageByMember(monthlyLogs)
  const rankedCandidates: Array<Omit<MileageDistanceRankRow, 'rank'>> = []
  const unranked: MileageDistanceLeaderboard['unranked'] = []

  for (const participant of participants) {
    const memberId = participant.member_id
    const memberName = participant.member?.name?.trim() || '회원'
    const fromLogs = monthlyDistanceByMember.get(memberId)
    const mileageKm =
      fromLogs != null
        ? fromLogs
        : Math.round(Number(participant.mileage_km ?? 0) * 10) / 10

    if (mileageKm <= 0) {
      unranked.push({
        participantId: participant.id,
        memberId,
        memberName,
      })
      continue
    }

    rankedCandidates.push({
      participantId: participant.id,
      memberId,
      memberName,
      mileageKm,
    })
  }

  const sorted = [...rankedCandidates].sort((a, b) => {
    const byDistance = compareMileageDistanceDesc(a.mileageKm, b.mileageKm)
    if (byDistance !== 0) return byDistance
    return a.memberName.localeCompare(b.memberName, 'ko')
  })

  return {
    ranked: assignMileageRanks(sorted),
    unranked: unranked.sort((a, b) => a.memberName.localeCompare(b.memberName, 'ko')),
  }
}
