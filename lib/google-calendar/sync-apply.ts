import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { extractMemberNameFromCalendarLabel } from '@/lib/member-utils'
import {
  buildLessonSlotDateKey,
  googleRecurrenceGroupId,
  loadExistingLessonsBySlotKeys,
  type LessonSlotLookupCandidate,
} from '@/lib/lesson-slot-utils'
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
  google_event_id?: string | null
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
  title: string,
): Record<string, unknown> | null {
  const schedule = parseGoogleEventDateTime(event)
  if (!schedule || !event.id) return null

  const payload: Record<string, unknown> = {
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

  if (event.recurringEventId) {
    payload.recurrence_group_id = googleRecurrenceGroupId(event.recurringEventId)
  }

  return payload
}

function emptySyncResult(): GoogleCalendarSyncResult {
  return {
    created: 0,
    updated: 0,
    linked: 0,
    cancelled: 0,
    pendingMember: 0,
    skipped: 0,
  }
}

export async function applyGoogleEventsBatch(
  supabase: ReturnType<typeof createAdminClient>,
  events: GoogleCalendarEvent[],
  memberMap: Map<string, string>,
  existingMap: Map<string, ExistingLesson>,
): Promise<GoogleCalendarSyncResult> {
  const result = emptySyncResult()

  const sorted = [...events].sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)))
  const limited = sorted.slice(0, MAX_EVENTS_PER_SYNC)

  type PendingEvent = {
    event: GoogleCalendarEvent
    memberId: string | null
    title: string
    payload: Record<string, unknown>
    slotKey: string
  }

  const pendingEvents: PendingEvent[] = []
  const toCancelIds: string[] = []

  for (const event of limited) {
    if (!event.id) {
      result.skipped += 1
      continue
    }

    const existingByGoogleId = existingMap.get(event.id)

    if (isGoogleEventCancelled(event)) {
      if (existingByGoogleId && !existingByGoogleId.session_deducted) {
        toCancelIds.push(existingByGoogleId.id)
      } else {
        result.skipped += 1
      }
      continue
    }

    const title = normalizeGoogleEventTitle(event.summary)
    const memberName = extractMemberNameFromCalendarLabel(title)
    const memberId = memberMap.get(memberName.trim()) ?? null
    const payload = buildLessonPayload(event, memberId, title)
    if (!payload) {
      result.skipped += 1
      continue
    }

    if (existingByGoogleId) {
      pendingEvents.push({
        event,
        memberId,
        title,
        payload,
        slotKey: `google:${event.id}`,
      })
      continue
    }

    const slotKey = buildLessonSlotDateKey(String(payload.lesson_date), {
      memberId,
      title: memberId ? null : title,
      instructorId: null,
      startTime: (payload.start_time as string | null) ?? null,
    })

    pendingEvents.push({
      event,
      memberId,
      title,
      payload,
      slotKey: slotKey || `google:${event.id}`,
    })
  }

  const slotCandidates: LessonSlotLookupCandidate[] = pendingEvents
    .filter((item) => !existingMap.has(item.event.id!))
    .map((item) => ({
      lessonDate: String(item.payload.lesson_date),
      memberId: item.memberId,
      title: item.title,
      startTime: (item.payload.start_time as string | null) ?? null,
    }))

  const slotExistingMap = await loadExistingLessonsBySlotKeys(supabase, slotCandidates)

  const toInsert: Record<string, unknown>[] = []
  const toUpdate: {
    id: string
    payload: Record<string, unknown>
    pending: boolean
    linked: boolean
  }[] = []

  for (const item of pendingEvents) {
    const existingByGoogleId = existingMap.get(item.event.id!)

    if (existingByGoogleId) {
      if (existingByGoogleId.session_deducted) {
        result.skipped += 1
        continue
      }
      toUpdate.push({
        id: existingByGoogleId.id,
        payload: item.payload,
        pending: !item.memberId,
        linked: false,
      })
      continue
    }

    const slotMatch = slotExistingMap.get(item.slotKey)
    if (slotMatch) {
      if (slotMatch.session_deducted) {
        result.skipped += 1
        continue
      }
      if (
        slotMatch.google_event_id &&
        slotMatch.google_event_id !== item.event.id
      ) {
        result.skipped += 1
        continue
      }

      toUpdate.push({
        id: slotMatch.id,
        payload: item.payload,
        pending: !item.memberId,
        linked: true,
      })
      continue
    }

    toInsert.push({
      ...item.payload,
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
    let { error } = await supabase.from('lessons').insert(toInsert)
    if (error?.message.includes('recurrence_group_id')) {
      const fallbackRows = toInsert.map((row) => {
        const { recurrence_group_id: _removed, ...rest } = row
        return rest
      })
      const retry = await supabase.from('lessons').insert(fallbackRows)
      error = retry.error
    }
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
        let payload = item.payload
        let { error } = await supabase.from('lessons').update(payload).eq('id', item.id)
        if (error?.message.includes('recurrence_group_id')) {
          const { recurrence_group_id: _removed, ...fallbackPayload } = payload
          const retry = await supabase
            .from('lessons')
            .update(fallbackPayload)
            .eq('id', item.id)
          error = retry.error
        }
        if (error) throw new Error(error.message)
      }),
    )
    result.linked += chunk.filter((item) => item.linked).length
    result.updated += chunk.filter((item) => !item.linked && !item.pending).length
    result.pendingMember += chunk.filter((item) => item.pending).length
  }

  if (sorted.length > MAX_EVENTS_PER_SYNC) {
    result.skipped += sorted.length - MAX_EVENTS_PER_SYNC
  }

  return result
}
