import 'server-only'

import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import {
  countGoogleSyncChanges,
  ensureGoogleCalendarWatch,
  getGoogleCalendarSyncRow,
  isGoogleCalendarSyncInProgress,
  syncGoogleCalendarLessons,
} from '@/lib/google-calendar/sync'

/** 마지막 성공 동기화가 이 시간보다 오래되면 cron에서 상태까지 갱신 */
const STALE_SYNC_MS = 20 * 60 * 1000

function isWatchActive(row: NonNullable<Awaited<ReturnType<typeof getGoogleCalendarSyncRow>>>) {
  const primaryExpires = row.watch_expiration ? Date.parse(row.watch_expiration) : 0
  const secondaryExpires = row.watch_expiration_2 ? Date.parse(row.watch_expiration_2) : 0
  return (
    (row.watch_channel_id && primaryExpires > Date.now()) ||
    (row.watch_channel_id_2 && secondaryExpires > Date.now())
  )
}

function isSyncStale(row: NonNullable<Awaited<ReturnType<typeof getGoogleCalendarSyncRow>>>) {
  if (!row.last_synced_at) return true
  const lastSyncedMs = Date.parse(row.last_synced_at)
  if (!Number.isFinite(lastSyncedMs)) return true
  return Date.now() - lastSyncedMs > STALE_SYNC_MS
}

/** Vercel Cron — Push 채널 갱신 + Google→센터 증분 동기화 (캘린더 페이지 없을 때도 동작) */
export async function runGoogleCalendarCronSync(): Promise<{
  ok: boolean
  skipped?: boolean
  reason?: string
  changed?: number
  error?: string
}> {
  if (!isGoogleCalendarConfigured()) {
    return { ok: true, skipped: true, reason: 'not_configured' }
  }

  const row = await getGoogleCalendarSyncRow()
  if (!row?.refresh_token || !row.calendar_id || !row.sync_enabled) {
    return { ok: true, skipped: true, reason: 'not_connected' }
  }

  if (isGoogleCalendarSyncInProgress(row)) {
    return { ok: true, skipped: true, reason: 'sync_in_progress' }
  }

  try {
    await ensureGoogleCalendarWatch()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[google-calendar] cron watch renew failed:', message)
    return { ok: false, error: message }
  }

  const stale = isSyncStale(row)
  const watchWasInactive = !isWatchActive(row)

  try {
    const result = await syncGoogleCalendarLessons({
      reason: 'cron',
      skipDedupe: true,
      lightweight: !stale && !watchWasInactive,
      forceFull: !row.sync_token && !row.sync_token_2,
    })
    const changed = countGoogleSyncChanges(result)
    return { ok: true, changed }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[google-calendar] cron sync failed:', message)
    return { ok: false, error: message }
  }
}
