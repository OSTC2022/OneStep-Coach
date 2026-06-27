/**
 * 중복 lesson row 후보 탐지 (삭제하지 않음)
 *
 * 사용법:
 *   node scripts/find-duplicate-lessons.mjs
 *   node scripts/find-duplicate-lessons.mjs 2026-06-27
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

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

const lessonDateFilter = process.argv[2] ?? null

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing Supabase env')
  process.exit(1)
}

const supabase = createClient(url, key)

function slotKey(row) {
  const start = (row.start_time ?? '00:00').slice(0, 5)
  const member = row.member_id ?? `title:${row.title ?? ''}`
  const instructor = row.instructor_id ?? 'none'
  return `${row.lesson_date}|${start}|${member}|${instructor}`
}

function googleKey(row) {
  if (!row.google_event_id) return null
  return `${row.google_account_id ?? ''}|${row.google_calendar_id ?? ''}|${row.google_event_id}`
}

function recurringKey(row) {
  if (!row.google_recurring_event_id || !row.original_start_time) return null
  return `${row.google_recurring_event_id}|${row.original_start_time}`
}

async function main() {
  let query = supabase
    .from('lessons')
    .select(
      `id, lesson_date, start_time, end_time, member_id, instructor_id, title,
       event_type, recurring_master_id, google_event_id, google_calendar_id, google_account_id,
       google_recurring_event_id, original_start_time, attendance_status, session_deducted,
       sync_origin, app_modified_at, created_at,
       member:members(id, name),
       instructor:instructors(id, name)`,
    )
    .order('lesson_date', { ascending: true })

  if (lessonDateFilter) {
    query = query.eq('lesson_date', lessonDateFilter)
  } else {
    const since = new Date()
    since.setDate(since.getDate() - 30)
    query = query.gte('lesson_date', since.toISOString().slice(0, 10))
  }

  const { data: lessons, error } = await query
  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  const rows = lessons ?? []
  const bySlot = new Map()
  const byGoogle = new Map()
  const byRecurring = new Map()

  for (const row of rows) {
    const sk = slotKey(row)
    if (!bySlot.has(sk)) bySlot.set(sk, [])
    bySlot.get(sk).push(row)

    const gk = googleKey(row)
    if (gk) {
      if (!byGoogle.has(gk)) byGoogle.set(gk, [])
      byGoogle.get(gk).push(row)
    }

    const rk = recurringKey(row)
    if (rk) {
      if (!byRecurring.has(rk)) byRecurring.set(rk, [])
      byRecurring.get(rk).push(row)
    }
  }

  function formatGroup(label, map) {
    const groups = []
    for (const [key, items] of map) {
      if (items.length < 2) continue
      groups.push({
        group_key: key,
        count: items.length,
        rows: items.map((row) => ({
          id: row.id,
          lesson_date: row.lesson_date,
          start_time: row.start_time,
          member: row.member?.name ?? row.title,
          instructor: row.instructor?.name ?? null,
          event_type: row.event_type,
          google_event_id: row.google_event_id,
          google_calendar_id: row.google_calendar_id,
          sync_origin: row.sync_origin,
          session_deducted: row.session_deducted,
          attendance_status: row.attendance_status,
        })),
      })
    }
    return { label, duplicate_groups: groups.length, groups }
  }

  const report = {
    scanned_at: new Date().toISOString(),
    lesson_date_filter: lessonDateFilter,
    total_lessons: rows.length,
    by_slot: formatGroup('same_date_time_member_instructor', bySlot),
    by_google_event: formatGroup('same_google_event_id', byGoogle),
    by_recurring_instance: formatGroup('same_recurring_original_start', byRecurring),
    note: '후보만 출력합니다. 자동 삭제하지 않습니다.',
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
