import 'server-only'

import {
  GOOGLE_CALENDAR_INSTRUCTOR_BY_CALENDAR_NAME,
} from '@/lib/google-calendar/config'
import type { GoogleCalendarSyncRow } from '@/lib/google-calendar/types'
import { createServiceRoleClient } from '@/lib/supabase/admin'

export type GoogleCalendarInstructorResolver = {
  resolveInstructorId(googleCalendarId: string): string | null
}

export async function buildGoogleCalendarInstructorResolver(
  supabase: ReturnType<typeof createServiceRoleClient>,
  row: Pick<
    GoogleCalendarSyncRow,
    'calendar_id' | 'calendar_name' | 'calendar_id_2' | 'calendar_name_2'
  >,
): Promise<GoogleCalendarInstructorResolver> {
  const instructorNameByCalendarId = new Map<string, string>()

  if (row.calendar_id) {
    const calendarName = row.calendar_name?.trim() ?? ''
    const instructorName = GOOGLE_CALENDAR_INSTRUCTOR_BY_CALENDAR_NAME[calendarName]
    if (instructorName) {
      instructorNameByCalendarId.set(row.calendar_id, instructorName)
    }
  }

  if (row.calendar_id_2) {
    const calendarName = row.calendar_name_2?.trim() ?? ''
    const instructorName = GOOGLE_CALENDAR_INSTRUCTOR_BY_CALENDAR_NAME[calendarName]
    if (instructorName) {
      instructorNameByCalendarId.set(row.calendar_id_2, instructorName)
    }
  }

  const instructorNames = [...new Set(instructorNameByCalendarId.values())]
  const instructorIdByName = new Map<string, string>()

  if (instructorNames.length > 0) {
    const { data, error } = await supabase
      .from('instructors')
      .select('id, name')
      .in('name', instructorNames)
      .eq('is_active', true)

    if (error) throw new Error(error.message)

    for (const instructor of data ?? []) {
      const name = instructor.name?.trim()
      if (name) instructorIdByName.set(name, instructor.id)
    }
  }

  const instructorIdByCalendarId = new Map<string, string>()
  for (const [calendarId, instructorName] of instructorNameByCalendarId) {
    const instructorId = instructorIdByName.get(instructorName)
    if (instructorId) {
      instructorIdByCalendarId.set(calendarId, instructorId)
    }
  }

  return {
    resolveInstructorId(googleCalendarId: string): string | null {
      return instructorIdByCalendarId.get(googleCalendarId) ?? null
    },
  }
}

/** 강사 ID → Google 캘린더 (수업/수업2) — 인바운드 동기화와 동일한 매핑 */
export async function resolveGoogleCalendarTarget(
  supabase: ReturnType<typeof createServiceRoleClient>,
  row: Pick<
    GoogleCalendarSyncRow,
    'calendar_id' | 'calendar_name' | 'calendar_id_2' | 'calendar_name_2'
  >,
  instructorId: string | null,
): Promise<{ calendarId: string; calendarName: string } | null> {
  const resolver = await buildGoogleCalendarInstructorResolver(supabase, row)

  const calendars: { id: string; name: string }[] = []
  if (row.calendar_id) {
    calendars.push({ id: row.calendar_id, name: row.calendar_name ?? '수업' })
  }
  if (row.calendar_id_2) {
    calendars.push({
      id: row.calendar_id_2,
      name: row.calendar_name_2 ?? '수업2',
    })
  }

  if (instructorId) {
    for (const calendar of calendars) {
      if (resolver.resolveInstructorId(calendar.id) === instructorId) {
        return { calendarId: calendar.id, calendarName: calendar.name }
      }
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

/** Google에서 가져온 기존 일정에 캘린더별 담당 강사 일괄 반영 */
export async function backfillGoogleCalendarInstructor(
  supabase: ReturnType<typeof createServiceRoleClient>,
  googleCalendarId: string,
  instructorId: string | null,
): Promise<void> {
  if (!instructorId) return

  const { error } = await supabase
    .from('lessons')
    .update({ instructor_id: instructorId })
    .eq('google_calendar_id', googleCalendarId)
    .not('google_event_id', 'is', null)

  if (error && !error.message.includes('google_calendar_id')) {
    throw new Error(error.message)
  }
}
