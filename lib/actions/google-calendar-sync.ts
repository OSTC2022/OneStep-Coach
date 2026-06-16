'use server'

import { revalidatePath } from 'next/cache'
import { formatGoogleCalendarSyncError } from '@/lib/google-calendar/errors'
import { requireRole } from '@/lib/actions/auth'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import {
  clearGoogleCalendarSyncRow,
  ensureGoogleCalendarWatch,
  getConnectedCalendarNames,
  getGoogleCalendarSyncRow,
  listPendingGoogleSyncLessons,
  stopGoogleCalendarWatchForRow,
  syncGoogleCalendarLessons,
} from '@/lib/google-calendar/sync'
import type {
  GoogleCalendarSyncResult,
  GoogleCalendarSyncStatus,
} from '@/lib/google-calendar/types'

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
      pendingMemberCount: 0,
      watchActive: false,
      watchExpiresAt: null,
    }
  }

  const row = await getGoogleCalendarSyncRow()
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

  return {
    configured: true,
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
    pendingMemberCount: row?.pending_member_count ?? 0,
    watchActive,
    watchExpiresAt,
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
  revalidatePath('/dashboard')

  return {}
}

export async function runGoogleCalendarSyncNow(): Promise<{
  data?: GoogleCalendarSyncResult
  error?: string
  warning?: string
}> {
  await requireRole(['admin'])

  try {
    const data = await syncGoogleCalendarLessons({ reason: 'manual' })
    revalidatePath('/dashboard/settings/google-calendar')
    revalidatePath('/dashboard/calendar')
    revalidatePath('/dashboard')

    if (data.syncStatus === 'partial_success') {
      const row = await getGoogleCalendarSyncRow()
      return {
        data,
        warning: row?.last_sync_error ?? '일부 캘린더만 동기화되었습니다.',
      }
    }

    return { data }
  } catch (error) {
    const message = formatGoogleCalendarSyncError(error)
    return { error: message }
  }
}

export async function listGoogleCalendarPendingLessons() {
  await requireRole(['admin'])
  return listPendingGoogleSyncLessons()
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
