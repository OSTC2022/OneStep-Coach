'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { formatGoogleCalendarSyncError } from '@/lib/google-calendar/errors'
import { requireRole } from '@/lib/actions/auth'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import { parseGoogleCalendarSyncDetail, buildGoogleCalendarSyncDetail, emptyRunStats } from '@/lib/google-calendar/sync-status'
import {
  clearGoogleCalendarSyncRow,
  countGoogleSyncChanges,
  ensureGoogleCalendarWatch,
  getConnectedCalendarNames,
  getGoogleCalendarSyncRow,
  isGoogleCalendarSyncInProgress,
  listPendingGoogleSyncLessons,
  stopGoogleCalendarWatchForRow,
  syncGoogleCalendarLessons,
  upsertGoogleCalendarSyncRow,
} from '@/lib/google-calendar/sync'
import type { GoogleCalendarSyncStatus } from '@/lib/google-calendar/types'

function buildStatusFromRow(
  row: Awaited<ReturnType<typeof getGoogleCalendarSyncRow>>,
): Omit<GoogleCalendarSyncStatus, 'configured'> {
  const calendarNames = getConnectedCalendarNames(row)
  const watchExpiresAt = row?.watch_expiration ?? null
  const watchExpiresAt2 = row?.watch_expiration_2 ?? null
  const watchActive = Boolean(
    (row?.watch_channel_id &&
      watchExpiresAt &&
      Date.parse(watchExpiresAt) > Date.now()) ||
      (row?.watch_channel_id_2 &&
        watchExpiresAt2 &&
        Date.parse(watchExpiresAt2) > Date.now()),
  )
  const detail = parseGoogleCalendarSyncDetail(row?.sync_status_detail)
  const isSyncing = row?.sync_status === 'syncing'

  return {
    connected: Boolean(row?.refresh_token && row.calendar_id),
    connectedEmail: row?.connected_email ?? null,
    calendarName: calendarNames.length > 0 ? calendarNames.join(', ') : null,
    calendarNames,
    syncEnabled: row?.sync_enabled ?? false,
    lastSyncedAt: row?.last_synced_at ?? null,
    lastSyncAttemptAt: row?.last_sync_attempt_at ?? null,
    lastSyncError: row?.last_sync_error ?? null,
    syncStatus: row?.sync_status ?? null,
    syncStatusDetail: row?.sync_status_detail ?? null,
    runStats: detail.run ?? null,
    isSyncing,
    pendingMemberCount: row?.pending_member_count ?? 0,
    watchActive,
    watchExpiresAt,
  }
}

export async function getGoogleCalendarSyncStatus(): Promise<GoogleCalendarSyncStatus> {
  await requireRole(['admin'])

  if (!isGoogleCalendarConfigured()) {
    return {
      configured: false,
      connected: false,
      connectedEmail: null,
      calendarName: null,
      calendarNames: [],
      syncEnabled: false,
      lastSyncedAt: null,
      lastSyncAttemptAt: null,
      lastSyncError: null,
      syncStatus: null,
      syncStatusDetail: null,
      runStats: null,
      isSyncing: false,
      pendingMemberCount: 0,
      watchActive: false,
      watchExpiresAt: null,
    }
  }

  const row = await getGoogleCalendarSyncRow()
  return {
    configured: true,
    ...buildStatusFromRow(row),
  }
}

export async function disconnectGoogleCalendar(): Promise<{ error?: string }> {
  await requireRole(['admin'])

  const row = await getGoogleCalendarSyncRow()
  if (row) {
    await stopGoogleCalendarWatchForRow(row)
  }
  await clearGoogleCalendarSyncRow()

  revalidatePath('/dashboard/settings/google-calendar')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/lesson-status')
  revalidatePath('/dashboard')

  return {}
}

export async function runGoogleCalendarSyncNow(): Promise<{
  started?: boolean
  error?: string
}> {
  await requireRole(['admin'])

  const row = await getGoogleCalendarSyncRow()
  if (isGoogleCalendarSyncInProgress(row)) {
    return { started: false, error: '이미 동기화가 진행 중입니다.' }
  }

  await upsertGoogleCalendarSyncRow({
    sync_status: 'syncing',
    last_sync_attempt_at: new Date().toISOString(),
    sync_status_detail: buildGoogleCalendarSyncDetail({ run: emptyRunStats() }),
  })

  after(async () => {
    try {
      await syncGoogleCalendarLessons({
        reason: 'manual',
        skipDedupe: Boolean(row?.sync_token),
      })
    } catch (error) {
      console.error(
        '[google-calendar] background sync failed:',
        error instanceof Error ? error.message : error,
      )
    } finally {
      revalidatePath('/dashboard/settings/google-calendar')
      revalidatePath('/dashboard/calendar')
      revalidatePath('/dashboard/lesson-status')
      revalidatePath('/dashboard')
    }
  })

  return { started: true }
}

export async function runGoogleCalendarFullResync(): Promise<{
  started?: boolean
  error?: string
}> {
  await requireRole(['admin'])

  const row = await getGoogleCalendarSyncRow()
  if (isGoogleCalendarSyncInProgress(row)) {
    return { started: false, error: '이미 동기화가 진행 중입니다.' }
  }

  await upsertGoogleCalendarSyncRow({
    sync_status: 'syncing',
    last_sync_attempt_at: new Date().toISOString(),
    sync_token: null,
    sync_token_2: null,
    sync_status_detail: buildGoogleCalendarSyncDetail({ run: emptyRunStats() }),
  })

  after(async () => {
    try {
      await syncGoogleCalendarLessons({
        reason: 'manual-full',
        forceFull: true,
      })
    } catch (error) {
      console.error(
        '[google-calendar] full resync failed:',
        error instanceof Error ? error.message : error,
      )
    } finally {
      revalidatePath('/dashboard/settings/google-calendar')
      revalidatePath('/dashboard/calendar')
      revalidatePath('/dashboard/lesson-status')
      revalidatePath('/dashboard')
    }
  })

  return { started: true }
}

export async function listGoogleCalendarPendingLessons() {
  await requireRole(['admin'])
  return listPendingGoogleSyncLessons()
}

export async function syncGoogleCalendarOnCalendarOpen(): Promise<{
  synced?: boolean
  changed?: number
}> {
  await requireRole(['admin', 'instructor'])

  if (!isGoogleCalendarConfigured()) {
    return { synced: false, changed: 0 }
  }

  const row = await getGoogleCalendarSyncRow()
  if (!row?.sync_enabled || !row.refresh_token || isGoogleCalendarSyncInProgress(row)) {
    return { synced: false, changed: 0 }
  }

  try {
    const result = await syncGoogleCalendarLessons({
      reason: 'calendar-open',
      skipDedupe: true,
      lightweight: true,
    })
    const changed = countGoogleSyncChanges(result)
    revalidatePath('/dashboard/calendar')
    revalidatePath('/dashboard/lesson-status')
    return { synced: true, changed }
  } catch (error) {
    console.error(
      '[google-calendar] calendar-open sync failed:',
      error instanceof Error ? error.message : error,
    )
    return { synced: false, changed: 0 }
  }
}

type PullResult = {
  synced: boolean
  changed: number
  skipped?: boolean
}

let pullInFlight: Promise<PullResult> | null = null

/** 캘린더 폴링 활성 여부 (환경 변수 + DB 연결) */
export async function isGoogleCalendarPollingEnabled(): Promise<boolean> {
  if (!isGoogleCalendarConfigured()) return false
  const row = await getGoogleCalendarSyncRow()
  return Boolean(row?.sync_enabled && row.refresh_token)
}

/** Google → 센터 초고속 증분 동기화 (캘린더 폴링용) */
export async function pullGoogleCalendarChanges(): Promise<PullResult> {
  if (pullInFlight) return pullInFlight

  pullInFlight = (async () => {
    await requireRole(['admin', 'instructor'])

    if (!isGoogleCalendarConfigured()) {
      return { synced: false, changed: 0, skipped: true }
    }

    const row = await getGoogleCalendarSyncRow()
    if (!row?.sync_enabled || !row.refresh_token) {
      return { synced: false, changed: 0, skipped: true }
    }
    if (isGoogleCalendarSyncInProgress(row)) {
      return { synced: false, changed: 0, skipped: true }
    }

    try {
      const result = await syncGoogleCalendarLessons({
        reason: 'poll',
        skipDedupe: true,
        lightweight: true,
      })
      const changed = countGoogleSyncChanges(result)
      return { synced: true, changed }
    } catch (error) {
      if (isGoogleCalendarConfigured()) {
        console.error(
          '[google-calendar] poll sync failed:',
          error instanceof Error ? error.message : error,
        )
      }
      return { synced: false, changed: 0 }
    }
  })().finally(() => {
    pullInFlight = null
  })

  return pullInFlight
}

export async function refreshGoogleCalendarWatchAction(): Promise<{ error?: string }> {
  await requireRole(['admin'])
  try {
    await ensureGoogleCalendarWatch()
    revalidatePath('/dashboard/settings/google-calendar')
    return {}
  } catch (error) {
    return { error: formatGoogleCalendarSyncError(error) }
  }
}
