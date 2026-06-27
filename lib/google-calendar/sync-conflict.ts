import type { GoogleCalendarEvent } from '@/lib/google-calendar/types'

export type SyncConflictLesson = {
  app_modified_at?: string | null
  google_event_updated_at?: string | null
  session_deducted?: boolean
  sync_origin?: string | null
  instructor_id?: string | null
  attendance_status?: string | null
  lesson_sessions?: Array<{ checked_in_at?: string | null }> | null
}

/** 앱에서 수정 직후 Google이 덮어쓰지 못하도록 하는 유예 시간 */
export const APP_EDIT_GRACE_MS = 2 * 60 * 1000

function parseTs(value: string | null | undefined): number {
  if (!value) return 0
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function hasCheckedInSession(
  lesson_sessions?: Array<{ checked_in_at?: string | null }> | null,
): boolean {
  return Boolean(lesson_sessions?.some((session) => session.checked_in_at))
}

/** Google 반복 일정 정리 시 삭제하면 안 되는 앱 출석·수정 행 */
export function shouldPreserveLessonOnGoogleConsolidation(
  row: Pick<
    SyncConflictLesson,
    'session_deducted' | 'sync_origin' | 'attendance_status' | 'lesson_sessions'
  >,
): boolean {
  if (row.session_deducted) return true
  if (row.sync_origin === 'app') return true
  if (hasCheckedInSession(row.lesson_sessions)) return true
  if (
    row.attendance_status === 'cancelled' ||
    row.attendance_status === 'absent' ||
    row.attendance_status === 'makeup'
  ) {
    return true
  }
  return false
}

/** Google → 앱 적용 여부 (최근 수정 시각·출처 기준). Supabase 원본 정책: 기존 행은 기본 거부 */
export function shouldApplyGoogleEvent(
  event: GoogleCalendarEvent,
  existing: SyncConflictLesson | null | undefined,
): boolean {
  if (!existing) return true
  if (existing.session_deducted) return false

  // 앱에 강사·회원·수정 이력이 있으면 Google 본문 적용 금지
  if (existing.sync_origin === 'app') return false
  if (existing.instructor_id) return false
  if (existing.member_id) return false
  if (existing.app_modified_at) return false

  const googleUpdatedMs = parseTs(event.updated)
  if (!googleUpdatedMs) return false

  const storedGoogleMs = parseTs(existing.google_event_updated_at)
  if (googleUpdatedMs <= storedGoogleMs) return false

  return false
}

/** Google 동기화 시 instructor_id 덮어쓰기 방지 */
export function preserveInstructorOnGoogleSync<
  T extends Record<string, unknown>,
>(
  payload: T,
  existing: SyncConflictLesson | null | undefined,
): T {
  if (!existing?.instructor_id) return payload
  if (!('instructor_id' in payload)) return payload

  const appModifiedMs = parseTs(existing.app_modified_at)
  const googleUpdatedMs = parseTs(existing.google_event_updated_at)

  if (existing.sync_origin === 'app' && appModifiedMs > 0) {
    if (googleUpdatedMs === 0 || appModifiedMs >= googleUpdatedMs) {
      const { instructor_id: _removed, ...rest } = payload
      return { ...rest, instructor_id: existing.instructor_id } as T
    }
  }

  if (appModifiedMs > googleUpdatedMs) {
    const { instructor_id: _removed, ...rest } = payload
    return { ...rest, instructor_id: existing.instructor_id } as T
  }

  return payload
}

/** 앱 → Google 푸시 여부 */
export function shouldPushAppLesson(lesson: {
  app_modified_at?: string | null
  google_event_updated_at?: string | null
  google_event_id?: string | null
  event_type?: string | null
  session_deducted?: boolean
  sync_origin?: string | null
}): boolean {
  if (lesson.session_deducted) return false
  if (lesson.event_type === 'materialized') return false

  if (!lesson.google_event_id) return true

  const appMs = parseTs(lesson.app_modified_at)
  const googleMs = parseTs(lesson.google_event_updated_at)

  if (!lesson.app_modified_at || !lesson.google_event_updated_at) return true

  return appMs > googleMs
}

export function googleEventUpdatedAt(
  event: GoogleCalendarEvent,
): string | null {
  return event.updated ?? null
}
