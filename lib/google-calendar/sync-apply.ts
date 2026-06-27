import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { MemberLookup } from '@/lib/google-calendar/member-matcher'
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
import {
  googleEventUpdatedAt,
  preserveInstructorOnGoogleSync,
  shouldApplyGoogleEvent,
} from '@/lib/google-calendar/sync-conflict'
import {
  logGoogleSyncConsolidationStart,
  shouldDeleteOnGoogleConsolidation,
  type GoogleSyncConsolidationCandidate,
} from '@/lib/google-calendar/sync-consolidation-log'
import {
  buildGoogleMirrorPayload,
  shouldApplyGoogleContentFromGoogle,
  shouldUpdateGoogleMirror,
} from '@/lib/google-calendar/sync-mirror'
import {
  buildLessonOccurrenceKey,
  lessonToOccurrenceKeyInput,
} from '@/lib/lesson-occurrence-key'
import { GOOGLE_LESSON_ID_PROPERTY } from '@/lib/google-calendar/config'
import type { GoogleCalendarEvent, GoogleCalendarSyncResult } from '@/lib/google-calendar/types'

export const MAX_EVENTS_PER_SYNC = 100
const BULK_UPSERT_SIZE = 50
const APPLY_BATCH_SIZE = 100

const GOOGLE_PENDING_MEMBER_NOTE =
  '[구글 캘린더] 회원 자동 연결 실패 — 캘린더에서 회원을 지정해 주세요.'

const CONSOLIDATION_LESSON_SELECT =
  'id, session_deducted, event_type, sync_origin, attendance_status, app_modified_at, lesson_sessions(checked_in_at)'

async function loadLessonIdsLinkedToAttendanceRecords(
  supabase: ReturnType<typeof createServiceRoleClient>,
  lessonIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(lessonIds.filter(Boolean))]
  if (!unique.length) return new Set()

  const linked = new Set<string>()
  const chunkSize = 100
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const { data } = await supabase
      .from('attendance_records')
      .select('lesson_id')
      .in('lesson_id', chunk)
    for (const row of data ?? []) {
      if (row.lesson_id) linked.add(row.lesson_id as string)
    }
  }
  return linked
}

function shouldDeleteLessonRow(
  row: {
    id: string
    session_deducted?: boolean | null
    sync_origin?: string | null
    app_modified_at?: string | null
    attendance_status?: string | null
    event_type?: string | null
    lesson_sessions?: Array<{ checked_in_at?: string | null }> | null
  },
  attendanceLinkedLessonIds: Set<string>,
): boolean {
  return shouldDeleteOnGoogleConsolidation({
    ...row,
    has_attendance_record: attendanceLinkedLessonIds.has(row.id),
  })
}

async function canDeleteLessonOnGoogleSync(
  supabase: ReturnType<typeof createServiceRoleClient>,
  row: GoogleSyncConsolidationCandidate,
  attendanceLinkedLessonIds?: Set<string>,
): Promise<boolean> {
  const linked =
    attendanceLinkedLessonIds ??
    (await loadLessonIdsLinkedToAttendanceRecords(supabase, [row.id]))

  let hasAttendanceRecord = linked.has(row.id)

  if (!hasAttendanceRecord) {
    const { data: fullRow } = await supabase
      .from('lessons')
      .select(
        'id, member_id, lesson_date, start_time, title, content, google_recurring_event_id, google_event_id, recurring_master_id, original_start_time',
      )
      .eq('id', row.id)
      .maybeSingle()

    if (fullRow?.member_id) {
      const occurrenceKey = buildLessonOccurrenceKey(
        lessonToOccurrenceKeyInput(
          fullRow as Parameters<typeof lessonToOccurrenceKeyInput>[0],
        ),
      )
      if (occurrenceKey) {
        const { data: record } = await supabase
          .from('attendance_records')
          .select('id')
          .eq('lesson_occurrence_key', occurrenceKey)
          .maybeSingle()
        hasAttendanceRecord = Boolean(record)
      }
    }
  }

  return shouldDeleteOnGoogleConsolidation({
    ...row,
    has_attendance_record: hasAttendanceRecord,
  })
}

export function preserveLinkedMemberOnGoogleSync(
  payload: Record<string, unknown>,
  existingMemberId?: string | null,
): Record<string, unknown> {
  if (!existingMemberId) return payload

  const next: Record<string, unknown> = {
    ...payload,
    member_id: existingMemberId,
    title: null,
    google_sync_status: null,
  }

  if (next.special_note === GOOGLE_PENDING_MEMBER_NOTE) {
    next.special_note = null
  }

  return next
}

async function bulkUpsertLessonRows(
  supabase: ReturnType<typeof createServiceRoleClient>,
  rows: Record<string, unknown>[],
  options?: {
    googleAccountId?: string
    googleCalendarId?: string
  },
): Promise<void> {
  if (rows.length === 0) return

  let rowsToWrite = rows
  if (options?.googleAccountId && options.googleCalendarId) {
    const eventIds = rows
      .map((row) => row.google_event_id as string | undefined)
      .filter(Boolean) as string[]
    if (eventIds.length) {
      const linked = await loadExistingByGoogleEventId(supabase, eventIds, {
        googleAccountId: options.googleAccountId,
        googleCalendarId: options.googleCalendarId,
      })
      rowsToWrite = rows.map((row) => {
        const googleEventId = row.google_event_id as string | undefined
        if (!googleEventId) return row
        return preserveLinkedMemberOnGoogleSync(row, linked.get(googleEventId)?.member_id)
      })
    }
  }

  for (let offset = 0; offset < rowsToWrite.length; offset += BULK_UPSERT_SIZE) {
    const chunk = rowsToWrite.slice(offset, offset + BULK_UPSERT_SIZE)
    const { error } = await supabase.from('lessons').upsert(chunk, {
      onConflict: 'google_account_id,google_calendar_id,google_event_id',
    })

    if (error) {
      if (
        error.message.includes('google_account_id') ||
        error.message.includes('on_conflict') ||
        error.code === '42P10'
      ) {
        for (const row of chunk) {
          await upsertGoogleLessonRow(
            supabase,
            row,
            row.google_account_id as string,
            row.google_calendar_id as string,
          )
        }
        continue
      }
      throw new Error(error.message)
    }
  }
}

async function bulkCancelLessonIds(
  supabase: ReturnType<typeof createServiceRoleClient>,
  ids: string[],
) {
  if (ids.length === 0) return
  const unique = [...new Set(ids)]
  for (let offset = 0; offset < unique.length; offset += BULK_UPSERT_SIZE) {
    const chunk = unique.slice(offset, offset + BULK_UPSERT_SIZE)
    const { error } = await supabase
      .from('lessons')
      .update({ attendance_status: 'cancelled', event_status: 'cancelled' })
      .in('id', chunk)
    if (error) throw new Error(error.message)
  }
}
type ExistingLesson = {
  id: string
  session_deducted: boolean
  google_event_id?: string | null
  event_type?: string | null
  member_id?: string | null
  instructor_id?: string | null
  app_modified_at?: string | null
  google_event_updated_at?: string | null
  sync_origin?: string | null
  attendance_status?: string | null
  lesson_sessions?: Array<{ checked_in_at?: string | null }> | null
}

export async function loadExistingByGoogleEventId(
  supabase: ReturnType<typeof createServiceRoleClient>,
  googleEventIds: string[],
  options?: {
    googleAccountId?: string | null
    googleCalendarId?: string | null
  },
): Promise<Map<string, ExistingLesson>> {
  const map = new Map<string, ExistingLesson>()
  if (googleEventIds.length === 0) return map

  const chunkSize = 200
  for (let offset = 0; offset < googleEventIds.length; offset += chunkSize) {
    const chunk = googleEventIds.slice(offset, offset + chunkSize)
    let query = supabase
      .from('lessons')
      .select('id, google_event_id, google_calendar_id, google_account_id, session_deducted, event_type, member_id, instructor_id, app_modified_at, google_event_updated_at, sync_origin, attendance_status, lesson_sessions(checked_in_at)')
      .in('google_event_id', chunk)

    if (options?.googleAccountId) {
      query = query.eq('google_account_id', options.googleAccountId)
    }
    if (options?.googleCalendarId) {
      query = query.eq('google_calendar_id', options.googleCalendarId)
    }

    const { data, error } = await query

    if (error) {
      if (error.message.includes('google_event_id')) return map
      throw new Error(error.message)
    }

    for (const row of data ?? []) {
      if (!row.google_event_id) continue
      if (!map.has(row.google_event_id)) {
        map.set(row.google_event_id, {
          id: row.id,
          session_deducted: Boolean(row.session_deducted),
          google_event_id: row.google_event_id,
          event_type: row.event_type,
          member_id: row.member_id,
          instructor_id: row.instructor_id as string | null | undefined,
          app_modified_at: row.app_modified_at as string | null | undefined,
          google_event_updated_at: row.google_event_updated_at as string | null | undefined,
          sync_origin: row.sync_origin as string | null | undefined,
        })
      }
    }
  }

  return map
}

/** Google 이벤트에 센터 lesson ID가 있으면 기존 행과 연결 (푸시 직후 웹훅 중복 방지) */
export async function enrichExistingMapFromGoogleLessonIds(
  supabase: ReturnType<typeof createServiceRoleClient>,
  events: GoogleCalendarEvent[],
  existingMap: Map<string, ExistingLesson>,
): Promise<void> {
  for (const event of events) {
    if (!event.id || existingMap.has(event.id)) continue
    const lessonId = event.extendedProperties?.private?.[GOOGLE_LESSON_ID_PROPERTY]
    if (!lessonId) continue

    const { data, error } = await supabase
      .from('lessons')
      .select(
        'id, google_event_id, session_deducted, event_type, member_id, instructor_id, app_modified_at, google_event_updated_at, sync_origin',
      )
      .eq('id', lessonId)
      .maybeSingle()

    if (error || !data?.id) continue

    existingMap.set(event.id, {
      id: data.id,
      session_deducted: Boolean(data.session_deducted),
      google_event_id: event.id,
      event_type: data.event_type,
      member_id: data.member_id,
      app_modified_at: data.app_modified_at as string | null | undefined,
      google_event_updated_at: data.google_event_updated_at as string | null | undefined,
    })
  }
}

async function findExistingByGoogleKey(
  supabase: ReturnType<typeof createServiceRoleClient>,
  googleAccountId: string,
  googleCalendarId: string,
  googleEventId: string,
): Promise<ExistingLesson | null> {
  const { data, error } = await supabase
    .from('lessons')
    .select('id, google_event_id, session_deducted, event_type, member_id')
    .eq('google_account_id', googleAccountId)
    .eq('google_calendar_id', googleCalendarId)
    .eq('google_event_id', googleEventId)
    .maybeSingle()

  if (error) {
    if (
      error.message.includes('google_account_id') ||
      error.message.includes('google_calendar_id')
    ) {
      const { data: legacy } = await supabase
        .from('lessons')
        .select('id, google_event_id, session_deducted, event_type, member_id')
        .eq('google_event_id', googleEventId)
        .maybeSingle()
      return legacy
        ? {
            id: legacy.id,
            session_deducted: Boolean(legacy.session_deducted),
            google_event_id: legacy.google_event_id,
            event_type: legacy.event_type,
            member_id: legacy.member_id,
          }
        : null
    }
    throw new Error(error.message)
  }

  if (!data?.id) return null
  return {
    id: data.id,
    session_deducted: Boolean(data.session_deducted),
    google_event_id: data.google_event_id,
    event_type: data.event_type,
    member_id: data.member_id,
  }
}

async function upsertGoogleLessonRow(
  supabase: ReturnType<typeof createServiceRoleClient>,
  payload: Record<string, unknown>,
  googleAccountId: string,
  calendarId: string,
  existing?: ExistingLesson | null,
): Promise<{ id: string; google_event_id: string; created: boolean }> {
  const googleEventId = payload.google_event_id as string | undefined
  if (!googleEventId) {
    throw new Error('google_event_id is required for Google Calendar sync')
  }

  const rowPayload = {
    ...payload,
    google_account_id: googleAccountId,
    google_calendar_id: calendarId,
    lesson_type: '개인레슨',
    session_deducted: false,
  }

  const resolvedExisting =
    existing ??
    (await findExistingByGoogleKey(supabase, googleAccountId, calendarId, googleEventId))

  if (resolvedExisting) {
    const mirrorPayload: Record<string, unknown> = {
      google_event_id: googleEventId,
      google_account_id: googleAccountId,
      google_calendar_id: calendarId,
      google_ical_uid: rowPayload.google_ical_uid ?? null,
      google_external_title: (rowPayload.title as string | null) ?? null,
      google_event_updated_at: rowPayload.google_event_updated_at ?? null,
      google_recurring_event_id: rowPayload.google_recurring_event_id ?? null,
      last_synced_at: new Date().toISOString(),
    }
    if (rowPayload.lesson_date && rowPayload.start_time) {
      const start = String(rowPayload.start_time).slice(0, 5)
      mirrorPayload.google_external_start_time = new Date(
        `${rowPayload.lesson_date}T${start}:00+09:00`,
      ).toISOString()
    }
    const { error } = await supabase
      .from('lessons')
      .update(mirrorPayload)
      .eq('id', resolvedExisting.id)
    if (error) throw new Error(error.message)
    return { id: resolvedExisting.id, google_event_id: googleEventId, created: false }
  }

  const slotExisting = await findExistingLessonBySlot(supabase, {
    memberId: (rowPayload.member_id as string | null) ?? null,
    lessonDate: rowPayload.lesson_date as string,
    startTime: (rowPayload.start_time as string | null) ?? null,
    title: (rowPayload.title as string | null) ?? null,
  })
  if (slotExisting) {
    const mirrorPayload: Record<string, unknown> = {
      google_event_id: googleEventId,
      google_account_id: googleAccountId,
      google_calendar_id: calendarId,
      google_ical_uid: rowPayload.google_ical_uid ?? null,
      google_external_title: (rowPayload.title as string | null) ?? null,
      google_event_updated_at: rowPayload.google_event_updated_at ?? null,
      google_recurring_event_id: rowPayload.google_recurring_event_id ?? null,
      last_synced_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('lessons')
      .update(mirrorPayload)
      .eq('id', slotExisting.id)
    if (error) throw new Error(error.message)
    return { id: slotExisting.id, google_event_id: googleEventId, created: false }
  }

  const { data, error } = await supabase
    .from('lessons')
    .insert(rowPayload)
    .select('id, google_event_id')
    .single()

  if (error) {
    if (error.code === '23505' || error.message.includes('duplicate')) {
      const dupe = await findExistingByGoogleKey(
        supabase,
        googleAccountId,
        calendarId,
        googleEventId,
      )
      if (dupe) {
        const mergedPayload = preserveLinkedMemberOnGoogleSync(rowPayload, dupe.member_id)
        const { error: updateError } = await supabase
          .from('lessons')
          .update(mergedPayload)
          .eq('id', dupe.id)
        if (updateError) throw new Error(updateError.message)
        return { id: dupe.id, google_event_id: googleEventId, created: false }
      }
    }
    throw new Error(error.message)
  }

  return { id: data.id, google_event_id: data.google_event_id, created: true }
}

export async function loadExistingByGoogleRecurringInstance(
  supabase: ReturnType<typeof createServiceRoleClient>,
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

function withGoogleSyncKeys(
  payload: Record<string, unknown>,
  googleAccountId: string,
  calendarId: string,
): Record<string, unknown> {
  return {
    ...payload,
    google_account_id: googleAccountId,
    google_calendar_id: calendarId,
  }
}

function withGoogleEventTimestamp(
  payload: Record<string, unknown>,
  event: GoogleCalendarEvent,
): Record<string, unknown> {
  const updated = googleEventUpdatedAt(event)
  if (!updated) return payload
  return { ...payload, google_event_updated_at: updated }
}

function withGoogleSyncMetadata(
  payload: Record<string, unknown>,
  event: GoogleCalendarEvent,
  options?: { isNewRow?: boolean },
): Record<string, unknown> {
  const now = new Date().toISOString()
  const base = {
    ...withGoogleEventTimestamp(payload, event),
    last_synced_at: now,
  }
  if (options?.isNewRow) {
    return { ...base, sync_origin: 'google' }
  }
  return base
}

async function findExistingLessonBySlot(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: {
    memberId: string | null
    lessonDate: string
    startTime: string | null
    title?: string | null
  },
): Promise<ExistingLesson | null> {
  if (params.memberId) {
    const { data } = await supabase
      .from('lessons')
      .select(
        'id, google_event_id, session_deducted, event_type, member_id, instructor_id, app_modified_at, google_event_updated_at, sync_origin',
      )
      .eq('member_id', params.memberId)
      .eq('lesson_date', params.lessonDate)
      .eq('start_time', params.startTime ?? '00:00:00')
      .limit(1)
      .maybeSingle()
    if (data?.id) {
      return {
        id: data.id,
        session_deducted: Boolean(data.session_deducted),
        google_event_id: data.google_event_id,
        event_type: data.event_type,
        member_id: data.member_id,
        instructor_id: data.instructor_id as string | null | undefined,
        app_modified_at: data.app_modified_at as string | null | undefined,
        google_event_updated_at: data.google_event_updated_at as string | null | undefined,
        sync_origin: data.sync_origin as string | null | undefined,
      }
    }
  }

  const title = params.title?.trim()
  if (title) {
    const { data } = await supabase
      .from('lessons')
      .select(
        'id, google_event_id, session_deducted, event_type, member_id, instructor_id, app_modified_at, google_event_updated_at, sync_origin',
      )
      .eq('lesson_date', params.lessonDate)
      .eq('start_time', params.startTime ?? '00:00:00')
      .eq('title', title)
      .is('member_id', null)
      .limit(1)
      .maybeSingle()
    if (data?.id) {
      return {
        id: data.id,
        session_deducted: Boolean(data.session_deducted),
        google_event_id: data.google_event_id,
        event_type: data.event_type,
        member_id: data.member_id,
        instructor_id: data.instructor_id as string | null | undefined,
        app_modified_at: data.app_modified_at as string | null | undefined,
        google_event_updated_at: data.google_event_updated_at as string | null | undefined,
        sync_origin: data.sync_origin as string | null | undefined,
      }
    }
  }

  return null
}

async function applyGoogleEventToExistingRow(
  supabase: ReturnType<typeof createServiceRoleClient>,
  event: GoogleCalendarEvent,
  existing: ExistingLesson,
  fullPayload: Record<string, unknown>,
  options: {
    googleAccountId: string
    googleCalendarId: string
    googleRecurringEventId?: string | null
  },
): Promise<'updated' | 'skipped'> {
  if (existing.session_deducted) return 'skipped'

  const mirrorOptions = {
    googleAccountId: options.googleAccountId,
    googleCalendarId: options.googleCalendarId,
    googleRecurringEventId: options.googleRecurringEventId,
  }

  if (shouldApplyGoogleContentFromGoogle(existing)) {
    if (!shouldApplyGoogleEvent(event, existing)) return 'skipped'
    const updatePayload = applyGoogleUpdatePayload(
      withGoogleSyncMetadata(
        withGoogleSyncKeys(fullPayload, options.googleAccountId, options.googleCalendarId),
        event,
      ),
      existing,
    )
    const { error } = await supabase
      .from('lessons')
      .update(updatePayload)
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
    return 'updated'
  }

  if (!shouldUpdateGoogleMirror(event, existing)) return 'skipped'

  const mirrorPayload = buildGoogleMirrorPayload(event, mirrorOptions)
  const { error } = await supabase
    .from('lessons')
    .update(mirrorPayload)
    .eq('id', existing.id)
  if (error) throw new Error(error.message)
  return 'updated'
}

function applyGoogleUpdatePayload<
  T extends Record<string, unknown>,
>(
  payload: T,
  existing: {
    member_id?: string | null
    app_modified_at?: string | null
    google_event_updated_at?: string | null
    sync_origin?: string | null
    instructor_id?: string | null
  } | null | undefined,
): T {
  return preserveInstructorOnGoogleSync(
    preserveLinkedMemberOnGoogleSync(payload, existing?.member_id),
    existing,
  ) as T
}

function buildGoogleLessonBase(
  event: GoogleCalendarEvent,
  memberId: string | null,
  title: string,
  calendarId?: string,
  instructorId?: string | null,
): Record<string, unknown> | null {
  const schedule = parseGoogleEventDateTime(event)
  if (!schedule || !event.id) return null

  return {
    lesson_date: schedule.lessonDate,
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    title: memberId ? null : title,
    member_id: memberId,
    instructor_id: instructorId ?? null,
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
      : GOOGLE_PENDING_MEMBER_NOTE,
  }
}

function buildMasterPayload(
  event: GoogleCalendarEvent,
  memberId: string | null,
  title: string,
  calendarId?: string,
  instructorId?: string | null,
): Record<string, unknown> | null {
  const base = buildGoogleLessonBase(event, memberId, title, calendarId, instructorId)
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
  instructorId?: string | null,
): Record<string, unknown> | null {
  const base = buildGoogleLessonBase(event, memberId, title, calendarId, instructorId)
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
  instructorId?: string | null,
): Record<string, unknown> | null {
  const base = buildGoogleLessonBase(event, memberId, title, calendarId, instructorId)
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
  supabase: ReturnType<typeof createServiceRoleClient>,
  events: GoogleCalendarEvent[],
  memberLookup: MemberLookup,
  existingMap: Map<string, ExistingLesson>,
  calendarId?: string,
  googleAccountId?: string,
  instructorId?: string | null,
): Promise<GoogleCalendarSyncResult> {
  const result = emptySyncResult()
  const sorted = [...events].sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)))
  const accountId = googleAccountId ?? 'default'
  const calId = calendarId ?? ''

  for (let offset = 0; offset < sorted.length; offset += APPLY_BATCH_SIZE) {
    const chunk = sorted.slice(offset, offset + APPLY_BATCH_SIZE)
    const chunkResult = await applyGoogleEventsChunk(
      supabase,
      chunk,
      memberLookup,
      existingMap,
      calId,
      accountId,
      instructorId,
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
  supabase: ReturnType<typeof createServiceRoleClient>,
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
  supabase: ReturnType<typeof createServiceRoleClient>,
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
  supabase: ReturnType<typeof createServiceRoleClient>,
  masterGoogleEventId: string,
  knownMasterDbId?: string | null,
): Promise<number> {
  logGoogleSyncConsolidationStart('deleteGoogleRecurringSeries', { masterGoogleEventId })
  const groupId = googleRecurrenceGroupId(masterGoogleEventId)
  const deleteIds = new Set<string>()
  const candidates: Array<{
    id: string
    session_deducted?: boolean | null
    sync_origin?: string | null
    app_modified_at?: string | null
    attendance_status?: string | null
    event_type?: string | null
    lesson_sessions?: Array<{ checked_in_at?: string | null }> | null
  }> = []

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
      .select(CONSOLIDATION_LESSON_SELECT)
      .eq('recurring_master_id', masterId)
    candidates.push(...((exceptions ?? []) as typeof candidates))
  }

  const { data: groupRows } = await supabase
    .from('lessons')
    .select(CONSOLIDATION_LESSON_SELECT)
    .eq('recurrence_group_id', groupId)

  candidates.push(
    ...((groupRows ?? []).filter((row) => row.event_type !== 'recurring_master') as typeof candidates),
  )

  const { data: linkedRows } = await supabase
    .from('lessons')
    .select(CONSOLIDATION_LESSON_SELECT)
    .eq('google_recurring_event_id', masterGoogleEventId)

  candidates.push(...((linkedRows ?? []) as typeof candidates))

  const attendanceLinked = await loadLessonIdsLinkedToAttendanceRecords(
    supabase,
    candidates.map((row) => row.id),
  )

  for (const row of candidates) {
    if (shouldDeleteLessonRow(row, attendanceLinked)) {
      deleteIds.add(row.id)
    }
  }

  const ids = [...deleteIds]
  if (!ids.length) return 0
  await bulkDeleteLessonIds(supabase, ids)
  return ids.length
}

async function consolidateGoogleRecurringSeriesRows(
  supabase: ReturnType<typeof createServiceRoleClient>,
  options: {
    masterGoogleEventId: string
    masterDbId: string
    recurrenceGroupId: string
    instanceGoogleEventIds: string[]
  },
): Promise<number> {
  logGoogleSyncConsolidationStart('consolidateGoogleRecurringSeriesRows', {
    masterGoogleEventId: options.masterGoogleEventId,
    masterDbId: options.masterDbId,
    note: 'auto_delete_disabled_supabase_sot',
  })
  return 0
}

async function applyGoogleEventsChunk(
  supabase: ReturnType<typeof createServiceRoleClient>,
  events: GoogleCalendarEvent[],
  memberLookup: MemberLookup,
  existingMap: Map<string, ExistingLesson>,
  calendarId: string,
  googleAccountId: string,
  instructorId?: string | null,
): Promise<GoogleCalendarSyncResult> {
  const result = emptySyncResult()
  const masterIdCache = new Map<string, string | null>()

  async function resolveMasterIdCached(recurringEventId: string): Promise<string | null> {
    if (masterIdCache.has(recurringEventId)) {
      return masterIdCache.get(recurringEventId) ?? null
    }
    const masterId = await resolveMasterIdByGoogleRecurringEventId(supabase, recurringEventId)
    masterIdCache.set(recurringEventId, masterId)
    return masterId
  }

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
      if (existing?.session_deducted || existing?.sync_origin === 'app') {
        result.skipped += 1
        continue
      }
      if (existing && !shouldApplyGoogleEvent(event, existing)) {
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
    const memberId = memberLookup.resolveMemberId(title)
    const payload = buildMasterPayload(event, memberId, title, calendarId, instructorId)
    if (!payload) {
      result.skipped += 1
      continue
    }

    const existing = existingMap.get(event.id)
    if (existing?.session_deducted) {
      result.skipped += 1
      continue
    }
    if (existing && !shouldApplyGoogleEvent(event, existing)) {
      result.skipped += 1
      continue
    }

    if (existing) {
      const outcome = await applyGoogleEventToExistingRow(
        supabase,
        event,
        existing,
        withGoogleSyncKeys(payload, googleAccountId, calendarId),
        {
          googleAccountId,
          googleCalendarId: calendarId,
          googleRecurringEventId: event.id,
        },
      )
      if (outcome === 'updated') {
        result.updated += 1
        if (!memberId && !existing.member_id) result.pendingMember += 1
      } else {
        result.skipped += 1
      }
      continue
    }

    const saved = await upsertGoogleLessonRow(
      supabase,
      withGoogleSyncMetadata(payload, event, { isNewRow: true }),
      googleAccountId,
      calendarId,
      existing,
    )

    if (saved.created) {
      result.created += 1
    } else {
      result.updated += 1
    }
    if (!memberId) result.pendingMember += 1
    existingMap.set(saved.google_event_id, {
      id: saved.id,
      session_deducted: false,
      google_event_id: saved.google_event_id,
      event_type: 'recurring_master',
    })
    await consolidateGoogleRecurringSeriesRows(supabase, {
      masterGoogleEventId: event.id,
      masterDbId: saved.id,
      recurrenceGroupId: googleRecurrenceGroupId(event.id),
      instanceGoogleEventIds: skippedByMasterEventId.get(event.id) ?? [],
    })
  }

  for (const event of exceptions) {
    if (!event.id || !event.recurringEventId) continue
    const title = normalizeGoogleEventTitle(event.summary)
    const memberId = memberLookup.resolveMemberId(title)
    const masterId = await resolveMasterIdCached(event.recurringEventId)

    if (isGoogleEventCancelled(event) && masterId) {
      const existing = existingMap.get(event.id)
      if (existing) {
        const outcome = await applyGoogleEventToExistingRow(
          supabase,
          event,
          existing,
          {},
          {
            googleAccountId,
            googleCalendarId: calendarId,
            googleRecurringEventId: event.recurringEventId,
          },
        )
        if (outcome === 'updated') result.updated += 1
        else result.skipped += 1
      } else {
        result.skipped += 1
      }
      continue
    }

    const payload = buildExceptionPayload(
      event,
      memberId,
      title,
      masterId,
      calendarId,
      instructorId,
    )
    if (!payload) {
      result.skipped += 1
      continue
    }

    const existing = existingMap.get(event.id)
    if (existing?.session_deducted) {
      result.skipped += 1
      continue
    }
    if (existing && !shouldApplyGoogleEvent(event, existing)) {
      result.skipped += 1
      continue
    }

    if (existing) {
      const outcome = await applyGoogleEventToExistingRow(
        supabase,
        event,
        existing,
        withGoogleSyncKeys(payload, googleAccountId, calendarId),
        {
          googleAccountId,
          googleCalendarId: calendarId,
          googleRecurringEventId: event.recurringEventId,
        },
      )
      if (outcome === 'updated') result.updated += 1
      else result.skipped += 1
      continue
    }

    const originalStart = payload.original_start_time as string | null
    if (originalStart) {
      const { data: dupe } = await supabase
        .from('lessons')
        .select(
          'id, member_id, instructor_id, app_modified_at, google_event_updated_at, sync_origin, session_deducted, google_event_id, event_type',
        )
        .eq('google_recurring_event_id', event.recurringEventId)
        .eq('original_start_time', originalStart)
        .maybeSingle()
      if (dupe?.id) {
        const dupeExisting: ExistingLesson = {
          id: dupe.id,
          session_deducted: Boolean(dupe.session_deducted),
          google_event_id: dupe.google_event_id,
          event_type: dupe.event_type,
          member_id: dupe.member_id,
          instructor_id: dupe.instructor_id as string | null | undefined,
          app_modified_at: dupe.app_modified_at as string | null | undefined,
          google_event_updated_at: dupe.google_event_updated_at as string | null | undefined,
          sync_origin: dupe.sync_origin as string | null | undefined,
        }
        const outcome = await applyGoogleEventToExistingRow(
          supabase,
          event,
          dupeExisting,
          withGoogleSyncKeys(payload, googleAccountId, calendarId),
          {
            googleAccountId,
            googleCalendarId: calendarId,
            googleRecurringEventId: event.recurringEventId,
          },
        )
        if (outcome === 'updated') result.updated += 1
        else result.skipped += 1
        continue
      }
    }

    try {
      const saved = await upsertGoogleLessonRow(
        supabase,
        withGoogleSyncMetadata(payload, event, { isNewRow: true }),
        googleAccountId,
        calendarId,
        existing,
      )
      if (saved.created) {
        result.created += 1
      } else {
        result.updated += 1
      }
      existingMap.set(saved.google_event_id, {
        id: saved.id,
        session_deducted: false,
        google_event_id: saved.google_event_id,
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('event_type')) {
        result.skipped += 1
        continue
      }
      throw error
    }
  }

  for (const event of singles) {
    if (!event.id) continue
    if (shouldSkipGoogleExpandedInstance(event)) {
      result.skipped += 1
      continue
    }

    const existing = existingMap.get(event.id)
    if (isGoogleEventCancelled(event)) {
      if (existing) {
        const outcome = await applyGoogleEventToExistingRow(
          supabase,
          event,
          existing,
          {},
          { googleAccountId, googleCalendarId: calendarId },
        )
        if (outcome === 'updated') result.updated += 1
        else result.skipped += 1
      } else {
        result.skipped += 1
      }
      continue
    }

    const title = normalizeGoogleEventTitle(event.summary)
    const memberId = memberLookup.resolveMemberId(title)
    const payload = buildSinglePayload(event, memberId, title, calendarId, instructorId)
    if (!payload) {
      result.skipped += 1
      continue
    }

    if (existing) {
      const outcome = await applyGoogleEventToExistingRow(
        supabase,
        event,
        existing,
        withGoogleSyncKeys(payload, googleAccountId, calendarId),
        { googleAccountId, googleCalendarId: calendarId },
      )
      if (outcome === 'updated') {
        result.updated += 1
        if (!memberId && !existing.member_id) result.pendingMember += 1
      } else {
        result.skipped += 1
      }
      continue
    }

    try {
      const saved = await upsertGoogleLessonRow(
        supabase,
        withGoogleSyncMetadata(payload, event, { isNewRow: true }),
        googleAccountId,
        calendarId,
        existing,
      )
      if (saved.created) result.created += 1
      else result.updated += 1
      if (!memberId) result.pendingMember += 1
      existingMap.set(saved.google_event_id, {
        id: saved.id,
        session_deducted: false,
        google_event_id: saved.google_event_id,
        event_type: 'single',
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate')) {
        result.skipped += 1
        continue
      }
      throw error
    }
  }

  return result
}
