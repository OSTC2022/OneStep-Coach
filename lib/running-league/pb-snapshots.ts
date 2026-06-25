import type { RunningLeagueDistanceEvent, RunningLeagueRecord } from '@/lib/types'
import type { PortalPbRecordListItem } from '@/lib/running-league/pb-portal-history'

export type PbSnapshotRow = {
  id: string
  participant_id: string
  league_id: string
  member_id: string
  distance_event: RunningLeagueDistanceEvent
  time_text: string
  time_seconds: number | null
  measured_at: string
  created_at: string
}

export function mapPbSnapshotRow(row: Record<string, unknown>): PbSnapshotRow {
  return {
    id: String(row.id),
    participant_id: String(row.participant_id),
    league_id: String(row.league_id),
    member_id: String(row.member_id),
    distance_event: row.distance_event as RunningLeagueDistanceEvent,
    time_text: String(row.time_text ?? ''),
    time_seconds: row.time_seconds != null ? Number(row.time_seconds) : null,
    measured_at: String(row.measured_at),
    created_at: String(row.created_at),
  }
}

export function pbSnapshotsToRecordList(
  snapshots: ReadonlyArray<PbSnapshotRow>,
  distance: RunningLeagueDistanceEvent,
  currentOther: RunningLeagueRecord | null,
): PortalPbRecordListItem[] {
  const forDistance = snapshots
    .filter((row) => row.distance_event === distance && row.time_text.trim())
    .sort((a, b) => {
      const byMeasured = b.measured_at.localeCompare(a.measured_at)
      if (byMeasured !== 0) return byMeasured
      return b.created_at.localeCompare(a.created_at)
    })

  if (forDistance.length === 0 && currentOther?.time_text?.trim()) {
    return [
      {
        id: currentOther.id,
        distance_event: distance,
        time_text: currentOther.time_text.trim(),
        measured_at: currentOther.measured_at,
        isCurrent: true,
      },
    ]
  }

  const currentKey =
    currentOther?.time_text?.trim()
      ? `${currentOther.measured_at.slice(0, 10)}|${currentOther.time_text.trim()}`
      : null

  return forDistance.map((row) => {
    const rowKey = `${row.measured_at.slice(0, 10)}|${row.time_text.trim()}`
    return {
      id: row.id,
      distance_event: distance,
      time_text: row.time_text.trim(),
      measured_at: row.measured_at,
      isCurrent: currentKey ? rowKey === currentKey : row.id === forDistance[0]?.id,
    }
  })
}

export function pbSnapshotHistoryRecords(
  snapshots: ReadonlyArray<PbSnapshotRow>,
  currentOther: RunningLeagueRecord | null,
): RunningLeagueRecord[] {
  const latestByDistance = new Map<RunningLeagueDistanceEvent, string>()
  for (const row of [...snapshots].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!latestByDistance.has(row.distance_event)) {
      latestByDistance.set(row.distance_event, row.id)
    }
  }

  return snapshots.map((row) => ({
    id: row.id,
    participant_id: row.participant_id,
    league_id: row.league_id,
    member_id: row.member_id,
    distance_event: row.distance_event,
    record_phase:
      latestByDistance.get(row.distance_event) === row.id ? ('other' as const) : ('pb_history' as const),
    time_text: row.time_text,
    time_seconds: row.time_seconds,
    measured_at: row.measured_at,
    notes: latestByDistance.get(row.distance_event) === row.id ? '개인 PB' : '이전 PB',
    created_at: row.created_at,
    updated_at: row.created_at,
  }))
}

function pbTrendRecordKey(record: Pick<RunningLeagueRecord, 'participant_id' | 'distance_event' | 'measured_at' | 'time_text'>): string {
  return `${record.participant_id}|${record.distance_event}|${record.measured_at.slice(0, 10)}|${record.time_text.trim()}`
}

/** PB 기록 목록(스냅샷)을 추이 그래프용 레코드에 합칩니다. */
export function expandPbTrendRecordsWithSnapshots(
  records: ReadonlyArray<RunningLeagueRecord>,
  snapshots: ReadonlyArray<PbSnapshotRow>,
): RunningLeagueRecord[] {
  const expanded = [...records]
  const seen = new Set(expanded.map((row) => pbTrendRecordKey(row)))

  for (const snap of snapshots) {
    if (!snap.time_text.trim()) continue
    const candidate: RunningLeagueRecord = {
      id: snap.id,
      participant_id: snap.participant_id,
      league_id: snap.league_id,
      member_id: snap.member_id,
      distance_event: snap.distance_event,
      record_phase: 'pb_history',
      time_text: snap.time_text.trim(),
      time_seconds: snap.time_seconds,
      measured_at: snap.measured_at,
      notes: 'PB 스냅샷',
      created_at: snap.created_at,
      updated_at: snap.created_at,
    }
    const key = pbTrendRecordKey(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    expanded.push(candidate)
  }

  return expanded
}
