import type { RunningLeagueDistanceEvent, RunningLeagueRecord } from '@/lib/types'
import {
  parseRunningTimeToSeconds,
  recordImprovementScoreFromTimes,
} from '@/lib/running-league/scoring'

export type RecordChangeStatus = 'improved' | 'declined' | 'unchanged' | 'incomplete'

export interface RecordChangeAnalysis {
  status: RecordChangeStatus
  distanceEvent: RunningLeagueDistanceEvent | null
  monthStartText: string | null
  monthEndText: string | null
  monthStartSeconds: number | null
  monthEndSeconds: number | null
  /** 양수=단축(향상), 음수=느려짐, 0=동일 */
  deltaSeconds: number | null
  deltaLabel: string | null
  improvementRatePercent: number | null
  score: number
  statusLabel: string
}

/** 초 → mm:ss 또는 h:mm:ss */
export function formatSecondsToRunningTime(totalSeconds: number): string {
  const sec = Math.max(0, Math.round(Math.abs(totalSeconds)))
  const hours = Math.floor(sec / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  const seconds = sec % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** 향상 폭 표시 — 예: "1분 25초 단축", "15초 느려짐" */
export function formatRecordDeltaLabel(deltaSeconds: number): string {
  const abs = Math.abs(Math.round(deltaSeconds))
  if (abs === 0) return '변화 없음'

  const minutes = Math.floor(abs / 60)
  const seconds = abs % 60
  const parts: string[] = []
  if (minutes > 0) parts.push(`${minutes}분`)
  if (seconds > 0 || minutes === 0) parts.push(`${seconds}초`)

  const span = parts.join(' ')
  if (deltaSeconds > 0) return `${span} 단축`
  if (deltaSeconds < 0) return `${span} 느려짐`
  return '변화 없음'
}

export function analyzeRecordChange(
  monthStart: string | null | undefined,
  monthEnd: string | null | undefined,
  distanceEvent?: RunningLeagueDistanceEvent | null,
): RecordChangeAnalysis {
  const monthStartText = monthStart?.trim() || null
  const monthEndText = monthEnd?.trim() || null
  const startSec = parseRunningTimeToSeconds(monthStartText)
  const endSec = parseRunningTimeToSeconds(monthEndText)

  if (startSec == null || endSec == null) {
    return {
      status: 'incomplete',
      distanceEvent: distanceEvent ?? null,
      monthStartText,
      monthEndText,
      monthStartSeconds: startSec,
      monthEndSeconds: endSec,
      deltaSeconds: null,
      deltaLabel: null,
      improvementRatePercent: null,
      score: 0,
      statusLabel: '기록 입력 필요',
    }
  }

  const deltaSeconds = startSec - endSec
  const improvementRatePercent =
    startSec > 0 ? Math.round(((deltaSeconds / startSec) * 100) * 10) / 10 : 0
  const score = recordImprovementScoreFromTimes(monthStartText, monthEndText)

  if (deltaSeconds > 0) {
    return {
      status: 'improved',
      distanceEvent: distanceEvent ?? null,
      monthStartText,
      monthEndText,
      monthStartSeconds: startSec,
      monthEndSeconds: endSec,
      deltaSeconds,
      deltaLabel: formatRecordDeltaLabel(deltaSeconds),
      improvementRatePercent,
      score,
      statusLabel: '향상',
    }
  }

  if (deltaSeconds < 0) {
    return {
      status: 'declined',
      distanceEvent: distanceEvent ?? null,
      monthStartText,
      monthEndText,
      monthStartSeconds: startSec,
      monthEndSeconds: endSec,
      deltaSeconds,
      deltaLabel: formatRecordDeltaLabel(deltaSeconds),
      improvementRatePercent,
      score,
      statusLabel: '기록 하락',
    }
  }

  return {
    status: 'unchanged',
    distanceEvent: distanceEvent ?? null,
    monthStartText,
    monthEndText,
    monthStartSeconds: startSec,
    monthEndSeconds: endSec,
    deltaSeconds: 0,
    deltaLabel: '변화 없음',
    improvementRatePercent: 0,
    score,
    statusLabel: '변화 없음',
  }
}

export function findRecordTime(
  records: RunningLeagueRecord[],
  participantId: string,
  distance: RunningLeagueDistanceEvent,
  phase: 'month_start' | 'month_end',
): string {
  return (
    records.find(
      (row) =>
        row.participant_id === participantId &&
        row.distance_event === distance &&
        row.record_phase === phase,
    )?.time_text ?? ''
  )
}

export function resolveRecordPair(input: {
  participantId: string
  records: RunningLeagueRecord[]
  distance: RunningLeagueDistanceEvent
  fallbackBaseline?: string | null
  fallbackCurrent?: string | null
}): { monthStart: string; monthEnd: string } {
  const fromTableStart = findRecordTime(
    input.records,
    input.participantId,
    input.distance,
    'month_start',
  )
  const fromTableEnd = findRecordTime(
    input.records,
    input.participantId,
    input.distance,
    'month_end',
  )

  const stripDistance = (value: string | null | undefined) =>
    value?.replace(/^(1km|3km|5km|10km)\s*/i, '').trim() ?? ''

  return {
    monthStart: fromTableStart || stripDistance(input.fallbackBaseline),
    monthEnd: fromTableEnd || stripDistance(input.fallbackCurrent),
  }
}

export function listParticipantRecordEvents(
  records: RunningLeagueRecord[],
  participantId: string,
): RunningLeagueDistanceEvent[] {
  const events = new Set<RunningLeagueDistanceEvent>()
  for (const row of records.filter((item) => item.participant_id === participantId)) {
    events.add(row.distance_event)
  }
  return [...events]
}
