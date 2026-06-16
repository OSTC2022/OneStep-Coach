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
  type GoogleEventsFullListQuery,
  type GoogleEventsIncrementalListQuery,
} from '@/lib/google-calendar/client'
import {
  formatGoogleCalendarSyncError,
  isGoogleCalendarInvalidSyncQuery,
} from '@/lib/google-calendar/errors'
import {
  getGoogleRecentSyncWindow,
  getGoogleSyncTimeBounds,
} from '@/lib/google-calendar/event-mapper'
import {
  applyGoogleEventsBatch,
  loadExistingByGoogleEventId,
  loadMemberNameMap,
} from '@/lib/google-calendar/sync-apply'
import { dedupeGoogleCalendarLessons } from '@/lib/google-calendar/sync-dedupe'
import type {
  GoogleCalendarEvent,
  GoogleCalendarSyncResult,
  GoogleCalendarSyncRow,
  GoogleCalendarSyncStatusValue,
} from '@/lib/google-calendar/types'

const SYNC_SELECT =
  'id, connected_email, refresh_token, calendar_id, calendar_name, sync_token, watch_channel_id, watch_resource_id, watch_expiration, calendar_id_2, calendar_name_2, sync_token_2, watch_channel_id_2, watch_resource_id_2, watch_expiration_2, sync_enabled, last_synced_at, last_sync_attempt_at, last_sync_error, sync_status, sync_status_detail, pending_member_count, updated_at'

const SYNC_ROW_DEFAULTS: Omit<GoogleCalendarSyncRow, 'id' | 'updated_at'> = {
  connected_email: null,
  refresh_token: null,
  calendar_id: null,
  calendar_name: null,
  sync_token: null,
  watch_channel_id: null,
  watch_resource_id: null,
  watch_expiration: null,
  calendar_id_2: null,
  calendar_name_2: null,
  sync_token_2: null,
  watch_channel_id_2: null,
  watch_resource_id_2: null,
  watch_expiration_2: null,
  sync_enabled: false,
  last_synced_at: null,
  last_sync_attempt_at: null,
  last_sync_error: null,
  sync_status: null,
  sync_status_detail: null,
  pending_member_count: 0,
}

type SyncCalendarOutcome = {
  calendarName: string
  calendarId: string
  ok: boolean
  error?: string
  fetched?: number
}

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
    if (
      error.message.includes('last_sync_attempt_at') ||
      error.message.includes('sync_status')
    ) {
      const legacy = await supabase
        .from('google_calendar_sync')
        .select(
          'id, connected_email, refresh_token, calendar_id, calendar_name, sync_token, watch_channel_id, watch_resource_id, watch_expiration, calendar_id_2, calendar_name_2, sync_token_2, watch_channel_id_2, watch_resource_id_2, watch_expiration_2, sync_enabled, last_synced_at, last_sync_error, pending_member_count, updated_at',
        )
        .eq('id', GOOGLE_CALENDAR_SYNC_ID)
        .maybeSingle()
      if (legacy.error) throw new Error(legacy.error.message)
      if (!legacy.data) return null
      return {
        ...SYNC_ROW_DEFAULTS,
        ...(legacy.data as GoogleCalendarSyncRow),
        id: GOOGLE_CALENDAR_SYNC_ID,
      }
    }
    throw new Error(error.message)
  }

  if (!data) return null
  return {
    ...SYNC_ROW_DEFAULTS,
    ...(data as GoogleCalendarSyncRow),
  }
}

export async function upsertGoogleCalendarSyncRow(
  patch: Partial<Omit<GoogleCalendarSyncRow, 'id' | 'updated_at'>>,
): Promise<GoogleCalendarSyncRow> {
  const supabase = createAdminClient()
  const current = await getGoogleCalendarSyncRow()

  const payload: GoogleCalendarSyncRow = {
    id: GOOGLE_CALENDAR_SYNC_ID,
    updated_at: new Date().toISOString(),
    ...(SYNC_ROW_DEFAULTS as Omit<GoogleCalendarSyncRow, 'id' | 'updated_at'>),
    ...(current ?? {}),
  }

  for (const [key, value] of Object.entries(patch) as [
    keyof Omit<GoogleCalendarSyncRow, 'id' | 'updated_at'>,
    GoogleCalendarSyncRow[keyof GoogleCalendarSyncRow],
  ][]) {
    payload[key] = value as never
  }

  const { data, error } = await supabase
    .from('google_calendar_sync')
    .upsert(payload)
    .select(SYNC_SELECT)
    .single()

  if (error) {
    if (isMissingGoogleSyncTable(error)) {
      throw new Error(
        'google_calendar_sync 테이블이 없습니다. supabase/add-google-calendar-sync.sql을 실행해 주세요.',
      )
    }
    if (
      error.message.includes('last_sync_attempt_at') ||
      error.message.includes('sync_status')
    ) {
      const {
        last_sync_attempt_at: _a,
        sync_status: _b,
        sync_status_detail: _c,
        ...legacyPayload
      } = payload
      const legacyResult = await supabase
        .from('google_calendar_sync')
        .upsert(legacyPayload)
        .select(
          'id, connected_email, refresh_token, calendar_id, calendar_name, sync_token, watch_channel_id, watch_resource_id, watch_expiration, calendar_id_2, calendar_name_2, sync_token_2, watch_channel_id_2, watch_resource_id_2, watch_expiration_2, sync_enabled, last_synced_at, last_sync_error, pending_member_count, updated_at',
        )
        .single()
      if (legacyResult.error) throw new Error(legacyResult.error.message)
      return {
        ...SYNC_ROW_DEFAULTS,
        ...(legacyResult.data as GoogleCalendarSyncRow),
      }
    }
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

type CalendarFetchResult = {
  events: GoogleCalendarEvent[]
  nextSyncToken: string | null
  recoveredFromExpiredToken: boolean
}

async function paginateGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  query: GoogleEventsFullListQuery | GoogleEventsIncrementalListQuery,
): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken: string | null }> {
  const events: GoogleCalendarEvent[] = []
  let pageToken: string | null = null
  let nextSyncToken: string | null = null
  let pages = 0

  do {
    const pageQuery = { ...query, pageToken }

    const response = await listGoogleCalendarEvents(accessToken, calendarId, pageQuery)

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

async function fetchEventsFullSync(
  accessToken: string,
  calendarId: string,
  reason?: string,
): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken: string | null }> {
  const bounds =
    reason === 'manual' ? getGoogleSyncTimeBounds() : getGoogleRecentSyncWindow()

  return paginateGoogleCalendarEvents(accessToken, calendarId, {
    mode: 'full',
    timeMin: bounds.timeMin,
    timeMax: bounds.timeMax,
  })
}

async function fetchEventsForCalendar(
  accessToken: string,
  calendarId: string,
  options: { syncToken?: string | null; reason?: string },
): Promise<CalendarFetchResult> {
  const forceFullSync = options.reason === 'manual' || !options.syncToken

  if (!forceFullSync && options.syncToken) {
    try {
      const incremental = await paginateGoogleCalendarEvents(accessToken, calendarId, {
        mode: 'incremental',
        syncToken: options.syncToken,
      })
      return { ...incremental, recoveredFromExpiredToken: false }
    } catch (error) {
      if (!isGoogleCalendarInvalidSyncQuery(error)) {
        throw error
      }
      console.info(
        `[google-calendar] sync query invalid for ${calendarId}, retrying full sync`,
      )
      const full = await fetchEventsFullSync(accessToken, calendarId, options.reason)
      return { ...full, recoveredFromExpiredToken: true }
    }
  }

  const full = await fetchEventsFullSync(accessToken, calendarId, options.reason)
  return { ...full, recoveredFromExpiredToken: false }
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

function buildSyncStatusMessage(outcomes: SyncCalendarOutcome[]): string {
  const failed = outcomes.filter((item) => !item.ok)
  if (failed.length === 0) return ''
  const names = failed.map((item) => item.calendarName).join(', ')
  const firstError = failed[0]?.error ?? '알 수 없는 오류'
  if (failed.length === 1) {
    return `「${names}」 캘린더 동기화 실패: ${firstError}`
  }
  return `「${names}」 캘린더 동기화 실패. ${firstError}`
}

function resolveSyncStatus(outcomes: SyncCalendarOutcome[]): GoogleCalendarSyncStatusValue {
  const successCount = outcomes.filter((item) => item.ok).length
  if (successCount === outcomes.length) return 'success'
  if (successCount === 0) return 'failure'
  return 'partial_success'
}

export async function syncGoogleCalendarLessons(options?: {
  reason?: string
}): Promise<GoogleCalendarSyncResult> {
  let row = await getGoogleCalendarSyncRow()
  if (!row?.refresh_token || !row.calendar_id || !row.sync_enabled) {
    return { created: 0, updated: 0, linked: 0, cancelled: 0, pendingMember: 0, skipped: 0 }
  }

  const supabase = createAdminClient()
  const attemptAt = new Date().toISOString()

  await upsertGoogleCalendarSyncRow({
    last_sync_attempt_at: attemptAt,
  })

  const aggregated: GoogleCalendarSyncResult = {
    created: 0,
    updated: 0,
    linked: 0,
    cancelled: 0,
    pendingMember: 0,
    skipped: 0,
  }

  const syncTokenPatch: Partial<GoogleCalendarSyncRow> = {}
  const calendarOutcomes: SyncCalendarOutcome[] = []
  let deduped = 0

  try {
    deduped = await dedupeGoogleCalendarLessons()
  } catch (error) {
    console.warn(
      '[google-calendar] dedupe skipped:',
      error instanceof Error ? error.message : error,
    )
  }

  const googleAccountId = row.connected_email ?? 'default'

  try {
    await withGoogleAccessToken(row.refresh_token, async (accessToken) => {
      row = await refreshLessonCalendarIds(row!, accessToken)

      const calendarsToSync: {
        calendarId: string
        calendarName: string
        syncToken: string | null
        syncTokenKey: 'sync_token' | 'sync_token_2'
      }[] = [
        {
          calendarId: row.calendar_id!,
          calendarName: row.calendar_name ?? '수업',
          syncToken: row.sync_token,
          syncTokenKey: 'sync_token',
        },
      ]

      if (row.calendar_id_2) {
        calendarsToSync.push({
          calendarId: row.calendar_id_2,
          calendarName: row.calendar_name_2 ?? '수업2',
          syncToken: row.sync_token_2,
          syncTokenKey: 'sync_token_2',
        })
      }

      for (const calendar of calendarsToSync) {
        try {
          const { events, nextSyncToken } = await fetchEventsForCalendar(
            accessToken,
            calendar.calendarId,
            {
              syncToken: calendar.syncToken,
              reason: options?.reason,
            },
          )

          const googleEventIds = events
            .map((event) => event.id)
            .filter((id): id is string => Boolean(id))

          const [memberMap, existingMap] = await Promise.all([
            loadMemberNameMap(supabase),
            loadExistingByGoogleEventId(supabase, googleEventIds, {
              googleAccountId,
              googleCalendarId: calendar.calendarId,
            }),
          ])

          const result = await applyGoogleEventsBatch(
            supabase,
            events,
            memberMap,
            existingMap,
            calendar.calendarId,
            googleAccountId,
          )

          aggregated.created += result.created
          aggregated.updated += result.updated
          aggregated.linked += result.linked
          aggregated.cancelled += result.cancelled
          aggregated.pendingMember += result.pendingMember
          aggregated.skipped += result.skipped

          if (nextSyncToken) {
            syncTokenPatch[calendar.syncTokenKey] = nextSyncToken
          }

          calendarOutcomes.push({
            calendarName: calendar.calendarName,
            calendarId: calendar.calendarId,
            ok: true,
            fetched: events.length,
          })

          if (options?.reason) {
            console.info('[google-calendar] sync complete', options.reason, {
              calendarId: calendar.calendarId,
              ...result,
              fetched: events.length,
            })
          }
        } catch (error) {
          const message = formatGoogleCalendarSyncError(error)
          calendarOutcomes.push({
            calendarName: calendar.calendarName,
            calendarId: calendar.calendarId,
            ok: false,
            error: message,
          })
          console.error('[google-calendar] calendar sync failed', {
            calendarId: calendar.calendarId,
            error: message,
          })
        }
      }
    })

    const syncStatus = resolveSyncStatus(calendarOutcomes)
    const allSucceeded = syncStatus === 'success'
    const pendingCount = await countPendingMemberLessons(supabase)

    await upsertGoogleCalendarSyncRow({
      ...syncTokenPatch,
      ...(allSucceeded
        ? { last_synced_at: new Date().toISOString(), last_sync_error: null }
        : { last_sync_error: buildSyncStatusMessage(calendarOutcomes) }),
      sync_status: syncStatus,
      sync_status_detail: JSON.stringify({
        succeeded: calendarOutcomes.filter((item) => item.ok).map((item) => item.calendarName),
        failed: calendarOutcomes
          .filter((item) => !item.ok)
          .map((item) => ({ name: item.calendarName, error: item.error })),
      }),
      pending_member_count: pendingCount,
    })

    aggregated.syncStatus = syncStatus
    aggregated.deduped = deduped

    if (syncStatus === 'failure') {
      throw new Error(buildSyncStatusMessage(calendarOutcomes))
    }

    return aggregated
  } catch (error) {
    const message = formatGoogleCalendarSyncError(error)
    await upsertGoogleCalendarSyncRow({
      last_sync_error: message,
      sync_status: 'failure',
      sync_status_detail: JSON.stringify({
        succeeded: calendarOutcomes.filter((item) => item.ok).map((item) => item.calendarName),
        failed:
          calendarOutcomes.length > 0
            ? calendarOutcomes
                .filter((item) => !item.ok)
                .map((item) => ({ name: item.calendarName, error: item.error ?? message }))
            : [{ name: '전체', error: message }],
      }),
    })
    throw new Error(message)
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
