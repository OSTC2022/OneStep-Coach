import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { extractMemberNameFromCalendarLabel } from '@/lib/member-utils'
import { googleRecurrenceGroupId } from '@/lib/lesson-slot-utils'
import {
  googleRecurrenceToPattern,
  isGoogleRecurrenceException,
  isGoogleRecurringMaster,
  parseGoogleOriginalStartIso,
  shouldSkipGoogleExpandedInstance,
} from '@/lib/calendar-recurrence/google-sync-mapper'
import { addExdateToRecurrence } from '@/lib/calendar-recurrence/expand-lessons'
import {
  isGoogleEventCancelled,
  normalizeGoogleEventTitle,
  parseGoogleEventDateTime,
} from '@/lib/google-calendar/event-mapper'
import type { GoogleCalendarEvent, GoogleCalendarSyncResult } from '@/lib/google-calendar/types'

export const MAX_EVENTS_PER_SYNC = 100
const UPDATE_CHUNK_SIZE = 12
const APPLY_BATCH_SIZE = 100

type ExistingLesson = {
  id: string
  session_deducted: boolean
  google_event_id?: string | null
  event_type?: string | null
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

  const chunkSize = 200
  for (let offset = 0; offset < googleEventIds.length; offset += chunkSize) {
    const chunk = googleEventIds.slice(offset, offset + chunkSize)
    const { data, error } = await supabase
      .from('lessons')
      .select('id, google_event_id, session_deducted, event_type')
      .in('google_event_id', chunk)

    if (error) {
      if (error.message.includes('google_event_id')) return map
      throw new Error(error.message)
    }

    for (const row of data ?? []) {
      if (!row.google_event_id) continue
      map.set(row.google_event_id, {
        id: row.id,
        session_deducted: Boolean(row.session_deducted),
        google_event_id: row.google_event_id,
        event_type: row.event_type,
      })
    }
  }

  return map
}

export async function loadExistingByGoogleRecurringInstance(
  supabase: ReturnType<typeof createAdminClient>,
  keys: { recurringEventId: string; originalStartIso: string }[],
): Promise<Map<string, ExistingLesson>> {
  const map = new Map<string, ExistingLesson>()
  if (keys.length === 0) return map

  for (const key of keys) {
    const { data, error } = await supabase
      .from('lessons')
      .select('id, session_deducted, google_recurring_event_id, original_start_time')
      .eq('google_recurring_event_id', key.recurringEventId)
      .eq('original_start_time', key.originalStartIso)
      .maybeSingle()

    if (error) {
      if (
        error.message.includes('google_recurring_event_id') ||
        error.message.includes('original_start_time')
      ) {
        return map
      }
      throw new Error(error.message)
    }

    if (data?.id) {
      map.set(`${key.recurringEventId}|${key.originalStartIso}`, {
        id: data.id,
        session_deducted: Boolean(data.session_deducted),
      })
    }
  }

  return map
}

function eventSortKey(event: GoogleCalendarEvent): string {
  return event.start?.dateTime ?? event.start?.date ?? ''
}

function buildGoogleLessonBase(
  event: GoogleCalendarEvent,
  memberId: string | null,
  title: string,
  calendarId?: string,
): Record<string, unknown> | null {
  const schedule = parseGoogleEventDateTime(event)
  if (!schedule || !event.id) return null

  return {
    lesson_date: schedule.lessonDate,
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    title: memberId ? null : title,
    member_id: memberId,
    session_package_id: null,
    google_event_id: event.id,
    google_calendar_id: calendarId ?? null,
    google_ical_uid: event.iCalUID ?? null,
    google_sync_status: memberId ? null : 'pending_member',
    attendance_status: isGoogleEventCancelled(event) ? 'cancelled' : 'present',
    event_status: isGoogleEventCancelled(event) ? 'cancelled' : 'confirmed',
    event_timezone: event.start?.timeZone ?? 'Asia/Seoul',
    special_note: memberId
      ? null
      : '[구글 캘린더] 회원 자동 연결 실패 — 캘린더에서 회원을 지정해 주세요.',
  }
}

function buildMasterPayload(
  event: GoogleCalendarEvent,
  memberId: string | null,
  title: string,
  calendarId?: string,
): Record<string, unknown> | null {
  const base = buildGoogleLessonBase(event, memberId, title, calendarId)
  if (!base || !event.recurrence?.length) return null

  const pattern = googleRecurrenceToPattern(event.recurrence)
  const groupId = googleRecurrenceGroupId(event.id)

  return {
    ...base,
    event_type: 'recurring_master',
    recurrence: event.recurrence,
    recurrence_pattern: pattern === 'none' ? 'weekly' : pattern,
    recurrence_group_id: groupId,
    google_recurring_event_id: event.id,
  }
}

function buildExceptionPayload(
  event: GoogleCalendarEvent,
  memberId: string | null,
  title: string,
  masterId: string | null,
  calendarId?: string,
): Record<string, unknown> | null {
  const base = buildGoogleLessonBase(event, memberId, title, calendarId)
  if (!base || !event.recurringEventId) return null

  const originalStart = parseGoogleOriginalStartIso(event)
  const groupId = googleRecurrenceGroupId(event.recurringEventId)

  return {
    ...base,
    event_type: 'exception',
    recurring_master_id: masterId,
    google_recurring_event_id: event.recurringEventId,
    original_start_time: originalStart,
    recurrence_group_id: groupId,
    google_event_id: event.id,
  }
}

function buildSinglePayload(
  event: GoogleCalendarEvent,
  memberId: string | null,
  title: string,
  calendarId?: string,
): Record<string, unknown> | null {
  const base = buildGoogleLessonBase(event, memberId, title, calendarId)
  if (!base) return null
  return {
    ...base,
    event_type: 'single',
  }
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
  calendarId?: string,
): Promise<GoogleCalendarSyncResult> {
  const result = emptySyncResult()
  const sorted = [...events].sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)))

  for (let offset = 0; offset < sorted.length; offset += APPLY_BATCH_SIZE) {
    const chunk = sorted.slice(offset, offset + APPLY_BATCH_SIZE)
    const chunkResult = await applyGoogleEventsChunk(
      supabase,
      chunk,
      memberMap,
      existingMap,
      calendarId,
    )
    result.created += chunkResult.created
    result.updated += chunkResult.updated
    result.linked += chunkResult.linked
    result.cancelled += chunkResult.cancelled
    result.pendingMember += chunkResult.pendingMember
    result.skipped += chunkResult.skipped
  }

  return result
}

async function resolveMasterIdByGoogleRecurringEventId(
  supabase: ReturnType<typeof createAdminClient>,
  recurringEventId: string,
): Promise<string | null> {
  const groupId = googleRecurrenceGroupId(recurringEventId)
  const { data } = await supabase
    .from('lessons')
    .select('id')
    .eq('event_type', 'recurring_master')
    .or(`google_event_id.eq.${recurringEventId},recurrence_group_id.eq.${groupId}`)
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function bulkDeleteLessonIds(
  supabase: ReturnType<typeof createAdminClient>,
  ids: string[],
) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return

  const chunkSize = 100
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const { error } = await supabase.from('lessons').delete().in('id', chunk)
    if (error) throw new Error(error.message)
  }
}

async function deleteGoogleRecurringSeries(
  supabase: ReturnType<typeof createAdminClient>,
  masterGoogleEventId: string,
  knownMasterDbId?: string | null,
): Promise<number> {
  const groupId = googleRecurrenceGroupId(masterGoogleEventId)
  const deleteIds = new Set<string>()

  const { data: masters } = await supabase
    .from('lessons')
    .select('id')
    .eq('event_type', 'recurring_master')
    .or(`google_event_id.eq.${masterGoogleEventId},recurrence_group_id.eq.${groupId}`)

  const masterIds = new Set<string>()
  if (knownMasterDbId) masterIds.add(knownMasterDbId)
  for (const row of masters ?? []) {
    masterIds.add(row.id)
  }

  for (const masterId of masterIds) {
    deleteIds.add(masterId)
    const { data: exceptions } = await supabase
      .from('lessons')
      .select('id, session_deducted')
      .eq('recurring_master_id', masterId)
    for (const row of exceptions ?? []) {
      if (!row.session_deducted) deleteIds.add(row.id)
    }
  }

  const { data: groupRows } = await supabase
    .from('lessons')
    .select('id, session_deducted, event_type')
    .eq('recurrence_group_id', groupId)

  for (const row of groupRows ?? []) {
    if (row.session_deducted) continue
    deleteIds.add(row.id)
  }

  const { data: linkedRows } = await supabase
    .from('lessons')
    .select('id, session_deducted')
    .eq('google_recurring_event_id', masterGoogleEventId)

  for (const row of linkedRows ?? []) {
    if (row.session_deducted) continue
    deleteIds.add(row.id)
  }

  const ids = [...deleteIds]
  if (!ids.length) return 0
  await bulkDeleteLessonIds(supabase, ids)
  return ids.length
}

async function consolidateGoogleRecurringSeriesRows(
  supabase: ReturnType<typeof createAdminClient>,
  options: {
    masterGoogleEventId: string
    masterDbId: string
    recurrenceGroupId: string
    instanceGoogleEventIds: string[]
  },
): Promise<number> {
  const deleteIds = new Set<string>()

  if (options.instanceGoogleEventIds.length) {
    const { data } = await supabase
      .from('lessons')
      .select('id, session_deducted, event_type')
      .in('google_event_id', options.instanceGoogleEventIds)

    for (const row of data ?? []) {
      if (row.session_deducted) continue
      if (row.event_type === 'recurring_master') continue
      deleteIds.add(row.id)
    }
  }

  const { data: groupDupes } = await supabase
    .from('lessons')
    .select('id, session_deducted, event_type')
    .eq('recurrence_group_id', options.recurrenceGroupId)
    .neq('id', options.masterDbId)

  for (const row of groupDupes ?? []) {
    if (row.session_deducted) continue
    if (row.event_type === 'recurring_master') continue
    deleteIds.add(row.id)
  }

  const { data: linkedDupes } = await supabase
    .from('lessons')
    .select('id, session_deducted, event_type')
    .eq('google_recurring_event_id', options.masterGoogleEventId)
    .neq('id', options.masterDbId)

  for (const row of linkedDupes ?? []) {
    if (row.session_deducted) continue
    if (row.event_type === 'recurring_master') continue
    deleteIds.add(row.id)
  }

  const ids = [...deleteIds]
  if (!ids.length) return 0
  await bulkDeleteLessonIds(supabase, ids)
  return ids.length
}

async function applyGoogleEventsChunk(
  supabase: ReturnType<typeof createAdminClient>,
  events: GoogleCalendarEvent[],
  memberMap: Map<string, string>,
  existingMap: Map<string, ExistingLesson>,
  calendarId?: string,
): Promise<GoogleCalendarSyncResult> {
  const result = emptySyncResult()

  const masters = events.filter(isGoogleRecurringMaster)
  const exceptions = events.filter(
    (event) => isGoogleRecurrenceException(event) || (event.recurringEventId && isGoogleEventCancelled(event)),
  )
  const singles = events.filter(
    (event) =>
      !isGoogleRecurringMaster(event) &&
      !event.recurringEventId &&
      !shouldSkipGoogleExpandedInstance(event),
  )
  const skippedInstances = events.filter(shouldSkipGoogleExpandedInstance)

  const skippedByMasterEventId = new Map<string, string[]>()
  for (const event of skippedInstances) {
    const masterGoogleId = event.recurringEventId
    if (!masterGoogleId || !event.id) continue
    const list = skippedByMasterEventId.get(masterGoogleId) ?? []
    list.push(event.id)
    skippedByMasterEventId.set(masterGoogleId, list)
  }

  result.skipped += skippedInstances.length

  for (const event of masters) {
    if (!event.id) continue

    if (isGoogleEventCancelled(event)) {
      const existing = existingMap.get(event.id)
      if (existing?.session_deducted) {
        result.skipped += 1
        continue
      }
      const removed = await deleteGoogleRecurringSeries(
        supabase,
        event.id,
        existing?.id,
      )
      if (removed > 0) {
        result.cancelled += removed
        existingMap.delete(event.id)
      } else {
        result.skipped += 1
      }
      continue
    }

    const title = normalizeGoogleEventTitle(event.summary)
    const memberName = extractMemberNameFromCalendarLabel(title)
    const memberId = memberMap.get(memberName.trim()) ?? null
    const payload = buildMasterPayload(event, memberId, title, calendarId)
    if (!payload) {
      result.skipped += 1
      continue
    }

    const existing = existingMap.get(event.id)
    if (existing?.session_deducted) {
      result.skipped += 1
      continue
    }

    if (existing) {
      const { error } = await supabase.from('lessons').update(payload).eq('id', existing.id)
      if (error) throw new Error(error.message)
      result.updated += 1
      if (!memberId) result.pendingMember += 1
      await consolidateGoogleRecurringSeriesRows(supabase, {
        masterGoogleEventId: event.id,
        masterDbId: existing.id,
        recurrenceGroupId: googleRecurrenceGroupId(event.id),
        instanceGoogleEventIds: skippedByMasterEventId.get(event.id) ?? [],
      })
      continue
    }

    const { data, error } = await supabase
      .from('lessons')
      .insert({ ...payload, lesson_type: '개인레슨', session_deducted: false })
      .select('id, google_event_id')
      .single()

    if (error) {
      if (error.message.includes('event_type')) {
        result.skipped += 1
        continue
      }
      throw new Error(error.message)
    }

    result.created += 1
    if (!memberId) result.pendingMember += 1
    if (data?.google_event_id) {
      existingMap.set(data.google_event_id, {
        id: data.id,
        session_deducted: false,
        google_event_id: data.google_event_id,
        event_type: 'recurring_master',
      })
      await consolidateGoogleRecurringSeriesRows(supabase, {
        masterGoogleEventId: event.id,
        masterDbId: data.id,
        recurrenceGroupId: googleRecurrenceGroupId(event.id),
        instanceGoogleEventIds: skippedByMasterEventId.get(event.id) ?? [],
      })
    }
  }

  for (const event of exceptions) {
    if (!event.id || !event.recurringEventId) continue
    const title = normalizeGoogleEventTitle(event.summary)
    const memberName = extractMemberNameFromCalendarLabel(title)
    const memberId = memberMap.get(memberName.trim()) ?? null
    const masterId = await resolveMasterIdByGoogleRecurringEventId(
      supabase,
      event.recurringEventId,
    )

    if (isGoogleEventCancelled(event) && masterId) {
      const schedule = parseGoogleEventDateTime(event)
      if (schedule) {
        const { data: masterRow } = await supabase
          .from('lessons')
          .select('recurrence, start_time')
          .eq('id', masterId)
          .maybeSingle()

        if (masterRow) {
          await supabase
            .from('lessons')
            .update({
              recurrence: addExdateToRecurrence(
                masterRow.recurrence as string[] | null,
                schedule.lessonDate,
                masterRow.start_time as string | null,
              ),
            })
            .eq('id', masterId)
        }
      }

      const existing = existingMap.get(event.id)
      if (existing && !existing.session_deducted) {
        await supabase.from('lessons').delete().eq('id', existing.id)
        result.cancelled += 1
      } else {
        result.skipped += 1
      }
      continue
    }

    const payload = buildExceptionPayload(event, memberId, title, masterId, calendarId)
    if (!payload) {
      result.skipped += 1
      continue
    }

    const existing = existingMap.get(event.id)
    if (existing?.session_deducted) {
      result.skipped += 1
      continue
    }

    if (existing) {
      const { error } = await supabase.from('lessons').update(payload).eq('id', existing.id)
      if (error) throw new Error(error.message)
      result.updated += 1
      continue
    }

    const originalStart = payload.original_start_time as string | null
    if (originalStart) {
      const { data: dupe } = await supabase
        .from('lessons')
        .select('id')
        .eq('google_recurring_event_id', event.recurringEventId)
        .eq('original_start_time', originalStart)
        .maybeSingle()
      if (dupe?.id) {
        await supabase.from('lessons').update(payload).eq('id', dupe.id)
        result.updated += 1
        continue
      }
    }

    const { error } = await supabase
      .from('lessons')
      .insert({ ...payload, lesson_type: '개인레슨', session_deducted: false })

    if (error) {
      if (error.message.includes('event_type')) {
        result.skipped += 1
        continue
      }
      throw new Error(error.message)
    }
    result.created += 1
  }

  for (const event of singles) {
    if (!event.id) continue
    if (shouldSkipGoogleExpandedInstance(event)) {
      result.skipped += 1
      continue
    }

    const existing = existingMap.get(event.id)
    if (isGoogleEventCancelled(event)) {
      if (existing && !existing.session_deducted) {
        await supabase
          .from('lessons')
          .update({ attendance_status: 'cancelled', event_status: 'cancelled' })
          .eq('id', existing.id)
        result.cancelled += 1
      } else {
        result.skipped += 1
      }
      continue
    }

    const title = normalizeGoogleEventTitle(event.summary)
    const memberName = extractMemberNameFromCalendarLabel(title)
    const memberId = memberMap.get(memberName.trim()) ?? null
    const payload = buildSinglePayload(event, memberId, title, calendarId)
    if (!payload) {
      result.skipped += 1
      continue
    }

    if (existing?.session_deducted) {
      result.skipped += 1
      continue
    }

    if (existing) {
      const { error } = await supabase.from('lessons').update(payload).eq('id', existing.id)
      if (error) throw new Error(error.message)
      result.updated += 1
      if (!memberId) result.pendingMember += 1
      continue
    }

    const { data, error } = await supabase
      .from('lessons')
      .insert({ ...payload, lesson_type: '개인레슨', session_deducted: false })
      .select('id, google_event_id')
      .single()

    if (error) throw new Error(error.message)
    result.created += 1
    if (!memberId) result.pendingMember += 1
    if (data?.google_event_id) {
      existingMap.set(data.google_event_id, {
        id: data.id,
        session_deducted: false,
        google_event_id: data.google_event_id,
      })
    }
  }

  return result
}
