import 'server-only'

import {
  GOOGLE_CALENDAR_INSTRUCTOR_BY_CALENDAR_NAME,
  GOOGLE_LESSON_CALENDAR_NAMES,
} from '@/lib/google-calendar/config'
import { createServiceRoleClient } from '@/lib/supabase/admin'

export type GoogleCalendarMapping = {
  google_calendar_id: string
  calendar_name: string
  default_coach_id: string | null
  display_color: string | null
}

type MappingCache = {
  byCalendarId: Map<string, GoogleCalendarMapping>
  byCalendarName: Map<string, GoogleCalendarMapping>
}

let cache: MappingCache | null = null
let cacheLoadedAt = 0
const CACHE_TTL_MS = 60_000

function buildFallbackMappings(): MappingCache {
  const byCalendarName = new Map<string, GoogleCalendarMapping>()
  for (const name of GOOGLE_LESSON_CALENDAR_NAMES) {
    byCalendarName.set(name, {
      google_calendar_id: `pending:${name}`,
      calendar_name: name,
      default_coach_id: null,
      display_color: null,
    })
  }
  return { byCalendarId: new Map(), byCalendarName }
}

export async function loadGoogleCalendarMappings(): Promise<MappingCache> {
  const now = Date.now()
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) return cache

  const fallback = buildFallbackMappings()

  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('google_calendar_mappings')
      .select('google_calendar_id, calendar_name, default_coach_id, display_color')

    if (error) {
      if (
        error.message.includes('google_calendar_mappings') ||
        error.message.includes('schema cache')
      ) {
        cache = fallback
        cacheLoadedAt = now
        return cache
      }
      throw new Error(error.message)
    }

    const byCalendarId = new Map<string, GoogleCalendarMapping>()
    const byCalendarName = new Map<string, GoogleCalendarMapping>()

    for (const row of data ?? []) {
      const mapping: GoogleCalendarMapping = {
        google_calendar_id: row.google_calendar_id,
        calendar_name: row.calendar_name,
        default_coach_id: row.default_coach_id,
        display_color: row.display_color,
      }
      if (!row.google_calendar_id.startsWith('pending:')) {
        byCalendarId.set(row.google_calendar_id, mapping)
      }
      byCalendarName.set(row.calendar_name, mapping)
    }

    for (const name of GOOGLE_LESSON_CALENDAR_NAMES) {
      if (!byCalendarName.has(name)) {
        byCalendarName.set(name, fallback.byCalendarName.get(name)!)
      }
    }

    cache = { byCalendarId, byCalendarName }
    cacheLoadedAt = now
    return cache
  } catch {
    cache = fallback
    cacheLoadedAt = now
    return cache
  }
}

export async function resolveCoachIdFromGoogleCalendar(
  supabase: ReturnType<typeof createServiceRoleClient>,
  googleCalendarId: string,
  calendarName?: string | null,
): Promise<string | null> {
  const mappings = await loadGoogleCalendarMappings()
  const fromId = mappings.byCalendarId.get(googleCalendarId)
  if (fromId?.default_coach_id) return fromId.default_coach_id

  const name = calendarName?.trim()
  if (name) {
    const fromName = mappings.byCalendarName.get(name)
    if (fromName?.default_coach_id) return fromName.default_coach_id

    const legacyName = GOOGLE_CALENDAR_INSTRUCTOR_BY_CALENDAR_NAME[name]
    if (legacyName) {
      const { data } = await supabase
        .from('instructors')
        .select('id')
        .eq('name', legacyName)
        .eq('is_active', true)
        .maybeSingle()
      return data?.id ?? null
    }
  }

  return null
}

export function invalidateGoogleCalendarMappingsCache() {
  cache = null
  cacheLoadedAt = 0
}
