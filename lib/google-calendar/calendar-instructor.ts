import 'server-only'

import {
  GOOGLE_CALENDAR_INSTRUCTOR_BY_CALENDAR_NAME,
  GOOGLE_LESSON_CALENDAR_NAME,
  GOOGLE_LESSON_CALENDAR_NAME_2,
} from '@/lib/google-calendar/config'
import type { GoogleCalendarSyncRow } from '@/lib/google-calendar/types'
import { createAdminClient } from '@/lib/supabase/admin'

export type GoogleCalendarInstructorResolver = {
  resolveInstructorId(googleCalendarId: string): string | null
}

export async function buildGoogleCalendarInstructorResolver(
  supabase: ReturnType<typeof createAdminClient>,
  row: Pick<
    GoogleCalendarSyncRow,
    'calendar_id' | 'calendar_name' | 'calendar_id_2' | 'calendar_name_2'
  >,
): Promise<GoogleCalendarInstructorResolver> {
  const instructorNameByCalendarId = new Map<string, string>()

  if (row.calendar_id) {
    const calendarName = row.calendar_name?.trim() || GOOGLE_LESSON_CALENDAR_NAME
    const instructorName = GOOGLE_CALENDAR_INSTRUCTOR_BY_CALENDAR_NAME[calendarName]
    if (instructorName) {
      instructorNameByCalendarId.set(row.calendar_id, instructorName)
    }
  }

  if (row.calendar_id_2) {
    const calendarName = row.calendar_name_2?.trim() || GOOGLE_LESSON_CALENDAR_NAME_2
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

/** Google에서 가져온 기존 일정에 캘린더별 담당 강사 일괄 반영 */
export async function backfillGoogleCalendarInstructor(
  supabase: ReturnType<typeof createAdminClient>,
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
