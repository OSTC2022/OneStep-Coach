import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/admin'

type LessonGoogleRow = {
  id: string
  google_event_id: string | null
  google_calendar_id: string | null
  google_account_id: string | null
  session_deducted: boolean | null
  created_at: string | null
}

function compositeKey(row: LessonGoogleRow): string | null {
  if (!row.google_event_id) return null
  if (row.google_account_id && row.google_calendar_id) {
    return `${row.google_account_id}|${row.google_calendar_id}|${row.google_event_id}`
  }
  return `event:${row.google_event_id}`
}

function pickKeeper(rows: LessonGoogleRow[]): LessonGoogleRow {
  return rows.reduce((best, row) => {
    if (row.session_deducted && !best.session_deducted) return row
    if (!row.session_deducted && best.session_deducted) return best
    const rowCreated = row.created_at ? Date.parse(row.created_at) : 0
    const bestCreated = best.created_at ? Date.parse(best.created_at) : 0
    return rowCreated <= bestCreated ? best : row
  })
}

/**
 * google_event_id 기준 중복 임시 일정 정리 (세션 차감된 행 우선 보존)
 */
export async function dedupeGoogleCalendarLessons(): Promise<number> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('lessons')
    .select('id, google_event_id, google_calendar_id, google_account_id, session_deducted, created_at')
    .not('google_event_id', 'is', null)

  if (error) {
    if (error.message.includes('google_event_id')) return 0
    throw new Error(error.message)
  }

  const groups = new Map<string, LessonGoogleRow[]>()
  for (const row of (data ?? []) as LessonGoogleRow[]) {
    const key = compositeKey(row)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const deleteIds: string[] = []
  for (const rows of groups.values()) {
    if (rows.length <= 1) continue
    const keeper = pickKeeper(rows)
    for (const row of rows) {
      if (row.id !== keeper.id && !row.session_deducted) {
        deleteIds.push(row.id)
      }
    }
  }

  if (deleteIds.length === 0) return 0

  const chunkSize = 100
  for (let i = 0; i < deleteIds.length; i += chunkSize) {
    const chunk = deleteIds.slice(i, i + chunkSize)
    const { error: deleteError } = await supabase.from('lessons').delete().in('id', chunk)
    if (deleteError) throw new Error(deleteError.message)
  }

  return deleteIds.length
}
