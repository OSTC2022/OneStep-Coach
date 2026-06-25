import type { RunningLeagueDistanceEvent, RunningLeagueRecord } from '@/lib/types'

export type PbPortalHistoryEntry = {
  time_text: string
  time_seconds: number | null
  measured_at: string
  archived_at: string
}

type PbPortalNotesPayload = {
  label: string
  history: PbPortalHistoryEntry[]
}

function isPbPortalNotesPayload(value: unknown): value is PbPortalNotesPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as PbPortalNotesPayload
  return Array.isArray(payload.history)
}

/** other 행 notes 에 JSON 이력이 있으면 파싱 */
export function parsePbPortalNotes(notes: string | null | undefined): PbPortalNotesPayload {
  const raw = notes?.trim() ?? ''
  if (!raw.startsWith('{')) {
    return { label: raw || '개인 PB', history: [] }
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isPbPortalNotesPayload(parsed)) {
      return { label: raw || '개인 PB', history: [] }
    }
    return {
      label: typeof parsed.label === 'string' ? parsed.label : '개인 PB',
      history: parsed.history.filter(
        (entry) =>
          typeof entry.time_text === 'string' &&
          typeof entry.measured_at === 'string' &&
          entry.time_text.trim().length > 0,
      ),
    }
  } catch {
    return { label: raw || '개인 PB', history: [] }
  }
}

export function serializePbPortalNotes(
  label: string,
  history: ReadonlyArray<PbPortalHistoryEntry>,
): string {
  if (history.length === 0) return label
  return JSON.stringify({ label, history })
}

export function noteHistoryRecordId(
  distance: RunningLeagueDistanceEvent,
  entry: Pick<PbPortalHistoryEntry, 'measured_at' | 'time_text'>,
): string {
  return `note:${distance}:${entry.measured_at}|${entry.time_text}`
}

export function isNoteHistoryRecordId(recordId: string): boolean {
  return recordId.startsWith('note:')
}

export function isCurrentPortalRecordId(recordId: string): boolean {
  return recordId.startsWith('current:')
}

export function parseCurrentPortalRecordId(recordId: string): {
  distance_event: RunningLeagueDistanceEvent
  measured_at: string
  time_text: string
} | null {
  if (!isCurrentPortalRecordId(recordId)) return null
  const body = recordId.slice('current:'.length)
  const firstPipe = body.indexOf('|')
  const secondPipe = body.indexOf('|', firstPipe + 1)
  if (firstPipe === -1 || secondPipe === -1) return null
  const distance_event = body.slice(0, firstPipe)
  const measured_at = body.slice(firstPipe + 1, secondPipe)
  const time_text = body.slice(secondPipe + 1)
  if (!distance_event || !measured_at || !time_text) return null
  return {
    distance_event: distance_event as RunningLeagueDistanceEvent,
    measured_at,
    time_text,
  }
}

export function parseNoteHistoryRecordId(recordId: string): {
  distance: RunningLeagueDistanceEvent
  measured_at: string
  time_text: string
} | null {
  if (!isNoteHistoryRecordId(recordId)) return null
  const body = recordId.slice('note:'.length)
  const colonIndex = body.indexOf(':')
  if (colonIndex === -1) return null
  const distance = body.slice(0, colonIndex)
  const rest = body.slice(colonIndex + 1)
  const pipeIndex = rest.indexOf('|')
  if (pipeIndex === -1) return null
  const measured_at = rest.slice(0, pipeIndex)
  const time_text = rest.slice(pipeIndex + 1)
  if (!distance || !measured_at || !time_text) return null
  return {
    distance: distance as RunningLeagueDistanceEvent,
    measured_at,
    time_text,
  }
}

function historyEntryToRecord(
  row: RunningLeagueRecord,
  entry: PbPortalHistoryEntry,
  index: number,
): RunningLeagueRecord {
  return {
    id: noteHistoryRecordId(row.distance_event, entry),
    participant_id: row.participant_id,
    league_id: row.league_id,
    member_id: row.member_id,
    distance_event: row.distance_event,
    record_phase: 'pb_history',
    time_text: entry.time_text,
    time_seconds: entry.time_seconds,
    measured_at: entry.measured_at,
    notes: '이전 PB',
    created_at: entry.archived_at,
    updated_at: entry.archived_at,
  }
}

/** DB pb_history + other.notes 이력을 합쳐 추이/목록용 레코드로 확장 */
export function expandPortalPbRecordsWithNotesHistory(
  records: ReadonlyArray<RunningLeagueRecord>,
): RunningLeagueRecord[] {
  const expanded: RunningLeagueRecord[] = [...records]
  const seen = new Set(
    records
      .filter((row) => row.record_phase === 'pb_history')
      .map((row) => `${row.distance_event}:${row.measured_at}:${row.time_text}`),
  )

  for (const row of records) {
    if (row.record_phase !== 'other') continue
    const { history } = parsePbPortalNotes(row.notes)
    history.forEach((entry, index) => {
      const key = `${row.distance_event}:${entry.measured_at}:${entry.time_text}`
      if (seen.has(key)) return
      seen.add(key)
      expanded.push(historyEntryToRecord(row, entry, index))
    })
  }

  return expanded
}

export function listPortalPbHistoryForDistance(
  records: ReadonlyArray<RunningLeagueRecord>,
  distance: RunningLeagueDistanceEvent,
): RunningLeagueRecord[] {
  return expandPortalPbRecordsWithNotesHistory(records)
    .filter((row) => row.distance_event === distance && row.record_phase === 'pb_history')
    .sort((a, b) => {
      const byDate = b.measured_at.localeCompare(a.measured_at)
      if (byDate !== 0) return byDate
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
    })
}

export type PortalPbRecordListItem = {
  id: string
  distance_event: RunningLeagueDistanceEvent
  time_text: string
  measured_at: string
  isCurrent: boolean
}

/** 종목별 PB 기록 목록 — 현재 + 이전 이력, 최신순 */
export function buildPortalPbRecordListForDistance(
  records: ReadonlyArray<RunningLeagueRecord>,
  distance: RunningLeagueDistanceEvent,
): PortalPbRecordListItem[] {
  const expanded = expandPortalPbRecordsWithNotesHistory(records)
  const currentRow = expanded.find(
    (row) =>
      row.distance_event === distance &&
      row.record_phase === 'other' &&
      row.time_text?.trim(),
  )

  const items: PortalPbRecordListItem[] = []

  for (const row of expanded) {
    if (row.distance_event !== distance) continue
    if (row.record_phase !== 'pb_history' || !row.time_text?.trim()) continue
    items.push({
      id: row.id,
      distance_event: distance,
      time_text: row.time_text.trim(),
      measured_at: row.measured_at,
      isCurrent: false,
    })
  }

  if (currentRow?.time_text?.trim()) {
    items.push({
      id: currentRow.id,
      distance_event: distance,
      time_text: currentRow.time_text.trim(),
      measured_at: currentRow.measured_at,
      isCurrent: true,
    })
  }

  return sortPortalPbRecordListItems(items)
}

function portalPbRecordKey(
  item: Pick<PortalPbRecordListItem, 'distance_event' | 'measured_at' | 'time_text'>,
): string {
  return `${item.distance_event}|${item.measured_at.slice(0, 10)}|${item.time_text.trim()}`
}

function sortPortalPbRecordListItems(items: PortalPbRecordListItem[]): PortalPbRecordListItem[] {
  return [...items].sort((a, b) => {
    const byDate = b.measured_at.localeCompare(a.measured_at)
    if (byDate !== 0) return byDate
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
    return a.time_text.localeCompare(b.time_text, 'ko')
  })
}

/** 스냅샷·DB 이력 목록을 합치고 현재 PB를 표시합니다. */
export function mergePortalPbRecordLists(
  lists: ReadonlyArray<ReadonlyArray<PortalPbRecordListItem>>,
  current?: (Pick<PortalPbRecordListItem, 'distance_event' | 'measured_at' | 'time_text'> & {
    id?: string
  }) | null,
): PortalPbRecordListItem[] {
  const byKey = new Map<string, PortalPbRecordListItem>()

  for (const list of lists) {
    for (const item of list) {
      if (!item.time_text.trim()) continue
      const key = portalPbRecordKey(item)
      const existing = byKey.get(key)
      if (!existing || item.isCurrent) {
        byKey.set(key, { ...item, isCurrent: false })
      }
    }
  }

  let items = sortPortalPbRecordListItems([...byKey.values()])

  if (current?.time_text?.trim()) {
    const currentKey = portalPbRecordKey(current)
    const hasCurrent = items.some((item) => portalPbRecordKey(item) === currentKey)
    if (!hasCurrent) {
      const currentId =
        'id' in current && typeof current.id === 'string' && current.id.trim()
          ? current.id
          : `current:${currentKey}`
      items = sortPortalPbRecordListItems([
        ...items,
        {
          id: currentId,
          distance_event: current.distance_event,
          time_text: current.time_text.trim(),
          measured_at: current.measured_at.slice(0, 10),
          isCurrent: true,
        },
      ])
    }
    items = items.map((item) => ({
      ...item,
      isCurrent: portalPbRecordKey(item) === currentKey,
    }))
  } else if (items.length > 0 && !items.some((item) => item.isCurrent)) {
    items = items.map((item, index) => ({ ...item, isCurrent: index === 0 }))
  }

  return items
}

/** 서버 목록이 비었을 때 PB 레코드에서 목록을 복원합니다. */
export function resolvePortalPbRecordList(
  records: ReadonlyArray<RunningLeagueRecord>,
  distance: RunningLeagueDistanceEvent,
  serverItems: ReadonlyArray<PortalPbRecordListItem>,
): PortalPbRecordListItem[] {
  const fromRecords = buildPortalPbRecordListForDistance(
    expandPortalPbRecordsWithNotesHistory(records),
    distance,
  )
  const currentRow = fromRecords.find((item) => item.isCurrent) ?? fromRecords[0] ?? null
  return mergePortalPbRecordLists([serverItems, fromRecords], currentRow)
}

const ALL_PB_LIST_DISTANCES: RunningLeagueDistanceEvent[] = ['5km', '10km', 'half', 'full']

/** 종목 전체 PB 기록 목록 — 날짜순 */
export function mergeAllDistancePbRecordLists(
  lists: ReadonlyArray<ReadonlyArray<PortalPbRecordListItem>>,
): PortalPbRecordListItem[] {
  const byKey = new Map<string, PortalPbRecordListItem>()
  for (const list of lists) {
    for (const item of list) {
      if (!item.time_text.trim()) continue
      const key = portalPbRecordKey(item)
      const existing = byKey.get(key)
      if (!existing || item.isCurrent) {
        byKey.set(key, item)
      }
    }
  }
  return sortPortalPbRecordListItems([...byKey.values()])
}

export function resolvePortalPbRecordListAll(
  records: ReadonlyArray<RunningLeagueRecord>,
  serverItems: ReadonlyArray<PortalPbRecordListItem>,
): PortalPbRecordListItem[] {
  const fromRecords = mergeAllDistancePbRecordLists(
    ALL_PB_LIST_DISTANCES.map((distance) =>
      buildPortalPbRecordListForDistance(expandPortalPbRecordsWithNotesHistory(records), distance),
    ),
  )
  return mergeAllDistancePbRecordLists([serverItems, fromRecords])
}

export { ALL_PB_LIST_DISTANCES }
