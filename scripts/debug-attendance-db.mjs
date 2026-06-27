/**
 * 출석 DB 상태 스냅샷 — Supabase 실데이터 확인용
 *
 * 사용법:
 *   node scripts/debug-attendance-db.mjs 이현 2026-06-27
 *   node scripts/debug-attendance-db.mjs 이현 2026-06-27 --label after-navigation
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function buildLessonOccurrenceKey(lesson, centerId = 'default') {
  const memberId = lesson.member_id
  if (!memberId) return null

  const googleRecurringEventId = lesson.google_recurring_event_id
  const masterId = lesson.recurring_master_id
  const lessonDate = lesson.lesson_date
  const startTime = (lesson.start_time ?? '00:00').slice(0, 5)

  function normalizeOriginal(value) {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString()
  }

  function formatOriginal(lessonDate, startTime) {
    const hhmmss = startTime.length === 5 ? `${startTime}:00` : startTime
    return new Date(`${lessonDate}T${hhmmss}+09:00`).toISOString()
  }

  const original =
    normalizeOriginal(lesson.original_start_time) ??
    formatOriginal(lessonDate, startTime)

  if (googleRecurringEventId) {
    return `${centerId}|m:${memberId}|gr:${googleRecurringEventId}|${original}`
  }
  if (masterId) {
    return `${centerId}|m:${memberId}|rm:${masterId}|${original}`
  }

  const title = lesson.title || lesson.content || lesson.id || 'lesson'
  return `${centerId}|m:${memberId}|slot:${lessonDate}|${startTime}|${title}`
}

function wouldGoogleConsolidationDelete(lesson, sessionIds, attendanceRecordKeys) {
  const hasSession = sessionIds.has(lesson.id)
  const key = buildLessonOccurrenceKey(lesson)
  const hasAttendanceRecord = key ? attendanceRecordKeys.has(key) : false

  if (lesson.session_deducted) return { delete: false, reason: 'session_deducted' }
  if (lesson.sync_origin === 'app') return { delete: false, reason: 'sync_origin_app' }
  if (hasAttendanceRecord) return { delete: false, reason: 'attendance_record_exists' }
  if (hasSession) return { delete: false, reason: 'lesson_session_checked_in' }
  if (
    lesson.attendance_status === 'cancelled' ||
    lesson.attendance_status === 'absent' ||
    lesson.attendance_status === 'makeup'
  ) {
    return { delete: false, reason: `attendance_status_${lesson.attendance_status}` }
  }
  return { delete: true, reason: 'duplicate_or_stale_google_row' }
}

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // optional
  }
}

loadEnvFile('.env.local')

const memberName = process.argv[2] ?? '이현'
const lessonDate = process.argv[3] ?? '2026-06-27'
const labelArg = process.argv.indexOf('--label')
const label = labelArg !== -1 ? process.argv[labelArg + 1] : 'snapshot'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const at = new Date().toISOString()
  console.log(JSON.stringify({ label, at, memberName, lessonDate }, null, 2))

  const { data: members, error: memberError } = await supabase
    .from('members')
    .select('id, name')
    .ilike('name', `%${memberName}%`)
    .limit(10)

  if (memberError) {
    console.error('member query error:', memberError.message)
    process.exit(1)
  }

  const member =
    members?.find((row) => row.name.includes(memberName)) ?? members?.[0]

  if (!member) {
    console.log(JSON.stringify({ error: `회원 없음: ${memberName}` }, null, 2))
    process.exit(0)
  }

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select(
      'id, lesson_date, start_time, member_id, event_type, recurring_master_id, attendance_status, session_deducted, sync_origin, app_modified_at, google_recurring_event_id, google_event_id, original_start_time, created_at',
    )
    .eq('member_id', member.id)
    .eq('lesson_date', lessonDate)

  if (lessonsError) {
    console.error('lessons query error:', lessonsError.message)
  }

  const lessonIds = (lessons ?? []).map((row) => row.id)

  let lesson_sessions = []
  if (lessonIds.length) {
    const { data, error } = await supabase
      .from('lesson_sessions')
      .select('id, lesson_id, status, checked_in_at, created_at, updated_at')
      .in('lesson_id', lessonIds)
    if (error) console.error('lesson_sessions error:', error.message)
    lesson_sessions = data ?? []
  }

  const { data: attendance_records, error: attendanceError } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('member_id', member.id)
    .eq('lesson_date', lessonDate)

  const attendanceRecordsError =
    attendanceError &&
    (attendanceError.message.includes('attendance_records') ||
      attendanceError.message.includes('schema cache'))
      ? attendanceError.message
      : attendanceError
        ? attendanceError.message
        : undefined

  const { data: masters } = await supabase
    .from('lessons')
    .select(
      'id, lesson_date, start_time, member_id, event_type, google_recurring_event_id, google_event_id, recurrence_group_id, title, content',
    )
    .eq('member_id', member.id)
    .eq('event_type', 'recurring_master')

  const sessionIds = new Set(lesson_sessions.map((row) => row.lesson_id))
  const attendanceRecordKeys = new Set(
    (attendance_records ?? []).map((row) => row.lesson_occurrence_key),
  )

  const lessonAnalysis = (lessons ?? []).map((lesson) => ({
    id: lesson.id,
    event_type: lesson.event_type,
    google_event_id: lesson.google_event_id,
    recurring_master_id: lesson.recurring_master_id,
    sync_origin: lesson.sync_origin,
    session_deducted: lesson.session_deducted,
    attendance_status: lesson.attendance_status,
    lesson_occurrence_key: buildLessonOccurrenceKey(lesson),
    has_lesson_session: sessionIds.has(lesson.id),
    google_consolidation: wouldGoogleConsolidationDelete(
      lesson,
      sessionIds,
      attendanceRecordKeys,
    ),
  }))

  console.log(
    JSON.stringify(
      {
        member,
        lessons: lessons ?? [],
        recurring_masters: masters ?? [],
        lesson_sessions,
        attendance_records: attendance_records ?? [],
        attendance_records_error: attendanceRecordsError,
        attendance_records_hint: attendanceRecordsError
          ? 'Run supabase/add-attendance-records.sql in Supabase SQL Editor'
          : undefined,
        lesson_analysis: lessonAnalysis,
        summary: {
          lesson_count: lessons?.length ?? 0,
          lesson_session_count: lesson_sessions.length,
          attendance_record_count: attendance_records?.length ?? 0,
          present_records: (attendance_records ?? []).filter(
            (row) => row.status === 'present' && row.checked_in_at,
          ).length,
          vulnerable_to_google_delete: lessonAnalysis.filter(
            (row) => row.google_consolidation.delete,
          ).length,
        },
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
