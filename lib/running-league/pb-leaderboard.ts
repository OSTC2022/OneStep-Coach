import { formatSecondsToRunningTime } from '@/lib/running-league/records'
import { getPbDistanceSource } from '@/lib/running-league/pb-distance-source'
import { parseRunningTimeToSeconds } from '@/lib/running-league/scoring'
import type {
  RunningLeagueDistanceEvent,
  RunningLeagueParticipant,
  RunningLeagueRecord,
} from '@/lib/types'

/**
 * PB 랭킹은 반드시 초(seconds) 기준으로 정렬합니다. time_text 문자열 비교는 사용하지 않습니다.
 *
 * 파싱 예: 21:35 → 1295초, 1:42:10 → 6130초, 3:28:55 → 12535초
 *
 * 이 프로젝트에는 members.pb_5k_seconds / pb_10k_seconds 컬럼이 없습니다.
 * 스펙 필드 매핑: lib/running-league/pb-distance-source.ts (pb_5k_seconds → distance_event 5km)
 * 실제 저장 위치:
 *   running_league_records.time_seconds  (distance_event = 5km|10km, record_phase = other)
 *   running_league_records.time_text     → parseRunningTimeToSeconds() 로 변환
 *   running_league_participants.record_baseline / record_current (레거시 텍스트 fallback)
 *
 * SQL 개념 매핑:
 *   ORDER BY running_league_records.time_seconds ASC
 *   또는 ORDER BY parseRunningTimeToSeconds(time_text) ASC
 */
export function resolvePbTimeSeconds(input: {
  time_seconds?: number | null
  time_text?: string | null
}): number | null {
  if (
    input.time_seconds != null &&
    Number.isFinite(input.time_seconds) &&
    input.time_seconds > 0
  ) {
    return Math.round(input.time_seconds)
  }

  const parsed = parseRunningTimeToSeconds(input.time_text)
  return parsed != null && parsed > 0 ? parsed : null
}

/** PB 시간 비교 — 오름차순(짧을수록 상위). 문자열이 아닌 초 단위 비교 */
export function comparePbTimesAsc(secondsA: number, secondsB: number): number {
  if (secondsA !== secondsB) return secondsA - secondsB
  return 0
}

export type PbLeaderboardDistance = Extract<
  RunningLeagueDistanceEvent,
  '5km' | '10km' | 'half' | 'full'
>

export interface PbDistanceRankRow {
  participantId: string
  memberId: string
  memberName: string
  distanceEvent: PbLeaderboardDistance
  timeText: string
  timeSeconds: number
  rank: number
}

export interface PbDistanceLeaderboard {
  ranked: PbDistanceRankRow[]
  unranked: Array<{
    participantId: string
    memberId: string
    memberName: string
  }>
}

function stripDistancePrefix(value: string): string {
  return value.replace(/^(1km|3km|5km|10km|half|full)\s*/i, '').trim()
}

function resolvePbFromParticipantFields(
  participant: RunningLeagueParticipant,
  distance: PbLeaderboardDistance,
): { timeSeconds: number | null; timeText: string | null } {
  for (const field of [participant.record_current, participant.record_baseline]) {
    if (!field?.trim()) continue
    const match = field.trim().match(/^(1km|3km|5km|10km|half|full)\s+(.+)$/i)
    if (!match || match[1].toLowerCase() !== distance) continue
    const timeText = stripDistancePrefix(match[2])
    const timeSeconds = resolvePbTimeSeconds({ time_text: timeText })
    if (timeSeconds != null) {
      return {
        timeSeconds,
        timeText: formatSecondsToRunningTime(timeSeconds),
      }
    }
  }
  return { timeSeconds: null, timeText: null }
}

export function resolveParticipantPb(
  participant: RunningLeagueParticipant,
  distance: PbLeaderboardDistance,
  pbRecords: RunningLeagueRecord[],
): { timeSeconds: number | null; timeText: string | null } {
  const source = getPbDistanceSource(distance)
  const portalPhases = new Set<RunningLeagueRecord['record_phase']>([
    source.rankingRecordPhase,
    'pb_history',
  ])

  let bestSeconds: number | null = null
  let bestText: string | null = null

  for (const row of pbRecords) {
    if (row.participant_id !== participant.id) continue
    if (row.distance_event !== source.distanceEvent) continue
    if (!portalPhases.has(row.record_phase)) continue

    const timeSeconds = resolvePbTimeSeconds({
      time_seconds: row.time_seconds,
      time_text: row.time_text,
    })
    if (timeSeconds == null) continue
    if (bestSeconds == null || timeSeconds < bestSeconds) {
      bestSeconds = timeSeconds
      bestText = formatSecondsToRunningTime(timeSeconds)
    }
  }

  if (bestSeconds != null) {
    return { timeSeconds: bestSeconds, timeText: bestText }
  }

  return resolvePbFromParticipantFields(participant, distance)
}

function assignPbRanks(
  rows: Array<Omit<PbDistanceRankRow, 'rank'>>,
): PbDistanceRankRow[] {
  let rank = 0
  let previousSeconds: number | null = null

  return rows.map((row, index) => {
    if (previousSeconds === null || row.timeSeconds !== previousSeconds) {
      rank = index + 1
      previousSeconds = row.timeSeconds
    }
    return { ...row, rank }
  })
}

export function buildPbDistanceLeaderboard(
  participants: RunningLeagueParticipant[],
  pbRecords: RunningLeagueRecord[],
  distance: PbLeaderboardDistance,
): PbDistanceLeaderboard {
  const rankedCandidates: Array<Omit<PbDistanceRankRow, 'rank'>> = []
  const unranked: PbDistanceLeaderboard['unranked'] = []

  for (const participant of participants) {
    const memberName = participant.member?.name?.trim() || '회원'
    const pb = resolveParticipantPb(participant, distance, pbRecords)

    if (pb.timeSeconds == null) {
      unranked.push({
        participantId: participant.id,
        memberId: participant.member_id,
        memberName,
      })
      continue
    }

    rankedCandidates.push({
      participantId: participant.id,
      memberId: participant.member_id,
      memberName,
      distanceEvent: distance,
      timeText: pb.timeText ?? formatSecondsToRunningTime(pb.timeSeconds),
      timeSeconds: pb.timeSeconds,
    })
  }

  const sorted = [...rankedCandidates].sort((a, b) => {
    const byTime = comparePbTimesAsc(a.timeSeconds, b.timeSeconds)
    if (byTime !== 0) return byTime
    return a.memberName.localeCompare(b.memberName, 'ko')
  })

  return {
    ranked: assignPbRanks(sorted),
    unranked: unranked.sort((a, b) => a.memberName.localeCompare(b.memberName, 'ko')),
  }
}
