import 'server-only'

import type { GoogleCalendarSyncRow } from '@/lib/google-calendar/types'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import {
  loadGoogleCalendarMappings,
  resolveCoachIdFromGoogleCalendar,
} from '@/lib/google-calendar/calendar-mappings'

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
  await loadGoogleCalendarMappings()

  const instructorIdByCalendarId = new Map<string, string | null>()

  if (row.calendar_id) {
    instructorIdByCalendarId.set(
      row.calendar_id,
      await resolveCoachIdFromGoogleCalendar(
        supabase,
        row.calendar_id,
        row.calendar_name,
      ),
    )
  }

  if (row.calendar_id_2) {
    instructorIdByCalendarId.set(
      row.calendar_id_2,
      await resolveCoachIdFromGoogleCalendar(
        supabase,
        row.calendar_id_2,
        row.calendar_name_2,
      ),
    )
  }

  return {
    resolveInstructorId(googleCalendarId: string): string | null {
      return instructorIdByCalendarId.get(googleCalendarId) ?? null
    },
  }
}

/** 강사 ID → Google 캘린더 (수업/수업2) — DB 매핑 우선 */
export async function resolveGoogleCalendarTarget(
  supabase: ReturnType<typeof createServiceRoleClient>,
  row: Pick<
    GoogleCalendarSyncRow,
    'calendar_id' | 'calendar_name' | 'calendar_id_2' | 'calendar_name_2'
  >,
  instructorId: string | null,
): Promise<{ calendarId: string; calendarName: string } | null> {
  const mappings = await loadGoogleCalendarMappings()

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
      const mapping =
        mappings.byCalendarId.get(calendar.id) ??
        mappings.byCalendarName.get(calendar.name)
      if (mapping?.default_coach_id === instructorId) {
        return { calendarId: calendar.id, calendarName: calendar.name }
      }
    }

    const resolver = await buildGoogleCalendarInstructorResolver(supabase, row)
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

/** Supabase SOT: Google pull이 instructor_id를 덮어쓰지 않으므로 백필 비활성화 */
export async function backfillGoogleCalendarInstructor(
  _supabase: ReturnType<typeof createServiceRoleClient>,
  _googleCalendarId: string,
  _instructorId: string | null,
): Promise<void> {
  return
}
