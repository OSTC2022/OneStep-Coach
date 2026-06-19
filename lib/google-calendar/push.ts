import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  GOOGLE_CALENDAR_INSTRUCTOR_BY_CALENDAR_NAME,
} from '@/lib/google-calendar/config'
import {
  deleteGoogleCalendarEvent,
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

export type GoogleLessonDeleteSnapshot = {
  id: string
  google_event_id: string | null
  google_calendar_id: string | null
  google_account_id: string | null
  event_type?: string | null
  session_deducted?: boolean
}

function isMissingSyncColumn(error: { message?: string } | null): boolean {
  if (!error?.message) return false
  const msg = error.message
  return (
    msg.includes('app_modified_at') ||
    msg.includes('google_event_updated_at') ||
    msg.includes('google_calendar_id')
  )
}

export async function isGoogleCalendarPushEnabled(): Promise<boolean> {
  const row = await getGoogleCalendarSyncRow()
  return Boolean(row?.sync_enabled && row.refresh_token && row.calendar_id)
}

async function resolveInstructorName(
  instructorId: string | null,
): Promise<string | null> {
  if (!instructorId) return null
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('instructors')
    .select('name')
    .eq('id', instructorId)
    .maybeSingle()
  return data?.name?.trim() ?? null
}

export function resolveGoogleCalendarForLesson(
  row: GoogleCalendarSyncRow,
  instructorName: string | null,
): { calendarId: string; calendarName: string } | null {
  const secondaryName = row.calendar_name_2?.trim()
  const secondaryInstructor =
    secondaryName && GOOGLE_CALENDAR_INSTRUCTOR_BY_CALENDAR_NAME[secondaryName]

  if (
    instructorName &&
    secondaryInstructor &&
    instructorName === secondaryInstructor &&
    row.calendar_id_2
  ) {
    return {
      calendarId: row.calendar_id_2,
      calendarName: row.calendar_name_2 ?? '수업2',
    }
  }

  if (row.calendar_id) {
    return {
      calendarId: row.calendar_id,
      calendarName: row.calendar_name ?? '수업',
    }
  }

  return null
}

async function persistGoogleLink(
  lessonId: string,
  patch: {
    google_event_id: string
    google_calendar_id: string
    google_account_id: string
    google_event_updated_at: string | null
    google_ical_uid?: string | null
  },
) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('lessons').update(patch).eq('id', lessonId)
  if (error && !isMissingSyncColumn(error)) {
    throw new Error(error.message)
  }
}

export async function pushLessonToGoogle(lessonId: string): Promise<void> {
  const row = await getGoogleCalendarSyncRow()
  if (!row?.sync_enabled || !row.refresh_token || !row.calendar_id) return

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('lessons')
    .select(LESSON_PUSH_SELECT)
    .eq('id', lessonId)
    .maybeSingle()

  if (error) {
    if (isMissingSyncColumn(error)) return
    throw new Error(error.message)
  }
  if (!data) return

  const lesson = data as Lesson
  if (!shouldPushAppLesson(lesson)) return

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

  const instructorName = await resolveInstructorName(lesson.instructor_id)
  const target = resolveGoogleCalendarForLesson(row, instructorName)
  if (!target) return

  const googleAccountId = row.connected_email ?? 'default'

  await withGoogleAccessToken(row.refresh_token, async (accessToken) => {
    let googleEventId = lesson.google_event_id
    let googleCalendarId = lesson.google_calendar_id ?? target.calendarId
    let responseUpdated: string | null = null
    let icalUid: string | null = null

    if (
      googleEventId &&
      lesson.google_calendar_id &&
      lesson.google_calendar_id !== target.calendarId
    ) {
      const moved = await moveGoogleCalendarEvent(
        accessToken,
        lesson.google_calendar_id,
        googleEventId,
        target.calendarId,
      )
      googleEventId = moved.id
      googleCalendarId = target.calendarId
      responseUpdated = googleEventUpdatedAt(moved)
      icalUid = moved.iCalUID ?? null
      const updated = await updateGoogleCalendarEvent(
        accessToken,
        target.calendarId,
        googleEventId,
        body,
      )
      responseUpdated = googleEventUpdatedAt(updated) ?? responseUpdated
      icalUid = updated.iCalUID ?? icalUid
    } else if (googleEventId) {
      try {
        const updated = await updateGoogleCalendarEvent(
          accessToken,
          googleCalendarId,
          googleEventId,
          body,
        )
        responseUpdated = googleEventUpdatedAt(updated)
        icalUid = updated.iCalUID ?? null
      } catch (error) {
        if (error instanceof GoogleCalendarApiError && error.status === 404) {
          const created = await insertGoogleCalendarEvent(
            accessToken,
            target.calendarId,
            body,
          )
          googleEventId = created.id
          googleCalendarId = target.calendarId
          responseUpdated = googleEventUpdatedAt(created)
          icalUid = created.iCalUID ?? null
        } else {
          throw error
        }
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
    }

    if (!googleEventId) return

    await persistGoogleLink(lessonId, {
      google_event_id: googleEventId,
      google_calendar_id: googleCalendarId,
      google_account_id: googleAccountId,
      google_event_updated_at: responseUpdated,
      google_ical_uid: icalUid,
    })
  })
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
