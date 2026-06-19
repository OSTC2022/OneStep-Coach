import type { GoogleCalendarEvent } from '@/lib/google-calendar/types'

export type SyncConflictLesson = {
  app_modified_at?: string | null
  google_event_updated_at?: string | null
  session_deducted?: boolean
}

function parseTs(value: string | null | undefined): number {
  if (!value) return 0
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

/** Google → 앱 적용 여부 (최근 수정 시각 기준) */
export function shouldApplyGoogleEvent(
  event: GoogleCalendarEvent,
  existing: SyncConflictLesson | null | undefined,
): boolean {
  if (existing?.session_deducted) return false

  const googleUpdatedMs = parseTs(event.updated)
  if (!googleUpdatedMs) return true

  if (!existing) return true

  const storedGoogleMs = parseTs(existing.google_event_updated_at)
  if (googleUpdatedMs <= storedGoogleMs) return false

  const appModifiedMs = parseTs(existing.app_modified_at)
  if (appModifiedMs > googleUpdatedMs) return false

  return true
}

/** 앱 → Google 푸시 여부 */
export function shouldPushAppLesson(lesson: {
  app_modified_at?: string | null
  google_event_updated_at?: string | null
  google_event_id?: string | null
  event_type?: string | null
  session_deducted?: boolean
}): boolean {
  if (lesson.session_deducted) return false
  if (lesson.event_type === 'materialized') return false

  if (!lesson.google_event_id) return true

  const appMs = parseTs(lesson.app_modified_at)
  const googleMs = parseTs(lesson.google_event_updated_at)
  return appMs > googleMs
}

export function googleEventUpdatedAt(
  event: GoogleCalendarEvent,
): string | null {
  return event.updated ?? null
}
