import type { GoogleCalendarEvent } from '@/lib/google-calendar/types'
import { parseGoogleEventDateTime } from '@/lib/google-calendar/event-mapper'
import { googleEventUpdatedAt } from '@/lib/google-calendar/sync-conflict'
import type { SyncConflictLesson } from '@/lib/google-calendar/sync-conflict'

/** Google → 앱: 운영 데이터(강사·회원·출석·수업권) 덮어쓰기 금지. Supabase가 원본. */
export const GOOGLE_MIRROR_ONLY_FIELDS = [
  'google_event_id',
  'google_calendar_id',
  'google_account_id',
  'google_ical_uid',
  'google_event_updated_at',
  'google_recurring_event_id',
  'google_external_title',
  'google_external_start_time',
  'last_synced_at',
] as const

function parseTs(value: string | null | undefined): number {
  if (!value) return 0
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

/** 기존 행에 Google 일정 본문(시간·강사·회원 등)을 적용할지 — 기본 false */
export function shouldApplyGoogleContentFromGoogle(
  existing: SyncConflictLesson | null | undefined,
): boolean {
  if (!existing) return true
  if (existing.session_deducted) return false
  if (existing.sync_origin === 'app') return false
  if (existing.instructor_id) return false
  if (existing.member_id) return false
  if (existing.app_modified_at) return false
  return false
}

/** Google 메타데이터(미러)만 갱신할지 */
export function shouldUpdateGoogleMirror(
  event: GoogleCalendarEvent,
  existing: SyncConflictLesson | null | undefined,
): boolean {
  if (!existing) return false
  const googleUpdatedMs = parseTs(event.updated)
  if (!googleUpdatedMs) return true
  const storedGoogleMs = parseTs(existing.google_event_updated_at)
  return googleUpdatedMs > storedGoogleMs
}

export function buildGoogleMirrorPayload(
  event: GoogleCalendarEvent,
  options: {
    googleAccountId: string
    googleCalendarId: string
    googleRecurringEventId?: string | null
  },
): Record<string, unknown> {
  const schedule = parseGoogleEventDateTime(event)
  const now = new Date().toISOString()
  const externalStart =
    schedule &&
    new Date(`${schedule.lessonDate}T${schedule.startTime ?? '00:00'}:00+09:00`).toISOString()

  const payload: Record<string, unknown> = {
    google_event_id: event.id,
    google_calendar_id: options.googleCalendarId,
    google_account_id: options.googleAccountId,
    google_ical_uid: event.iCalUID ?? null,
    google_external_title: event.summary?.trim() || null,
    google_external_start_time: externalStart ?? null,
    last_synced_at: now,
  }

  const googleUpdated = googleEventUpdatedAt(event)
  if (googleUpdated) {
    payload.google_event_updated_at = googleUpdated
  }

  if (options.googleRecurringEventId) {
    payload.google_recurring_event_id = options.googleRecurringEventId
  }

  return payload
}

/** full payload에서 앱 보호 필드를 제거하고 미러 필드만 남김 */
export function toMirrorOnlyUpdate(
  fullPayload: Record<string, unknown>,
  event: GoogleCalendarEvent,
  options: {
    googleAccountId: string
    googleCalendarId: string
    googleRecurringEventId?: string | null
  },
): Record<string, unknown> {
  const mirror = buildGoogleMirrorPayload(event, options)
  for (const key of GOOGLE_MIRROR_ONLY_FIELDS) {
    if (key in fullPayload && fullPayload[key] != null && !(key in mirror)) {
      mirror[key] = fullPayload[key]
    }
  }
  return mirror
}
