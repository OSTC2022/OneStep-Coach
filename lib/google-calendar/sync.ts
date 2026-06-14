import 'server-only'

import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  GOOGLE_CALENDAR_SYNC_ID,
  GOOGLE_LESSON_CALENDAR_NAME,
  GOOGLE_LESSON_CALENDAR_NAMES,
  getGoogleCalendarWebhookSecret,
  getGoogleCalendarWebhookUrl,
} from '@/lib/google-calendar/config'
import {
  listGoogleCalendarEvents,
  listGoogleCalendars,
  stopGoogleCalendarWatch,
  watchGoogleCalendarEvents,
  withGoogleAccessToken,
} from '@/lib/google-calendar/client'
import {
  getGoogleRecentSyncWindow,
  getGoogleSyncTimeBounds,
  getGoogleUpdatedSince,
} from '@/lib/google-calendar/event-mapper'
import {
  applyGoogleEventsBatch,
  loadExistingByGoogleEventId,
  loadMemberNameMap,
} from '@/lib/google-calendar/sync-apply'
import type {
  GoogleCalendarEvent,
  GoogleCalendarSyncResult,
  GoogleCalendarSyncRow,
} from '@/lib/google-calendar/types'

const SYNC_SELECT =
  'id, connected_email, refresh_token, calendar_id, calendar_name, sync_token, watch_channel_id, watch_resource_id, watch_expiration, calendar_id_2, calendar_name_2, sync_token_2, watch_channel_id_2, watch_resource_id_2, watch_expiration_2, sync_enabled, last_synced_at, last_sync_error, pending_member_count, updated_at'

const MAX_FETCH_PAGES = 100

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
    calendar_id_2: patch.calendar_id_2 ?? current?.calendar_id_2 ?? null,
    calendar_name_2: patch.calendar_name_2 ?? current?.calendar_name_2 ?? null,
    sync_token_2: patch.sync_token_2 ?? current?.sync_token_2 ?? null,
    watch_channel_id_2:
      patch.watch_channel_id_2 ?? current?.watch_channel_id_2 ?? null,
    watch_resource_id_2:
      patch.watch_resource_id_2 ?? current?.watch_resource_id_2 ?? null,
    watch_expiration_2:
      patch.watch_expiration_2 ?? current?.watch_expiration_2 ?? null,
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

function mergeGoogleEventsById(
  ...lists: GoogleCalendarEvent[][]
): GoogleCalendarEvent[] {
  const map = new Map<string, GoogleCalendarEvent>()
  for (const list of lists) {
    for (const event of list) {
      if (event.id) map.set(event.id, event)
    }
  }
  return Array.from(map.values())
}

async function paginateGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  query: {
    timeMin?: string
    timeMax?: string
    updatedMin?: string
    orderBy?: 'startTime' | 'updated'
  },
): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken: string | null }> {
  const events: GoogleCalendarEvent[] = []
  let pageToken: string | null = null
  let nextSyncToken: string | null = null
  let pages = 0

  do {
    const response = await listGoogleCalendarEvents(accessToken, calendarId, {
      pageToken,
      ...query,
    })

    events.push(...(response.items ?? []))
    pageToken = response.nextPageToken ?? null
    if (response.nextSyncToken) {
      nextSyncToken = response.nextSyncToken
    }
    pages += 1
  } while (pageToken && pages < MAX_FETCH_PAGES)

  if (pageToken) {
    console.warn(
      `[google-calendar] event fetch capped at ${MAX_FETCH_PAGES} pages for calendar ${calendarId}`,
    )
  }

  return { events, nextSyncToken }
}

async function fetchEventsForSync(
  accessToken: string,
  calendarId: string,
  options?: { reason?: string },
): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken: string | null }> {
  const bounds =
    options?.reason === 'manual'
      ? getGoogleSyncTimeBounds()
      : getGoogleRecentSyncWindow()

  const [windowResult, recentUpdates] = await Promise.all([
    paginateGoogleCalendarEvents(accessToken, calendarId, {
      timeMin: bounds.timeMin,
      timeMax: bounds.timeMax,
      orderBy: 'startTime',
    }),
    paginateGoogleCalendarEvents(accessToken, calendarId, {
      updatedMin: getGoogleUpdatedSince(7),
      orderBy: 'updated',
    }),
  ])

  return {
    events: mergeGoogleEventsById(windowResult.events, recentUpdates.events),
    nextSyncToken: windowResult.nextSyncToken ?? recentUpdates.nextSyncToken,
  }
}

function buildLessonCalendarPatch(
  row: GoogleCalendarSyncRow,
  lessonCalendars: { id: string; summary: string }[],
): Partial<GoogleCalendarSyncRow> {
  const primary = lessonCalendars.find(
    (calendar) => calendar.summary === GOOGLE_LESSON_CALENDAR_NAME,
  )
  const secondary = lessonCalendars.find(
    (calendar) => calendar.summary !== GOOGLE_LESSON_CALENDAR_NAME,
  )

  const patch: Partial<GoogleCalendarSyncRow> = {}

  if (primary && primary.id !== row.calendar_id) {
    patch.calendar_id = primary.id
    patch.calendar_name = primary.summary
    patch.sync_token = null
    patch.watch_channel_id = null
    patch.watch_resource_id = null
    patch.watch_expiration = null
  }

  if (secondary?.id !== row.calendar_id_2) {
    patch.calendar_id_2 = secondary?.id ?? null
    patch.calendar_name_2 = secondary?.summary ?? null
    patch.sync_token_2 = null
    patch.watch_channel_id_2 = null
    patch.watch_resource_id_2 = null
    patch.watch_expiration_2 = null
  }

  return patch
}

async function refreshLessonCalendarIds(
  row: GoogleCalendarSyncRow,
  accessToken: string,
): Promise<GoogleCalendarSyncRow> {
  const calendars = await listGoogleCalendars(accessToken)
  const patch = buildLessonCalendarPatch(row, findLessonCalendars(calendars))
  if (Object.keys(patch).length === 0) return row
  return upsertGoogleCalendarSyncRow(patch)
}

export async function syncGoogleCalendarLessons(options?: {
  reason?: string
}): Promise<GoogleCalendarSyncResult> {
  let row = await getGoogleCalendarSyncRow()
  if (!row?.refresh_token || !row.calendar_id || !row.sync_enabled) {
    return { created: 0, updated: 0, linked: 0, cancelled: 0, pendingMember: 0, skipped: 0 }
  }

  const supabase = createAdminClient()

  try {
    const aggregated: GoogleCalendarSyncResult = {
      created: 0,
      updated: 0,
      linked: 0,
      cancelled: 0,
      pendingMember: 0,
      skipped: 0,
    }
    const syncTokenPatch: Partial<GoogleCalendarSyncRow> = {}

    await withGoogleAccessToken(row.refresh_token, async (accessToken) => {
      row = await refreshLessonCalendarIds(row!, accessToken)

      const calendarsToSync: {
        calendarId: string
        syncToken: string | null
        syncTokenKey: 'sync_token' | 'sync_token_2'
      }[] = [{ calendarId: row.calendar_id!, syncToken: row.sync_token, syncTokenKey: 'sync_token' }]

      if (row.calendar_id_2) {
        calendarsToSync.push({
          calendarId: row.calendar_id_2,
          syncToken: row.sync_token_2,
          syncTokenKey: 'sync_token_2',
        })
      }

      for (const calendar of calendarsToSync) {
        const { events, nextSyncToken } = await fetchEventsForSync(
          accessToken,
          calendar.calendarId,
          { reason: options?.reason },
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

        aggregated.created += result.created
        aggregated.updated += result.updated
        aggregated.linked += result.linked
        aggregated.cancelled += result.cancelled
        aggregated.pendingMember += result.pendingMember
        aggregated.skipped += result.skipped

        syncTokenPatch[calendar.syncTokenKey] = nextSyncToken

        if (options?.reason) {
          console.info('[google-calendar] sync complete', options.reason, {
            calendarId: calendar.calendarId,
            ...result,
            fetched: events.length,
            reason: options?.reason,
          })
        }
      }
    })

    const pendingCount = await countPendingMemberLessons(supabase)
    await upsertGoogleCalendarSyncRow({
      ...syncTokenPatch,
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
      pending_member_count: pendingCount,
    })

    return aggregated
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await upsertGoogleCalendarSyncRow({
      last_sync_error: message,
    })
    throw error
  }
}

type WatchChannelFields = {
  channelId: string | null
  resourceId: string | null
  expiration: string | null
}

async function ensureWatchForCalendar(
  accessToken: string,
  calendarId: string,
  watch: WatchChannelFields,
): Promise<{ watch_channel_id: string; watch_resource_id: string | null; watch_expiration: string }> {
  const expiresAt = watch.expiration ? Date.parse(watch.expiration) : 0
  const renewBeforeMs = 24 * 60 * 60 * 1000
  if (watch.channelId && watch.resourceId && expiresAt - Date.now() > renewBeforeMs) {
    return {
      watch_channel_id: watch.channelId,
      watch_resource_id: watch.resourceId,
      watch_expiration: watch.expiration!,
    }
  }

  if (watch.channelId && watch.resourceId) {
    try {
      await stopGoogleCalendarWatch(accessToken, watch.channelId, watch.resourceId)
    } catch {
      // ignore stale channel stop failures
    }
  }

  const channelId = randomUUID()
  const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000
  const nextWatch = await watchGoogleCalendarEvents(accessToken, calendarId, {
    id: channelId,
    address: getGoogleCalendarWebhookUrl(),
    token: getGoogleCalendarWebhookSecret(),
    expiration,
  })

  return {
    watch_channel_id: channelId,
    watch_resource_id: nextWatch.resourceId ?? null,
    watch_expiration: nextWatch.expiration
      ? new Date(Number(nextWatch.expiration)).toISOString()
      : new Date(expiration).toISOString(),
  }
}

export async function ensureGoogleCalendarWatch(): Promise<void> {
  let row = await getGoogleCalendarSyncRow()
  if (!row?.refresh_token || !row.calendar_id || !row.sync_enabled) return

  await withGoogleAccessToken(row.refresh_token, async (accessToken) => {
    row = await refreshLessonCalendarIds(row!, accessToken)

    const primaryWatch = await ensureWatchForCalendar(
      accessToken,
      row.calendar_id!,
      {
        channelId: row.watch_channel_id,
        resourceId: row.watch_resource_id,
        expiration: row.watch_expiration,
      },
    )

    const patch: Partial<GoogleCalendarSyncRow> = {
      watch_channel_id: primaryWatch.watch_channel_id,
      watch_resource_id: primaryWatch.watch_resource_id,
      watch_expiration: primaryWatch.watch_expiration,
    }

    if (row.calendar_id_2) {
      const secondaryWatch = await ensureWatchForCalendar(
        accessToken,
        row.calendar_id_2,
        {
          channelId: row.watch_channel_id_2,
          resourceId: row.watch_resource_id_2,
          expiration: row.watch_expiration_2,
        },
      )
      patch.watch_channel_id_2 = secondaryWatch.watch_channel_id
      patch.watch_resource_id_2 = secondaryWatch.watch_resource_id
      patch.watch_expiration_2 = secondaryWatch.watch_expiration
    }

    await upsertGoogleCalendarSyncRow(patch)
  })
}

export function findLessonCalendars(
  calendars: { id: string; summary?: string }[],
): { id: string; summary: string }[] {
  const found: { id: string; summary: string }[] = []
  for (const name of GOOGLE_LESSON_CALENDAR_NAMES) {
    const match = calendars.find((calendar) => calendar.summary?.trim() === name)
    if (match?.id) {
      found.push({ id: match.id, summary: match.summary!.trim() })
    }
  }
  return found
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

export function getConnectedCalendarNames(row: GoogleCalendarSyncRow | null): string[] {
  if (!row) return []
  return [row.calendar_name, row.calendar_name_2].filter(
    (name): name is string => Boolean(name?.trim()),
  )
}

export async function stopGoogleCalendarWatchForRow(
  row: GoogleCalendarSyncRow,
): Promise<void> {
  if (!row.refresh_token) return

  await withGoogleAccessToken(row.refresh_token, async (accessToken) => {
    const channels: { channelId: string; resourceId: string }[] = []
    if (row.watch_channel_id && row.watch_resource_id) {
      channels.push({
        channelId: row.watch_channel_id,
        resourceId: row.watch_resource_id,
      })
    }
    if (row.watch_channel_id_2 && row.watch_resource_id_2) {
      channels.push({
        channelId: row.watch_channel_id_2,
        resourceId: row.watch_resource_id_2,
      })
    }

    for (const channel of channels) {
      try {
        await stopGoogleCalendarWatch(
          accessToken,
          channel.channelId,
          channel.resourceId,
        )
      } catch {
        // ignore
      }
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
