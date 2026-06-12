import 'server-only'

import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  GOOGLE_CALENDAR_SYNC_ID,
  GOOGLE_LESSON_CALENDAR_NAME,
  getGoogleCalendarWebhookSecret,
  getGoogleCalendarWebhookUrl,
} from '@/lib/google-calendar/config'
import {
  listGoogleCalendarEvents,
  stopGoogleCalendarWatch,
  watchGoogleCalendarEvents,
  withGoogleAccessToken,
} from '@/lib/google-calendar/client'
import { getGoogleSyncTimeBounds } from '@/lib/google-calendar/event-mapper'
import {
  applyGoogleEventsBatch,
  loadExistingByGoogleEventId,
  loadMemberNameMap,
  MAX_EVENTS_PER_SYNC,
} from '@/lib/google-calendar/sync-apply'
import type {
  GoogleCalendarEvent,
  GoogleCalendarSyncResult,
  GoogleCalendarSyncRow,
} from '@/lib/google-calendar/types'

const SYNC_SELECT =
  'id, connected_email, refresh_token, calendar_id, calendar_name, sync_token, watch_channel_id, watch_resource_id, watch_expiration, sync_enabled, last_synced_at, last_sync_error, pending_member_count, updated_at'

const MAX_FETCH_PAGES = 1

function isMissingGoogleSyncTable(error: { message?: string; code?: string } | null) {
  if (!error) return false
  const message = error.message ?? ''
  return (
    error.code === '42P01' ||
    message.includes('google_calendar_sync') ||
    message.includes('schema cache')
  )
}

function isMissingGoogleLessonColumn(error: { message?: string } | null) {
  if (!error) return false
  const message = error.message ?? ''
  return message.includes('google_event_id') || message.includes('google_sync_status')
}

export async function getGoogleCalendarSyncRow(): Promise<GoogleCalendarSyncRow | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('google_calendar_sync')
    .select(SYNC_SELECT)
    .eq('id', GOOGLE_CALENDAR_SYNC_ID)
    .maybeSingle()

  if (error) {
    if (isMissingGoogleSyncTable(error)) return null
    throw new Error(error.message)
  }

  return (data as GoogleCalendarSyncRow | null) ?? null
}

export async function upsertGoogleCalendarSyncRow(
  patch: Partial<Omit<GoogleCalendarSyncRow, 'id' | 'updated_at'>>,
): Promise<GoogleCalendarSyncRow> {
  const supabase = createAdminClient()
  const current = await getGoogleCalendarSyncRow()
  const payload = {
    id: GOOGLE_CALENDAR_SYNC_ID,
    connected_email: patch.connected_email ?? current?.connected_email ?? null,
    refresh_token: patch.refresh_token ?? current?.refresh_token ?? null,
    calendar_id: patch.calendar_id ?? current?.calendar_id ?? null,
    calendar_name: patch.calendar_name ?? current?.calendar_name ?? null,
    sync_token: patch.sync_token ?? current?.sync_token ?? null,
    watch_channel_id: patch.watch_channel_id ?? current?.watch_channel_id ?? null,
    watch_resource_id: patch.watch_resource_id ?? current?.watch_resource_id ?? null,
    watch_expiration: patch.watch_expiration ?? current?.watch_expiration ?? null,
    sync_enabled: patch.sync_enabled ?? current?.sync_enabled ?? false,
    last_synced_at: patch.last_synced_at ?? current?.last_synced_at ?? null,
    last_sync_error: patch.last_sync_error ?? current?.last_sync_error ?? null,
    pending_member_count:
      patch.pending_member_count ?? current?.pending_member_count ?? 0,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('google_calendar_sync')
    .upsert(payload)
    .select(SYNC_SELECT)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as GoogleCalendarSyncRow
}

export async function clearGoogleCalendarSyncRow(): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('google_calendar_sync').delete().eq('id', GOOGLE_CALENDAR_SYNC_ID)
}

async function countPendingMemberLessons(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const { count, error } = await supabase
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('google_sync_status', 'pending_member')

  if (error) {
    if (isMissingGoogleLessonColumn(error)) return 0
    return 0
  }

  return count ?? 0
}

async function fetchChangedEventsFast(
  accessToken: string,
  calendarId: string,
  syncToken: string | null,
): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken: string | null }> {
  const events: GoogleCalendarEvent[] = []
  let pageToken: string | null = null
  let nextSyncToken: string | null = syncToken
  let useFullSync = !syncToken
  let pages = 0

  do {
    try {
      const bounds = getGoogleSyncTimeBounds()
      const response = await listGoogleCalendarEvents(accessToken, calendarId, {
        syncToken: useFullSync ? null : nextSyncToken,
        pageToken,
        timeMin: useFullSync ? bounds.timeMin : undefined,
        timeMax: useFullSync ? bounds.timeMax : undefined,
      })

      events.push(...(response.items ?? []))
      pageToken = response.nextPageToken ?? null
      if (response.nextSyncToken) {
        nextSyncToken = response.nextSyncToken
      }
      pages += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!useFullSync && message.includes('410')) {
        useFullSync = true
        pageToken = null
        nextSyncToken = null
        pages = 0
        continue
      }
      throw error
    }
  } while (pageToken && pages < MAX_FETCH_PAGES)

  return { events, nextSyncToken }
}

export async function syncGoogleCalendarLessons(options?: {
  reason?: string
}): Promise<GoogleCalendarSyncResult> {
  const row = await getGoogleCalendarSyncRow()
  if (!row?.refresh_token || !row.calendar_id || !row.sync_enabled) {
    return { created: 0, updated: 0, linked: 0, cancelled: 0, pendingMember: 0, skipped: 0 }
  }

  const supabase = createAdminClient()

  try {
    const syncResult = await withGoogleAccessToken(
      row.refresh_token,
      async (accessToken) => {
        const { events, nextSyncToken } = await fetchChangedEventsFast(
          accessToken,
          row.calendar_id!,
          row.sync_token,
        )

        const googleEventIds = events
          .map((event) => event.id)
          .filter((id): id is string => Boolean(id))

        const [memberMap, existingMap] = await Promise.all([
          loadMemberNameMap(supabase),
          loadExistingByGoogleEventId(supabase, googleEventIds),
        ])

        const result = await applyGoogleEventsBatch(
          supabase,
          events,
          memberMap,
          existingMap,
        )

        const pendingCount = await countPendingMemberLessons(supabase)
        await upsertGoogleCalendarSyncRow({
          sync_token: nextSyncToken,
          last_synced_at: new Date().toISOString(),
          last_sync_error: null,
          pending_member_count: pendingCount,
        })

        if (options?.reason) {
          console.info('[google-calendar] sync complete', options.reason, {
            ...result,
            fetched: events.length,
            capped: events.length > MAX_EVENTS_PER_SYNC,
          })
        }

        return result
      },
    )

    return syncResult
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await upsertGoogleCalendarSyncRow({
      last_sync_error: message,
    })
    throw error
  }
}

export async function ensureGoogleCalendarWatch(): Promise<void> {
  const row = await getGoogleCalendarSyncRow()
  if (!row?.refresh_token || !row.calendar_id || !row.sync_enabled) return

  const expiresAt = row.watch_expiration ? Date.parse(row.watch_expiration) : 0
  const renewBeforeMs = 24 * 60 * 60 * 1000
  if (expiresAt - Date.now() > renewBeforeMs) return

  await withGoogleAccessToken(row.refresh_token, async (accessToken) => {
    if (row.watch_channel_id && row.watch_resource_id) {
      try {
        await stopGoogleCalendarWatch(
          accessToken,
          row.watch_channel_id,
          row.watch_resource_id,
        )
      } catch {
        // ignore stale channel stop failures
      }
    }

    const channelId = randomUUID()
    const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000
    const watch = await watchGoogleCalendarEvents(
      accessToken,
      row.calendar_id!,
      {
        id: channelId,
        address: getGoogleCalendarWebhookUrl(),
        token: getGoogleCalendarWebhookSecret(),
        expiration,
      },
    )

    await upsertGoogleCalendarSyncRow({
      watch_channel_id: channelId,
      watch_resource_id: watch.resourceId ?? null,
      watch_expiration: watch.expiration
        ? new Date(Number(watch.expiration)).toISOString()
        : new Date(expiration).toISOString(),
    })
  })
}

export function findLessonCalendarId(
  calendars: { id: string; summary?: string }[],
): { id: string; summary: string } | null {
  const match = calendars.find(
    (calendar) => calendar.summary?.trim() === GOOGLE_LESSON_CALENDAR_NAME,
  )
  if (!match?.id) return null
  return { id: match.id, summary: match.summary!.trim() }
}

export async function stopGoogleCalendarWatchForRow(
  row: GoogleCalendarSyncRow,
): Promise<void> {
  if (!row.refresh_token || !row.watch_channel_id || !row.watch_resource_id) return

  await withGoogleAccessToken(row.refresh_token, async (accessToken) => {
    try {
      await stopGoogleCalendarWatch(
        accessToken,
        row.watch_channel_id!,
        row.watch_resource_id!,
      )
    } catch {
      // ignore
    }
  })
}

export async function listPendingGoogleSyncLessons(limit = 20) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('lessons')
    .select('id, title, lesson_date, start_time, created_at')
    .eq('google_sync_status', 'pending_member')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (isMissingGoogleLessonColumn(error)) return []
    return []
  }

  return data ?? []
}
