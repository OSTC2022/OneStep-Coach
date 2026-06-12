'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/actions/auth'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import {
  clearGoogleCalendarSyncRow,
  ensureGoogleCalendarWatch,
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
      syncEnabled: false,
      lastSyncedAt: null,
      lastSyncError: null,
      pendingMemberCount: 0,
      watchActive: false,
      watchExpiresAt: null,
    }
  }

  const row = await getGoogleCalendarSyncRow()
  const watchExpiresAt = row?.watch_expiration ?? null
  const watchActive = Boolean(
    row?.watch_channel_id &&
      watchExpiresAt &&
      Date.parse(watchExpiresAt) > Date.now(),
  )

  return {
    configured: true,
    connected: Boolean(row?.refresh_token && row.calendar_id),
    connectedEmail: row?.connected_email ?? null,
    calendarName: row?.calendar_name ?? null,
    syncEnabled: row?.sync_enabled ?? false,
    lastSyncedAt: row?.last_synced_at ?? null,
    lastSyncError: row?.last_sync_error ?? null,
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
}> {
  await requireRole(['admin'])

  try {
    const data = await syncGoogleCalendarLessons({ reason: 'manual' })
    revalidatePath('/dashboard/settings/google-calendar')
    revalidatePath('/dashboard/calendar')
    revalidatePath('/dashboard')
    return { data }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
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
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
