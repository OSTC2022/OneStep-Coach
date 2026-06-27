import type { AttendanceRecordRow } from '@/lib/actions/attendance-records'

export type GoogleSyncConsolidationCandidate = {
  id: string
  session_deducted?: boolean | null
  sync_origin?: string | null
  app_modified_at?: string | null
  attendance_status?: string | null
  event_type?: string | null
  lesson_sessions?: Array<{ checked_in_at?: string | null }> | null
  has_attendance_record?: boolean
}

export type GoogleSyncConsolidationDecision = {
  lessonId: string
  action: 'delete' | 'skip'
  reason: string
  session_deducted: boolean
  sync_origin: string | null
  app_modified_at: string | null
  has_lesson_session_checkin: boolean
  has_attendance_record: boolean
}

export function logGoogleSyncConsolidationStart(scope: string, meta?: Record<string, unknown>) {
  console.info('[google-sync][consolidation] start', {
    at: new Date().toISOString(),
    scope,
    ...meta,
  })
}

export function logGoogleSyncConsolidationDecision(
  decision: GoogleSyncConsolidationDecision,
) {
  console.info('[google-sync][consolidation] decision', {
    at: new Date().toISOString(),
    ...decision,
  })
}

export function evaluateGoogleSyncConsolidationCandidate(
  row: GoogleSyncConsolidationCandidate,
): GoogleSyncConsolidationDecision {
  const hasLessonSessionCheckin = Boolean(
    row.lesson_sessions?.some((session) => session.checked_in_at),
  )
  const hasAttendanceRecord = Boolean(row.has_attendance_record)

  const base = {
    lessonId: row.id,
    session_deducted: Boolean(row.session_deducted),
    sync_origin: row.sync_origin ?? null,
    app_modified_at: row.app_modified_at ?? null,
    has_lesson_session_checkin: hasLessonSessionCheckin,
    has_attendance_record: hasAttendanceRecord,
  }

  if (row.session_deducted) {
    return { ...base, action: 'skip', reason: 'session_deducted' }
  }
  if (row.sync_origin === 'app') {
    return { ...base, action: 'skip', reason: 'sync_origin_app' }
  }
  if (hasAttendanceRecord) {
    return { ...base, action: 'skip', reason: 'attendance_record_exists' }
  }
  if (hasLessonSessionCheckin) {
    return { ...base, action: 'skip', reason: 'lesson_session_checked_in' }
  }
  if (
    row.attendance_status === 'cancelled' ||
    row.attendance_status === 'absent' ||
    row.attendance_status === 'makeup'
  ) {
    return { ...base, action: 'skip', reason: `attendance_status_${row.attendance_status}` }
  }

  return { ...base, action: 'delete', reason: 'duplicate_or_stale_google_row' }
}

export function shouldDeleteOnGoogleConsolidation(
  row: GoogleSyncConsolidationCandidate,
): boolean {
  const decision = evaluateGoogleSyncConsolidationCandidate(row)
  logGoogleSyncConsolidationDecision(decision)
  return decision.action === 'delete'
}
