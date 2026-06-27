'use server'

import { requireRole } from '@/lib/actions/auth'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { resolveLessonTitle } from '@/lib/calendar-utils'
import { getLessonSlotDedupeKey } from '@/lib/lesson-slot-dedupe'

export type GoogleLessonDuplicateCandidate = {
  groupKey: string
  keeperId: string
  deleteCandidateIds: string[]
  rows: Array<{
    id: string
    lesson_date: string
    start_time: string | null
    member_label: string
    instructor_id: string | null
    google_event_id: string | null
    google_calendar_id: string | null
    session_deducted: boolean
    created_at: string | null
  }>
}

function googleCompositeKey(row: {
  google_event_id: string | null
  google_calendar_id: string | null
  google_account_id: string | null
}): string | null {
  if (!row.google_event_id) return null
  if (row.google_account_id && row.google_calendar_id) {
    return `g:${row.google_account_id}|${row.google_calendar_id}|${row.google_event_id}`
  }
  return `e:${row.google_event_id}`
}

/** 중복 Google 일정 후보 목록 (삭제 전 검토용) */
export async function listGoogleLessonDuplicateCandidates(): Promise<
  { ok: true; groups: GoogleLessonDuplicateCandidate[] } | { ok: false; error: string }
> {
  await requireRole(['admin'])

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('lessons')
    .select(
      'id, lesson_date, start_time, end_time, member_id, title, content, instructor_id, google_event_id, google_calendar_id, google_account_id, session_deducted, created_at, member:members(name)',
    )
    .not('google_event_id', 'is', null)
    .order('lesson_date', { ascending: true })
    .limit(5000)

  if (error) return { ok: false, error: error.message }

  const byGoogle = new Map<string, typeof data>()
  const bySlot = new Map<string, typeof data>()

  for (const row of data ?? []) {
    const gKey = googleCompositeKey(row)
    if (gKey) {
      const list = byGoogle.get(gKey) ?? []
      list.push(row)
      byGoogle.set(gKey, list)
    }
    const slotKey = getLessonSlotDedupeKey(row)
    if (slotKey) {
      const list = bySlot.get(slotKey) ?? []
      list.push(row)
      bySlot.set(slotKey, list)
    }
  }

  const groups: GoogleLessonDuplicateCandidate[] = []

  function pushGroup(groupKey: string, rows: NonNullable<typeof data>) {
    if (rows.length <= 1) return
    const sorted = [...rows].sort((a, b) => {
      if (a.session_deducted && !b.session_deducted) return -1
      if (!a.session_deducted && b.session_deducted) return 1
      return (a.created_at ?? '').localeCompare(b.created_at ?? '')
    })
    const keeper = sorted[0]
    const deleteCandidateIds = sorted
      .slice(1)
      .filter((row) => !row.session_deducted)
      .map((row) => row.id)
    if (deleteCandidateIds.length === 0) return

    groups.push({
      groupKey,
      keeperId: keeper.id,
      deleteCandidateIds,
      rows: sorted.map((row) => ({
        id: row.id,
        lesson_date: row.lesson_date,
        start_time: row.start_time,
        member_label:
          (Array.isArray(row.member) ? row.member[0]?.name : row.member?.name) ??
          resolveLessonTitle(row) ??
          '—',
        instructor_id: row.instructor_id,
        google_event_id: row.google_event_id,
        google_calendar_id: row.google_calendar_id,
        session_deducted: Boolean(row.session_deducted),
        created_at: row.created_at,
      })),
    })
  }

  for (const [key, rows] of byGoogle) {
    if (rows.length > 1) pushGroup(`google:${key}`, rows)
  }
  for (const [key, rows] of bySlot) {
    if (rows.length > 1) pushGroup(`slot:${key}`, rows)
  }

  console.info('[google-calendar] duplicate candidates', {
    groupCount: groups.length,
    deleteCandidates: groups.reduce((sum, g) => sum + g.deleteCandidateIds.length, 0),
  })

  return { ok: true, groups }
}
