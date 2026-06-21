import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/admin'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import {
  resolveGoogleCalendarTarget,
} from '@/lib/google-calendar/calendar-instructor'
import {
  deleteGoogleCalendarEvent,
  findGoogleEventsByLessonId,
  getGoogleCalendarEvent,
  insertGoogleCalendarEvent,
  moveGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  withGoogleAccessToken,
} from '@/lib/google-calendar/client'
import { GoogleCalendarApiError } from '@/lib/google-calendar/errors'
import { lessonToGoogleEventBody } from '@/lib/google-calendar/lesson-push-mapper'
import {
  googleEventUpdatedAt,
  shouldPushAppLesson,
} from '@/lib/google-calendar/sync-conflict'
import { getGoogleCalendarSyncRow } from '@/lib/google-calendar/sync'
import type { GoogleCalendarSyncRow } from '@/lib/google-calendar/types'
import type { Lesson } from '@/lib/types'

const LESSON_PUSH_SELECT = `
  id,
  lesson_date,
  start_time,
  end_time,
  title,
  content,
  member_id,
  instructor_id,
  event_type,
  recurrence,
  attendance_status,
  event_status,
  event_timezone,
  google_event_id,
  google_calendar_id,
  google_account_id,
  google_recurring_event_id,
  app_modified_at,
  google_event_updated_at,
  session_deducted,
  member:members(id, name, sport, age, birth_date)
`

const LESSON_PUSH_SELECT_LEGACY = `
  id,
  lesson_date,
  start_time,
  end_time,
  title,
  content,
  member_id,
  instructor_id,
  event_type,
  recurrence,
  attendance_status,
  event_status,
  event_timezone,
  google_event_id,
  google_calendar_id,
  google_account_id,
  google_recurring_event_id,
  session_deducted,
  member:members(id, name, sport, age, birth_date)
`

export type GoogleLessonDeleteSnapshot = {
  id: string
  google_event_id: string | null
  google_calendar_id: string | null
  google_account_id: string | null
  event_type?: string | null
  session_deducted?: boolean
}

const pushInFlight = new Map<string, Promise<void>>()

function isMissingSyncColumn(error: { message?: string } | null): boolean {
  if (!error?.message) return false
  const msg = error.message
  return (
    msg.includes('app_modified_at') ||
    msg.includes('google_event_updated_at') ||
    msg.includes('google_calendar_id')
  )
}

function parseTs(value: string | null | undefined): number {
  if (!value) return 0
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function resolveSyncedAt(
  appModifiedAt: string | null | undefined,
  googleUpdated: string | null,
): string {
  const appMs = parseTs(appModifiedAt)
  const googleMs = parseTs(googleUpdated)
  return new Date(Math.max(Date.now(), appMs, googleMs)).toISOString()
}

function uniqueCalendarIds(
  ...ids: Array<string | null | undefined>
): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

export async function isGoogleCalendarPushEnabled(): Promise<boolean> {
  if (!isGoogleCalendarConfigured()) return false
  const row = await getGoogleCalendarSyncRow()
  return Boolean(row?.sync_enabled && row.refresh_token && row.calendar_id)
}

async function moveLessonEventToCalendar(
  accessToken: string,
  sourceCalendarId: string,
  eventId: string,
  destinationCalendarId: string,
  body: Record<string, unknown>,
): Promise<{
  eventId: string
  calendarId: string
  responseUpdated: string | null
  icalUid: string | null
}> {
  if (sourceCalendarId === destinationCalendarId) {
    const updated = await updateGoogleCalendarEvent(
      accessToken,
      destinationCalendarId,
      eventId,
      body,
    )
    return {
      eventId,
      calendarId: destinationCalendarId,
      responseUpdated: googleEventUpdatedAt(updated),
      icalUid: updated.iCalUID ?? null,
    }
  }

  try {
    const moved = await moveGoogleCalendarEvent(
      accessToken,
      sourceCalendarId,
      eventId,
      destinationCalendarId,
    )
    const movedId = moved.id!
    const updated = await updateGoogleCalendarEvent(
      accessToken,
      destinationCalendarId,
      movedId,
      body,
    )
    return {
      eventId: movedId,
      calendarId: destinationCalendarId,
      responseUpdated: googleEventUpdatedAt(updated),
      icalUid: updated.iCalUID ?? null,
    }
  } catch (error) {
    console.warn(
      '[google-calendar] calendar move failed, recreating event:',
      error instanceof Error ? error.message : error,
    )
    const created = await insertGoogleCalendarEvent(
      accessToken,
      destinationCalendarId,
      body,
    )
    try {
      await deleteGoogleCalendarEvent(accessToken, sourceCalendarId, eventId)
    } catch (deleteError) {
      if (
        !(
          deleteError instanceof GoogleCalendarApiError &&
          deleteError.status === 404
        )
      ) {
        console.warn(
          '[google-calendar] stale calendar event delete failed:',
          deleteError,
        )
      }
    }
    return {
      eventId: created.id!,
      calendarId: destinationCalendarId,
      responseUpdated: googleEventUpdatedAt(created),
      icalUid: created.iCalUID ?? null,
    }
  }
}

async function persistGoogleLink(
  lessonId: string,
  patch: {
    google_event_id: string
    google_calendar_id: string
    google_account_id: string
    google_event_updated_at: string
    google_ical_uid?: string | null
  },
) {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('lessons').update(patch).eq('id', lessonId)
  if (error && !isMissingSyncColumn(error)) {
    throw new Error(error.message)
  }
}

async function loadLessonForPush(lessonId: string): Promise<Lesson | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('lessons')
    .select(LESSON_PUSH_SELECT)
    .eq('id', lessonId)
    .maybeSingle()

  if (!error) {
    return data ? (data as unknown as Lesson) : null
  }

  if (isMissingSyncColumn(error)) {
    const legacy = await supabase
      .from('lessons')
      .select(LESSON_PUSH_SELECT_LEGACY)
      .eq('id', lessonId)
      .maybeSingle()
    if (legacy.error) {
      console.error('[google-calendar] load lesson for push failed:', legacy.error.message)
      return null
    }
    return legacy.data ? (legacy.data as unknown as Lesson) : null
  }

  throw new Error(error.message)
}

async function resolveLinkedGoogleEvent(
  accessToken: string,
  row: GoogleCalendarSyncRow,
  lesson: Lesson,
  targetCalendarId: string,
): Promise<{ eventId: string; calendarId: string } | null> {
  if (lesson.google_event_id && lesson.google_calendar_id) {
    return {
      eventId: lesson.google_event_id,
      calendarId: lesson.google_calendar_id,
    }
  }

  const calendarCandidates = uniqueCalendarIds(
    lesson.google_calendar_id,
    targetCalendarId,
    row.calendar_id,
    row.calendar_id_2,
  )

  if (lesson.google_event_id) {
    const preferred = uniqueCalendarIds(
      lesson.google_calendar_id,
      targetCalendarId,
    )
    const rest = uniqueCalendarIds(
      row.calendar_id,
      row.calendar_id_2,
    ).filter((id) => !preferred.includes(id))
    for (const calendarId of [...preferred, ...rest]) {
      try {
        await getGoogleCalendarEvent(
          accessToken,
          calendarId,
          lesson.google_event_id,
        )
        return { eventId: lesson.google_event_id, calendarId }
      } catch (error) {
        if (error instanceof GoogleCalendarApiError && error.status === 404) {
          continue
        }
        throw error
      }
    }
  }

  for (const calendarId of calendarCandidates) {
    const matches = await findGoogleEventsByLessonId(
      accessToken,
      calendarId,
      lesson.id,
    )
    if (matches[0]?.id) {
      return { eventId: matches[0].id, calendarId }
    }
  }

  return null
}

async function removeDuplicateGoogleEvents(
  accessToken: string,
  calendarId: string,
  lessonId: string,
  keepEventId: string,
) {
  const matches = await findGoogleEventsByLessonId(
    accessToken,
    calendarId,
    lessonId,
  )
  for (const event of matches) {
    if (!event.id || event.id === keepEventId) continue
    try {
      await deleteGoogleCalendarEvent(accessToken, calendarId, event.id)
    } catch (error) {
      if (error instanceof GoogleCalendarApiError && error.status === 404) {
        continue
      }
      console.warn('[google-calendar] duplicate cleanup failed', event.id, error)
    }
  }
}

async function pushLessonToGoogleInternal(lessonId: string): Promise<void> {
  const row = await getGoogleCalendarSyncRow()
  if (!row?.sync_enabled || !row.refresh_token || !row.calendar_id) return

  const lesson = await loadLessonForPush(lessonId)
  if (!lesson || !shouldPushAppLesson(lesson)) return

  const body = lessonToGoogleEventBody(lesson)
  if (!body) {
    if (lesson.google_event_id && lesson.google_calendar_id) {
      await deleteLessonFromGoogleSnapshot({
        id: lesson.id,
        google_event_id: lesson.google_event_id,
        google_calendar_id: lesson.google_calendar_id,
        google_account_id: lesson.google_account_id ?? row.connected_email,
      })
    }
    return
  }

  const supabase = createServiceRoleClient()
  const target = await resolveGoogleCalendarTarget(
    supabase,
    row,
    lesson.instructor_id,
  )
  if (!target) return

  const googleAccountId = row.connected_email ?? 'default'

  await withGoogleAccessToken(row.refresh_token, async (accessToken) => {
    const linked = await resolveLinkedGoogleEvent(
      accessToken,
      row,
      lesson,
      target.calendarId,
    )

    let googleEventId = linked?.eventId ?? null
    let googleCalendarId = linked?.calendarId ?? target.calendarId
    let responseUpdated: string | null = null
    let icalUid: string | null = null

    if (googleEventId) {
      const previousCalendarId = googleCalendarId
      const moved = await moveLessonEventToCalendar(
        accessToken,
        googleCalendarId,
        googleEventId,
        target.calendarId,
        body,
      )
      googleEventId = moved.eventId
      googleCalendarId = moved.calendarId
      responseUpdated = moved.responseUpdated
      icalUid = moved.icalUid

      if (previousCalendarId !== googleCalendarId) {
        await removeDuplicateGoogleEvents(
          accessToken,
          previousCalendarId,
          lesson.id,
          '__none__',
        )
      }
    } else {
      const created = await insertGoogleCalendarEvent(
        accessToken,
        target.calendarId,
        body,
      )
      googleEventId = created.id
      googleCalendarId = target.calendarId
      responseUpdated = googleEventUpdatedAt(created)
      icalUid = created.iCalUID ?? null

      await removeDuplicateGoogleEvents(
        accessToken,
        googleCalendarId,
        lesson.id,
        googleEventId,
      )
    }

    if (!googleEventId) return

    await persistGoogleLink(lessonId, {
      google_event_id: googleEventId,
      google_calendar_id: googleCalendarId,
      google_account_id: googleAccountId,
      google_event_updated_at: resolveSyncedAt(
        lesson.app_modified_at,
        responseUpdated,
      ),
      google_ical_uid: icalUid,
    })
  })
}

export async function pushLessonToGoogle(lessonId: string): Promise<void> {
  let existing = pushInFlight.get(lessonId)
  if (!existing) {
    existing = (async () => {
      try {
        await pushLessonToGoogleInternal(lessonId)
      } finally {
        pushInFlight.delete(lessonId)
      }
    })()
    pushInFlight.set(lessonId, existing)
  }
  await existing
}

export async function deleteLessonFromGoogleSnapshot(
  snapshot: GoogleLessonDeleteSnapshot,
): Promise<void> {
  if (snapshot.session_deducted) return
  if (!snapshot.google_event_id || !snapshot.google_calendar_id) return

  const row = await getGoogleCalendarSyncRow()
  if (!row?.sync_enabled || !row.refresh_token) return

  await withGoogleAccessToken(row.refresh_token, async (accessToken) => {
    try {
      await deleteGoogleCalendarEvent(
        accessToken,
        snapshot.google_calendar_id!,
        snapshot.google_event_id!,
      )
    } catch (error) {
      if (error instanceof GoogleCalendarApiError && error.status === 404) {
        return
      }
      throw error
    }
  })
}

export async function pushLessonsToGoogle(lessonIds: string[]): Promise<void> {
  const unique = [...new Set(lessonIds.filter(Boolean))]
  for (const id of unique) {
    try {
      await pushLessonToGoogle(id)
    } catch (error) {
      console.error('[google-calendar] push failed for lesson', id, error)
    }
  }
}

export async function deleteLessonsFromGoogle(
  snapshots: GoogleLessonDeleteSnapshot[],
): Promise<void> {
  for (const snapshot of snapshots) {
    try {
      await deleteLessonFromGoogleSnapshot(snapshot)
    } catch (error) {
      console.error('[google-calendar] delete failed for lesson', snapshot.id, error)
    }
  }
}
