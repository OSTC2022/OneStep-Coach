import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { extractMemberNameFromCalendarLabel } from '@/lib/member-utils'
import {
  isGoogleEventCancelled,
  normalizeGoogleEventTitle,
  parseGoogleEventDateTime,
} from '@/lib/google-calendar/event-mapper'
import type { GoogleCalendarEvent, GoogleCalendarSyncResult } from '@/lib/google-calendar/types'

export const MAX_EVENTS_PER_SYNC = 100
const UPDATE_CHUNK_SIZE = 12

type ExistingLesson = {
  id: string
  session_deducted: boolean
}

export async function loadMemberNameMap(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('members').select('id, name')
  if (error) throw new Error(error.message)

  const nameCounts = new Map<string, number>()
  for (const row of data ?? []) {
    const name = row.name?.trim()
    if (!name) continue
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
  }

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    const name = row.name?.trim()
    if (!name || nameCounts.get(name) !== 1) continue
    map.set(name, row.id)
  }
  return map
}

export async function loadExistingByGoogleEventId(
  supabase: ReturnType<typeof createAdminClient>,
  googleEventIds: string[],
): Promise<Map<string, ExistingLesson>> {
  const map = new Map<string, ExistingLesson>()
  if (googleEventIds.length === 0) return map

  const { data, error } = await supabase
    .from('lessons')
    .select('id, google_event_id, session_deducted')
    .in('google_event_id', googleEventIds)

  if (error) {
    if (error.message.includes('google_event_id')) return map
    throw new Error(error.message)
  }

  for (const row of data ?? []) {
    if (!row.google_event_id) continue
    map.set(row.google_event_id, {
      id: row.id,
      session_deducted: Boolean(row.session_deducted),
    })
  }
  return map
}

function eventSortKey(event: GoogleCalendarEvent): string {
  return event.start?.dateTime ?? event.start?.date ?? ''
}

function buildLessonPayload(
  event: GoogleCalendarEvent,
  memberId: string | null,
): Record<string, unknown> | null {
  const schedule = parseGoogleEventDateTime(event)
  if (!schedule || !event.id) return null

  const title = normalizeGoogleEventTitle(event.summary)
  return {
    lesson_date: schedule.lessonDate,
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    title: memberId ? null : title,
    member_id: memberId,
    session_package_id: null,
    google_event_id: event.id,
    google_sync_status: memberId ? null : 'pending_member',
    attendance_status: 'present',
    special_note: memberId
      ? null
      : '[구글 캘린더] 회원 자동 연결 실패 — 캘린더에서 회원을 지정해 주세요.',
  }
}

export async function applyGoogleEventsBatch(
  supabase: ReturnType<typeof createAdminClient>,
  events: GoogleCalendarEvent[],
  memberMap: Map<string, string>,
  existingMap: Map<string, ExistingLesson>,
): Promise<GoogleCalendarSyncResult> {
  const result: GoogleCalendarSyncResult = {
    created: 0,
    updated: 0,
    cancelled: 0,
    pendingMember: 0,
    skipped: 0,
  }

  const sorted = [...events].sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)))
  const limited = sorted.slice(0, MAX_EVENTS_PER_SYNC)

  const toInsert: Record<string, unknown>[] = []
  const toUpdate: { id: string; payload: Record<string, unknown>; pending: boolean }[] = []
  const toCancelIds: string[] = []

  for (const event of limited) {
    if (!event.id) {
      result.skipped += 1
      continue
    }

    const existing = existingMap.get(event.id)

    if (isGoogleEventCancelled(event)) {
      if (existing && !existing.session_deducted) {
        toCancelIds.push(existing.id)
      } else {
        result.skipped += 1
      }
      continue
    }

    const title = normalizeGoogleEventTitle(event.summary)
    const memberName = extractMemberNameFromCalendarLabel(title)
    const memberId = memberMap.get(memberName.trim()) ?? null
    const payload = buildLessonPayload(event, memberId)
    if (!payload) {
      result.skipped += 1
      continue
    }

    if (existing) {
      if (existing.session_deducted) {
        result.skipped += 1
        continue
      }
      toUpdate.push({ id: existing.id, payload, pending: !memberId })
      continue
    }

    toInsert.push({
      ...payload,
      lesson_type: '개인레슨',
      session_deducted: false,
    })
  }

  if (toCancelIds.length > 0) {
    const { error } = await supabase
      .from('lessons')
      .update({ attendance_status: 'cancelled' })
      .in('id', toCancelIds)
    if (error) throw new Error(error.message)
    result.cancelled = toCancelIds.length
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('lessons').insert(toInsert)
    if (error) throw new Error(error.message)
    result.created = toInsert.length
    result.pendingMember += toInsert.filter(
      (row) => row.google_sync_status === 'pending_member',
    ).length
    result.created -= result.pendingMember
  }

  for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = toUpdate.slice(i, i + UPDATE_CHUNK_SIZE)
    await Promise.all(
      chunk.map(async (item) => {
        const { error } = await supabase.from('lessons').update(item.payload).eq('id', item.id)
        if (error) throw new Error(error.message)
      }),
    )
    result.updated += chunk.filter((item) => !item.pending).length
    result.pendingMember += chunk.filter((item) => item.pending).length
  }

  if (sorted.length > MAX_EVENTS_PER_SYNC) {
    result.skipped += sorted.length - MAX_EVENTS_PER_SYNC
  }

  return result
}
