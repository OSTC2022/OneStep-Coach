'use server'

import { createClient } from '@/lib/supabase/server'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { Lesson, LessonFormData, AttendanceStatus } from '@/lib/types'
import { getCurrentUser, requireRole } from './auth'
import { checkInLesson } from './lesson-sessions'
import { queryActiveSessionPackageId } from './sessions'
import { extractMemberNameFromCalendarLabel } from '@/lib/member-utils'
import {
  LESSON_TITLE_CONTENT_PREFIX,
  resolveLessonTitle,
} from '@/lib/calendar-utils'
import {
  generateRecurrenceDates,
  getRecurrenceMaterializeEndDate,
  isOpenEndedRecurrencePattern,
  MAX_RECURRING_LESSONS,
  parseLessonRecurrencePattern,
  resolveRecurrenceEndDate,
  type LessonRecurrencePattern,
} from '@/lib/lesson-recurrence'
import { fetchExpandedCalendarLessons } from '@/lib/actions/calendar-lessons-range'
import {
  findDisplayableMemberSlotConflict,
  purgeOrphanMemberSlotRows,
} from '@/lib/actions/member-slot-conflict'
import {
  deleteRecurringMasterSeries,
  resolveRecurringDeleteTarget,
} from '@/lib/actions/calendar-recurrence-series'
import { updateRecurringMasterSeries } from '@/lib/actions/calendar-recurrence-update'
import { removeLessonRecurrence as removeLessonRecurrenceInternal } from '@/lib/actions/calendar-recurrence-remove'
import {
  convertLessonToRecurringSeries as convertLessonToRecurringSeriesInternal,
} from '@/lib/actions/calendar-recurrence-convert'
import { buildAppRecurringMasterPayload } from '@/lib/calendar-recurrence/google-sync-mapper'
import { parseVirtualLessonId } from '@/lib/calendar-recurrence/types'
import {
  runGoogleLessonPush,
  scheduleGoogleLessonDeletes,
  touchAppModifiedAt,
} from '@/lib/google-calendar/push-scheduler'
import {
  findExistingLessonsByDates,
  findMemberSlotRowIds,
  type LessonSlotIdentity,
} from '@/lib/lesson-slot-utils'
import {
  encodeRecurrenceInSpecialNote,
  enrichLessonRecurrenceFields,
  filterLessonsByRecurringSlotMatch,
  inferRecurrenceFromSlotLessons,
  resolveLessonRecurrence,
  stripRecurrenceFromSpecialNote,
} from '@/lib/lesson-recurrence-legacy'

import {
  filterLessonsUpToNow,
  getTodayDateKey,
} from '@/lib/lesson-record-utils'
import { toStoredLessonType } from '@/lib/lesson-types'
import { syncTrialLessonPayOverride } from '@/lib/trial-lesson-pay-sync'
import {
  LESSON_CALENDAR_SELECT,
  LESSON_CALENDAR_SELECT_LEGACY,
  LESSON_LIST_SELECT,
  LESSON_LIST_SELECT_LEGACY,
  LESSON_MUTATION_SELECT,
  LESSON_MUTATION_SELECT_LEGACY,
} from '@/lib/supabase-selects'

type LessonMutationResult = {
  data?: Lesson
  error?: string
  warning?: string
}

type RecurringLessonMutationResult = {
  data?: Lesson[]
  error?: string
  warning?: string
  createdCount?: number
  linkedCount?: number
}

const LESSON_TITLE_MIGRATION_HINT =
  '회원 없는 일정 저장을 위해 Supabase SQL Editor에서 supabase/add-lesson-title.sql 을 실행해 주세요.'

const LESSON_RECURRENCE_MIGRATION_HINT =
  '반복 수업 연결을 위해 Supabase SQL Editor에서 supabase/add-lesson-recurrence.sql 을 실행해 주세요.'

export type LessonSeriesScope = 'single' | 'future' | 'all'

function isRowNotFoundError(error?: { message?: string; code?: string } | null) {
  if (!error) return false
  const message = error.message ?? ''
  return (
    error.code === 'PGRST116' ||
    message.includes('Cannot coerce the result to a single JSON object') ||
    message.includes('JSON object requested, multiple (or no) rows returned')
  )
}

function mapLessonError(message: string): string {
  if (
    message.includes('Cannot coerce the result to a single JSON object') ||
    message.includes('JSON object requested, multiple (or no) rows returned')
  ) {
    return '수업을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.'
  }
  if (message.includes('row-level security') || message.includes('permission denied')) {
    return (
      '수업 저장 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY가 있는지 확인하거나, ' +
      'Supabase SQL Editor에서 supabase/fix-lessons-rls.sql 을 실행해주세요.'
    )
  }
  if (message.includes("Could not find the table 'public.lessons'")) {
    return 'lessons 테이블이 없습니다. supabase/fix-lessons.sql 을 실행해주세요.'
  }
  return message
}

function getLessonWriteClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return null
  }
}

async function lessonWriteClient() {
  return getLessonWriteClient() ?? (await createStaffDataClient())
}

function isMissingTitleColumn(error: { message?: string; code?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === 'PGRST204' ||
    (message.includes('title') && message.includes('schema cache'))
  )
}

function isMemberIdRequiredError(error: { message?: string; code?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === '23502' ||
    message.includes('member_id') && message.includes('not-null')
  )
}

function isMissingRecurrenceColumn(error: { message?: string; code?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    message.includes('recurrence_group_id') ||
    message.includes('recurrence_pattern')
  )
}

function lessonSelectFallback(
  select: string,
  includeSessionPackage?: boolean,
) {
  if (select === LESSON_CALENDAR_SELECT) return LESSON_CALENDAR_SELECT_LEGACY
  if (select === LESSON_LIST_SELECT) return LESSON_LIST_SELECT_LEGACY
  if (select === LESSON_MUTATION_SELECT) return LESSON_MUTATION_SELECT_LEGACY
  return includeSessionPackage ? LESSON_LIST_SELECT_LEGACY : LESSON_CALENDAR_SELECT_LEGACY
}

function stripRecurrenceFields(payload: Record<string, unknown>) {
  const next = { ...payload }
  delete next.recurrence_group_id
  delete next.recurrence_pattern
  return next
}

function normalizeLessonRecord(lesson: Lesson): Lesson {
  const enriched = enrichLessonRecurrenceFields(lesson)
  const title = resolveLessonTitle(enriched)
  if (title && !enriched.title) {
    return { ...enriched, title }
  }
  return enriched
}

function withLegacyRecurrenceNote(
  payload: Record<string, unknown>,
  groupId: string,
  pattern: LessonRecurrencePattern | string | null,
) {
  const parsedPattern = parseLessonRecurrencePattern(
    typeof pattern === 'string' ? pattern : null,
  )
  if (parsedPattern === 'none') return payload

  return {
    ...payload,
    special_note: encodeRecurrenceInSpecialNote(
      payload.special_note as string | null | undefined,
      { groupId, pattern: parsedPattern },
    ),
  }
}

function withoutLegacyRecurrenceNote(
  payload: Record<string, unknown>,
  existingSpecialNote?: string | null,
) {
  const next = stripRecurrenceFields(payload)
  next.special_note = stripRecurrenceFromSpecialNote(
    (payload.special_note as string | null | undefined) ?? existingSpecialNote,
  )
  return next
}

type LessonSeriesRow = {
  id: string
  lesson_date: string
  member_id?: string | null
  instructor_id?: string | null
  start_time?: string | null
  end_time?: string | null
  title?: string | null
  special_note?: string | null
  recurrence_group_id?: string | null
  recurrence_pattern?: string | null
}

const LESSON_SERIES_SELECT =
  'id, lesson_date, member_id, instructor_id, start_time, end_time, title, special_note, recurrence_group_id, recurrence_pattern'

const LESSON_SERIES_SELECT_LEGACY =
  'id, lesson_date, member_id, instructor_id, start_time, end_time, title, special_note'

async function fetchLessonSeriesCandidates(
  supabase: Awaited<ReturnType<typeof lessonWriteClient>>,
  lesson: LessonSeriesRow,
) {
  if (lesson.member_id) {
    let query = await supabase
      .from('lessons')
      .select(LESSON_SERIES_SELECT)
      .eq('member_id', lesson.member_id)

    if (query.error && isMissingRecurrenceColumn(query.error)) {
      query = await supabase
        .from('lessons')
        .select(LESSON_SERIES_SELECT_LEGACY)
        .eq('member_id', lesson.member_id)
    }

    return (query.data as LessonSeriesRow[] | null) ?? []
  }

  const title = lesson.title?.trim()
  if (title) {
    let query = await supabase
      .from('lessons')
      .select(LESSON_SERIES_SELECT)
      .eq('title', title)
      .is('member_id', null)

    if (query.error && isMissingRecurrenceColumn(query.error)) {
      query = await supabase
        .from('lessons')
        .select(LESSON_SERIES_SELECT_LEGACY)
        .eq('title', title)
        .is('member_id', null)
    }

    return (query.data as LessonSeriesRow[] | null) ?? []
  }

  return []
}

type SeriesSiblingScope = Exclude<LessonSeriesScope, 'single'>

async function inferSeriesSiblingIds(
  supabase: Awaited<ReturnType<typeof lessonWriteClient>>,
  lesson: LessonSeriesRow,
  anchorDate: string,
  scope: SeriesSiblingScope,
): Promise<string[] | null> {
  const candidates = await fetchLessonSeriesCandidates(supabase, lesson)
  let matching = filterLessonsByRecurringSlotMatch(lesson, candidates)
  if (scope === 'future') {
    matching = matching.filter((row) => row.lesson_date >= anchorDate)
  }

  if (matching.length === 0) return null
  return matching.map((row) => row.id)
}

async function fetchSeriesSiblingIds(
  supabase: Awaited<ReturnType<typeof lessonWriteClient>>,
  lesson: LessonSeriesRow,
  anchorDate: string,
  scope: LessonSeriesScope,
): Promise<string[]> {
  if (scope === 'single') return [lesson.id]

  const seriesScope: SeriesSiblingScope = scope === 'all' ? 'all' : 'future'

  function pickMatchingSiblingIds(rows: LessonSeriesRow[]) {
    let matching = filterLessonsByRecurringSlotMatch(lesson, rows)
    if (seriesScope === 'future') {
      matching = matching.filter((row) => row.lesson_date >= anchorDate)
    }
    return matching.map((item) => item.id)
  }

  const { groupId } = resolveLessonRecurrence(lesson)

  if (groupId && !groupId.startsWith('slot:')) {
    let groupQuery = supabase
      .from('lessons')
      .select(LESSON_SERIES_SELECT)
      .eq('recurrence_group_id', groupId)

    const { data: groupSiblings, error: groupError } = await groupQuery

    if (!groupError && groupSiblings?.length) {
      const ids = pickMatchingSiblingIds(groupSiblings as LessonSeriesRow[])
      if (ids.length > 0) return ids
    }

    let legacyQuery = supabase
      .from('lessons')
      .select(LESSON_SERIES_SELECT_LEGACY)
      .ilike('special_note', `%${groupId}%`)

    const { data: legacySiblings, error: legacyError } = await legacyQuery

    if (!legacyError && legacySiblings?.length) {
      const ids = pickMatchingSiblingIds(legacySiblings as LessonSeriesRow[])
      if (ids.length > 0) return ids
    }
  }

  const inferredIds = await inferSeriesSiblingIds(
    supabase,
    lesson,
    anchorDate,
    seriesScope,
  )
  if (inferredIds?.length) return inferredIds

  return [lesson.id]
}

async function fetchLessonSeriesRow(
  supabase: Awaited<ReturnType<typeof lessonWriteClient>>,
  lessonId: string,
): Promise<{ data: LessonSeriesRow | null; error?: string }> {
  let result = await supabase
    .from('lessons')
    .select(LESSON_SERIES_SELECT)
    .eq('id', lessonId)
    .maybeSingle()

  if (result.error && isMissingRecurrenceColumn(result.error)) {
    result = await supabase
      .from('lessons')
      .select(LESSON_SERIES_SELECT_LEGACY)
      .eq('id', lessonId)
      .maybeSingle()
  }

  if (result.error && !isRowNotFoundError(result.error)) {
    return { data: null, error: mapLessonError(result.error.message) }
  }

  if (!result.data) {
    return { data: null, error: '수업을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.' }
  }

  return { data: result.data as LessonSeriesRow }
}

function buildLessonIdentityFields(memberId: string | null, title: string | null) {
  return {
    member_id: memberId,
    title: title?.trim() || null,
  }
}

async function lookupMemberIdByName(
  supabase: Awaited<ReturnType<typeof lessonWriteClient>>,
  name: string,
): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  const { data, error } = await supabase
    .from('members')
    .select('id')
    .eq('name', trimmed)
    .limit(2)

  if (error || !data || data.length !== 1) return null
  return data[0].id
}

async function enrichLessonIdentity(
  supabase: Awaited<ReturnType<typeof lessonWriteClient>>,
  formData: LessonFormData,
): Promise<{
  memberId: string | null
  title: string | null
  sessionPackageId: string | null
}> {
  let memberId = formData.member_id?.trim() || null
  let title = formData.title?.trim() || null

  if (!memberId) {
    const label = title || ''
    if (label) {
      memberId = await lookupMemberIdByName(
        supabase,
        extractMemberNameFromCalendarLabel(label),
      )
    }
  }

  let sessionPackageId = formData.session_package_id?.trim() || null
  if (memberId && !sessionPackageId) {
    sessionPackageId = await queryActiveSessionPackageId(supabase, memberId)
  }

  return { memberId, title, sessionPackageId }
}

function buildInsertPayload(
  formData: LessonFormData,
  memberId: string | null,
  title: string | null,
  lessonNo: number | null,
  userId: string | null,
  options?: {
    useTitleFallback?: boolean
    recurrenceGroupId?: string | null
    recurrencePattern?: string | null
  },
) {
  const identity = buildLessonIdentityFields(memberId, title)
  const payload: Record<string, unknown> = {
    member_id: identity.member_id,
    instructor_id: formData.instructor_id || null,
    session_package_id: formData.session_package_id || null,
    lesson_date: formData.lesson_date,
    start_time: formData.start_time || null,
    end_time: formData.end_time || null,
    lesson_type: toStoredLessonType(formData.lesson_type),
    content: formData.content || null,
    special_note: formData.special_note || null,
    attendance_status: formData.attendance_status || 'present',
    session_deducted: false,
    lesson_no: lessonNo,
    created_by: userId,
    app_modified_at: touchAppModifiedAt(),
  }

  if (options?.recurrenceGroupId !== undefined) {
    payload.recurrence_group_id = options.recurrenceGroupId
  }
  if (options?.recurrencePattern !== undefined) {
    payload.recurrence_pattern = options.recurrencePattern
  }

  if (options?.useTitleFallback) {
    if (title) {
      payload.content = `${LESSON_TITLE_CONTENT_PREFIX}${title}`
    }
  } else if (identity.title) {
    payload.title = identity.title
  }

  return payload
}

function buildRecurrenceLinkUpdate(
  formData: LessonFormData,
  recurrenceGroupId: string,
  recurrencePattern: LessonRecurrencePattern | string | null,
) {
  return {
    instructor_id: formData.instructor_id || null,
    start_time: formData.start_time || null,
    end_time: formData.end_time || null,
    lesson_type: toStoredLessonType(formData.lesson_type),
    recurrence_group_id: recurrenceGroupId,
    recurrence_pattern: recurrencePattern,
  }
}

async function updateLessonRecurrenceLink(
  supabase: Awaited<ReturnType<typeof lessonWriteClient>>,
  lessonId: string,
  formData: LessonFormData,
  recurrenceGroupId: string,
  recurrencePattern: LessonRecurrencePattern | string | null,
): Promise<{ lesson: Lesson | null; warning?: string }> {
  let payload: Record<string, unknown> = buildRecurrenceLinkUpdate(
    formData,
    recurrenceGroupId,
    recurrencePattern,
  )

  let { data, error } = await supabase
    .from('lessons')
    .update(payload)
    .eq('id', lessonId)
    .select(LESSON_MUTATION_SELECT_LEGACY)
    .single()

  let warning: string | undefined

  if (error && isMissingRecurrenceColumn(error)) {
    payload = withLegacyRecurrenceNote(
      stripRecurrenceFields(payload),
      recurrenceGroupId,
      recurrencePattern,
    )
    const retry = await supabase
      .from('lessons')
      .update(payload)
      .eq('id', lessonId)
      .select(LESSON_MUTATION_SELECT_LEGACY)
      .single()
    data = retry.data
    error = retry.error
    warning = LESSON_RECURRENCE_MIGRATION_HINT
  }

  if (error || !data) return { lesson: null, warning }
  return { lesson: normalizeLessonRecord(data as Lesson), warning }
}

function logSupabaseError(context: string, error: { message?: string; code?: string; details?: string }) {
  console.error(`${context}:`, error.message ?? error.code ?? 'Unknown error', {
    code: error.code,
    details: error.details,
  })
}

async function syncTrialPayForLesson(
  supabase: Awaited<ReturnType<typeof lessonWriteClient>>,
  lesson: Lesson,
  userId?: string | null,
) {
  await syncTrialLessonPayOverride(
    supabase,
    {
      id: lesson.id,
      instructor_id: lesson.instructor_id,
      lesson_date: lesson.lesson_date,
      start_time: lesson.start_time,
      lesson_type: lesson.lesson_type,
      attendance_status: lesson.attendance_status,
    },
    userId,
  )
}

const MEMBER_SLOT_CONFLICT_MESSAGE = '이미 같은 시간에 배정된 회원입니다.'

async function assertMemberSlotAvailable(
  supabase: Awaited<ReturnType<typeof lessonWriteClient>>,
  params: {
    lessonDate: string
    startTime?: string | null
    memberId: string | null | undefined
    excludeLessonIds?: string[]
  },
): Promise<{ error?: string }> {
  if (!params.memberId) return {}

  const conflict = await findDisplayableMemberSlotConflict({
    lessonDate: params.lessonDate,
    startTime: params.startTime,
    memberId: params.memberId,
    excludeLessonIds: params.excludeLessonIds,
  })
  if (conflict) return { error: MEMBER_SLOT_CONFLICT_MESSAGE }

  await purgeOrphanMemberSlotRows(supabase, {
    lessonDate: params.lessonDate,
    startTime: params.startTime,
    memberId: params.memberId,
    excludeLessonIds: params.excludeLessonIds,
  })

  return {}
}

export async function getLessons(options?: {
  memberId?: string
  instructorId?: string
  date?: string
  dateFrom?: string
  dateTo?: string
  status?: AttendanceStatus
  limit?: number
  includeSessionPackage?: boolean
  /** 미래 일정 제외 — 회원 최근 기록 등 */
  upToNow?: boolean
  /** 수업현황 — 출석 체크 여부 판별용 */
  includeCheckIn?: boolean
}): Promise<Lesson[]> {
  const supabase = await createStaffDataClient()
  const baseSelect = options?.includeSessionPackage
    ? LESSON_LIST_SELECT_LEGACY
    : LESSON_CALENDAR_SELECT_LEGACY
  const select = options?.includeCheckIn
    ? `${baseSelect}, lesson_sessions(checked_in_at)`
    : baseSelect

  let query = supabase.from('lessons').select(select)

  if (options?.date) {
    query = query
      .order('start_time', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
  } else {
    query = query
      .order('lesson_date', { ascending: false })
      .order('start_time', { ascending: false })
  }

  if (options?.memberId) {
    query = query.eq('member_id', options.memberId)
  }

  if (options?.instructorId) {
    query = query.eq('instructor_id', options.instructorId)
  }

  if (options?.date) {
    query = query.eq('lesson_date', options.date)
  }

  if (options?.dateFrom) {
    query = query.gte('lesson_date', options.dateFrom)
  }

  if (options?.dateTo) {
    query = query.lte('lesson_date', options.dateTo)
  } else if (
    options?.upToNow &&
    !options.date &&
    !options.dateFrom
  ) {
    query = query.lte('lesson_date', getTodayDateKey())
  }

  if (options?.status) {
    query = query.eq('attendance_status', options.status)
  }

  if (options?.limit) {
    const fetchLimit = options.upToNow
      ? Math.max(options.limit * 4, 40)
      : options.limit
    query = query.limit(fetchLimit)
  }

  let { data, error } = await query

  if (error && isMissingRecurrenceColumn(error)) {
    const fallbackSelect = lessonSelectFallback(select, options?.includeSessionPackage)
    let retryQuery = supabase.from('lessons').select(fallbackSelect)
    if (options?.date) {
      retryQuery = retryQuery
        .order('start_time', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
    } else {
      retryQuery = retryQuery
        .order('lesson_date', { ascending: false })
        .order('start_time', { ascending: false })
    }
    if (options?.memberId) retryQuery = retryQuery.eq('member_id', options.memberId)
    if (options?.instructorId) retryQuery = retryQuery.eq('instructor_id', options.instructorId)
    if (options?.date) retryQuery = retryQuery.eq('lesson_date', options.date)
    if (options?.dateFrom) retryQuery = retryQuery.gte('lesson_date', options.dateFrom)
    if (options?.dateTo) retryQuery = retryQuery.lte('lesson_date', options.dateTo)
    else if (options?.upToNow && !options.date && !options.dateFrom) {
      retryQuery = retryQuery.lte('lesson_date', getTodayDateKey())
    }
    if (options?.status) retryQuery = retryQuery.eq('attendance_status', options.status)
    if (options?.limit) {
      const fetchLimit = options.upToNow
        ? Math.max(options.limit * 4, 40)
        : options.limit
      retryQuery = retryQuery.limit(fetchLimit)
    }

    const retry = await retryQuery
    data = retry.data
    error = retry.error
  }

  if (error) {
    logSupabaseError('Error fetching lessons', error)
    return []
  }

  let lessons = (data as Lesson[]).map(normalizeLessonRecord)
  if (options?.upToNow) {
    lessons = filterLessonsUpToNow(lessons)
    if (options?.limit) {
      lessons = lessons.slice(0, options.limit)
    }
  }
  return lessons
}

async function attachCheckInSessions(lessons: Lesson[]): Promise<Lesson[]> {
  const realIds = lessons
    .map((lesson) => lesson.id)
    .filter((id) => id && !id.startsWith('virt:'))

  if (!realIds.length) return lessons

  const supabase = await createStaffDataClient()
  const { data, error } = await supabase
    .from('lessons')
    .select('id, lesson_sessions(checked_in_at)')
    .in('id', realIds)

  if (error || !data?.length) return lessons

  const sessionsById = new Map(
    data.map((row) => [
      row.id as string,
      (row.lesson_sessions ?? []) as Lesson['lesson_sessions'],
    ]),
  )

  return lessons.map((lesson) => {
    if (lesson.id.startsWith('virt:')) return lesson
    const sessions = sessionsById.get(lesson.id)
    if (!sessions) return lesson
    return { ...lesson, lesson_sessions: sessions }
  })
}

/** 수업현황 — 캘린더와 동일한 확장·중복 제거 로직 */
export async function getLessonsForStatusView(options: {
  date?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
}): Promise<Lesson[]> {
  const dateFrom = options.date ?? options.dateFrom
  const dateTo = options.date ?? options.dateTo
  if (!dateFrom || !dateTo) return []

  const { lessons } = await fetchExpandedCalendarLessons(
    dateFrom,
    dateTo,
    options.limit ?? 200,
    { forStatusPage: true },
  )

  return attachCheckInSessions(lessons.map(normalizeLessonRecord))
}

const CALENDAR_MONTH_LESSON_LIMIT = 400
const CALENDAR_RANGE_LESSON_LIMIT = 300

export async function getLessonsForMonth(year: number, month: number): Promise<Lesson[]> {
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const { lessons } = await fetchExpandedCalendarLessons(
    dateFrom,
    dateTo,
    CALENDAR_MONTH_LESSON_LIMIT,
  )
  return lessons
}

export async function getLessonsForRange(
  dateFrom: string,
  dateTo: string,
): Promise<Lesson[]> {
  const { lessons } = await fetchExpandedCalendarLessons(
    dateFrom,
    dateTo,
    CALENDAR_RANGE_LESSON_LIMIT,
  )
  return lessons
}

export async function getTodayLessons(): Promise<Lesson[]> {
  const today = new Date().toISOString().split('T')[0]
  return getLessons({ date: today })
}

export async function createLesson(formData: LessonFormData): Promise<LessonMutationResult> {
  await requireRole(['admin', 'instructor'])
  const supabase = await lessonWriteClient()
  const user = await getCurrentUser()

  const enriched = await enrichLessonIdentity(supabase, formData)
  const memberId = enriched.memberId
  const title = enriched.title
  const sessionPackageId = enriched.sessionPackageId

  if (!memberId && !title) {
    return { error: '이름을 입력해주세요.' }
  }

  const slotConflict = await assertMemberSlotAvailable(supabase, {
    lessonDate: formData.lesson_date,
    startTime: formData.start_time,
    memberId,
  })
  if (slotConflict.error) return { error: slotConflict.error }

  let lessonNo: number | null = null
  if (memberId) {
    const { data: lastLesson } = await supabase
      .from('lessons')
      .select('lesson_no')
      .eq('member_id', memberId)
      .order('lesson_no', { ascending: false })
      .limit(1)
      .single()

    lessonNo = (lastLesson?.lesson_no || 0) + 1
  }

  const payload = buildInsertPayload(
    { ...formData, session_package_id: sessionPackageId ?? formData.session_package_id },
    memberId,
    title,
    lessonNo,
    user?.id || null,
  )

  let warning: string | undefined
  let { data, error } = await supabase
    .from('lessons')
    .insert(payload)
    .select(LESSON_MUTATION_SELECT_LEGACY)
    .single()

  if (error && isMissingTitleColumn(error) && !memberId && title) {
    const fallbackPayload = buildInsertPayload(
      formData,
      memberId,
      title,
      lessonNo,
      user?.id || null,
      { useTitleFallback: true },
    )
    const retry = await supabase
      .from('lessons')
      .insert(fallbackPayload)
      .select(LESSON_MUTATION_SELECT_LEGACY)
      .single()

    data = retry.data
    error = retry.error
    warning = LESSON_TITLE_MIGRATION_HINT
  }

  if (error) {
    console.error('Error creating lesson:', error)
    if (isMemberIdRequiredError(error) && !memberId) {
      return { error: LESSON_TITLE_MIGRATION_HINT }
    }
    const message =
      error.code === 'PGRST205'
        ? 'lessons 테이블이 없습니다. supabase/fix-lessons.sql 을 실행해주세요.'
        : isMissingTitleColumn(error)
          ? LESSON_TITLE_MIGRATION_HINT
          : mapLessonError(error.message)
    return { error: message }
  }

  const lesson = normalizeLessonRecord(data as Lesson)
  await syncTrialPayForLesson(supabase, lesson, user?.id ?? null)

  await runGoogleLessonPush(lesson.id)

  revalidatePath('/dashboard/lessons')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/lesson-status')
  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/reports')
  return { data: lesson, warning }
}

async function supportsRecurringMasterStorage(
  supabase: Awaited<ReturnType<typeof lessonWriteClient>>,
) {
  const probe = await supabase.from('lessons').select('event_type').limit(1)
  if (!probe.error) return true
  const message = probe.error.message?.toLowerCase() ?? ''
  return !message.includes('event_type')
}

async function createRecurringMasterLesson(
  formData: LessonFormData,
  options: {
    pattern: LessonRecurrencePattern
    recurrenceGroupId?: string
    endDate?: string
    silent?: boolean
  },
): Promise<RecurringLessonMutationResult> {
  const supabase = await lessonWriteClient()
  const user = await getCurrentUser()
  const enriched = await enrichLessonIdentity(supabase, formData)
  const memberId = enriched.memberId
  const title = enriched.title
  const sessionPackageId = enriched.sessionPackageId

  if (!memberId && !title) {
    return { error: '이름을 입력해주세요.' }
  }

  const slotConflict = await assertMemberSlotAvailable(supabase, {
    lessonDate: formData.lesson_date,
    startTime: formData.start_time,
    memberId,
  })
  if (slotConflict.error) return { error: slotConflict.error }

  const recurrenceGroupId = options.recurrenceGroupId ?? crypto.randomUUID()
  let recurrenceLines = buildAppRecurringMasterPayload(
    formData,
    options.pattern,
    recurrenceGroupId,
  ).recurrence as string[]

  if (options.endDate && !isOpenEndedRecurrencePattern(options.pattern)) {
    const { truncateRecurrenceUntil } = await import(
      '@/lib/calendar-recurrence/expand-lessons'
    )
    recurrenceLines = truncateRecurrenceUntil(recurrenceLines, options.endDate)
  }

  const payload = {
    ...buildAppRecurringMasterPayload(formData, options.pattern, recurrenceGroupId),
    recurrence: recurrenceLines,
    member_id: memberId,
    title,
    lesson_type: toStoredLessonType(formData.lesson_type),
    session_package_id: sessionPackageId ?? formData.session_package_id,
    session_deducted: false,
    lesson_no: null as number | null,
    created_by: user?.id ?? null,
  }

  if (memberId) {
    const { data: lastLesson } = await supabase
      .from('lessons')
      .select('lesson_no')
      .eq('member_id', memberId)
      .order('lesson_no', { ascending: false })
      .limit(1)
      .single()
    payload.lesson_no = (lastLesson?.lesson_no || 0) + 1
  }

  let { data, error } = await supabase
    .from('lessons')
    .insert(payload)
    .select(LESSON_MUTATION_SELECT)
    .single()

  if (error?.message.includes('event_type') || error?.message.includes('recurrence_pattern')) {
    const legacyInsert = await supabase
      .from('lessons')
      .insert(payload)
      .select(LESSON_MUTATION_SELECT_LEGACY)
      .single()
    data = legacyInsert.data
    error = legacyInsert.error
  }

  if (error?.message.includes('event_type')) {
    return {
      error:
        '반복 일정 저장을 위해 supabase/add-calendar-recurrence-v2.sql 마이그레이션을 실행해 주세요.',
    }
  }

  if (error) {
    return { error: mapLessonError(error.message) }
  }

  const lesson = normalizeLessonRecord(data as Lesson)
  await syncTrialPayForLesson(supabase, lesson, user?.id ?? null)

  await runGoogleLessonPush(lesson.id)

  if (!options.silent) {
    revalidatePath('/dashboard/lessons')
    revalidatePath('/dashboard/attendance')
    revalidatePath('/dashboard/calendar')
    revalidatePath('/dashboard/lesson-status')
    revalidatePath('/dashboard/instructors')
    revalidatePath('/dashboard/reports')
  }

  return {
    data: [lesson],
    createdCount: 0,
    linkedCount: 0,
  }
}

export async function createRecurringLessons(
  formData: LessonFormData,
  options: {
    pattern?: LessonRecurrencePattern
    endDate?: string
    dates?: string[]
    recurrenceGroupId?: string
    recurrencePattern?: LessonRecurrencePattern
    silent?: boolean
  },
): Promise<RecurringLessonMutationResult> {
  await requireRole(['admin', 'instructor'])
  const supabase = await lessonWriteClient()
  const user = await getCurrentUser()

  const enriched = await enrichLessonIdentity(supabase, formData)
  const memberId = enriched.memberId
  const title = enriched.title
  const sessionPackageId = enriched.sessionPackageId

  if (!memberId && !title) {
    return { error: '이름을 입력해주세요.' }
  }

  const pattern = options.recurrencePattern ?? options.pattern ?? null

  if (pattern && pattern !== 'none' && !options.dates?.length) {
    const hasV2 = await supportsRecurringMasterStorage(supabase)
    if (hasV2) {
      return createRecurringMasterLesson(formData, {
        pattern,
        recurrenceGroupId: options.recurrenceGroupId,
        endDate: options.endDate,
        silent: options.silent,
      })
    }
  }

  const dates =
    options.dates ??
    (options.pattern && options.endDate
      ? generateRecurrenceDates(
          formData.lesson_date,
          options.pattern,
          resolveRecurrenceEndDate(
            formData.lesson_date,
            options.pattern,
            options.endDate,
          ),
        )
      : options.pattern && isOpenEndedRecurrencePattern(options.pattern)
        ? generateRecurrenceDates(
            formData.lesson_date,
            options.pattern,
            getRecurrenceMaterializeEndDate(
              formData.lesson_date,
              options.pattern,
            ),
          )
        : [])

  if (dates.length === 0) {
    return { error: '반복 일정 날짜를 계산할 수 없습니다.' }
  }

  if (dates.length > MAX_RECURRING_LESSONS) {
    return {
      error: `반복 수업은 최대 ${MAX_RECURRING_LESSONS}회까지 등록할 수 있습니다.`,
    }
  }

  let baseLessonNo = 0

  const recurrenceGroupId = options.recurrenceGroupId ?? crypto.randomUUID()
  const recurrencePattern = pattern

  const slotIdentity: LessonSlotIdentity = {
    memberId,
    title,
    instructorId: formData.instructor_id || null,
    startTime: formData.start_time || null,
  }

  const existingByDate = await findExistingLessonsByDates(
    supabase,
    slotIdentity,
    dates,
  )

  const savedLessons: Lesson[] = []
  const insertDates: string[] = []
  let warning: string | undefined
  let linkedCount = 0

  for (const lessonDate of dates) {
    const existingId = existingByDate.get(lessonDate)
    if (existingId) {
      const { lesson: linked, warning: linkWarning } =
        await updateLessonRecurrenceLink(
          supabase,
          existingId,
          { ...formData, lesson_date: lessonDate },
          recurrenceGroupId,
          recurrencePattern,
        )
      if (linked) {
        savedLessons.push(linked)
        linkedCount += 1
      }
      warning = warning ?? linkWarning
    } else {
      insertDates.push(lessonDate)
    }
  }

  if (insertDates.length > 0) {
    if (memberId) {
      const { data: lastLesson } = await supabase
        .from('lessons')
        .select('lesson_no')
        .eq('member_id', memberId)
        .order('lesson_no', { ascending: false })
        .limit(1)
        .single()

      baseLessonNo = lastLesson?.lesson_no || 0
    }

    const payloads = insertDates.map((lessonDate, index) =>
      buildInsertPayload(
        {
          ...formData,
          lesson_date: lessonDate,
          session_package_id: sessionPackageId ?? formData.session_package_id,
        },
        memberId,
        title,
        memberId ? baseLessonNo + index + 1 : null,
        user?.id || null,
        { recurrenceGroupId, recurrencePattern },
      ),
    )

    let { data, error } = await supabase
      .from('lessons')
      .insert(payloads)
      .select(LESSON_MUTATION_SELECT_LEGACY)

    if (error && isMissingRecurrenceColumn(error)) {
      const strippedPayloads = payloads
        .map(stripRecurrenceFields)
        .map((payload) =>
          withLegacyRecurrenceNote(
            payload,
            recurrenceGroupId,
            recurrencePattern,
          ),
        )
      const retry = await supabase
        .from('lessons')
        .insert(strippedPayloads)
        .select(LESSON_MUTATION_SELECT_LEGACY)
      data = retry.data
      error = retry.error
      warning = warning ?? LESSON_RECURRENCE_MIGRATION_HINT
    }

    if (error && isMissingTitleColumn(error) && !memberId && title) {
      const fallbackPayloads = insertDates.map((lessonDate, index) =>
        buildInsertPayload(
          { ...formData, lesson_date: lessonDate },
          memberId,
          title,
          memberId ? baseLessonNo + index + 1 : null,
          user?.id || null,
          {
            useTitleFallback: true,
            recurrenceGroupId,
            recurrencePattern,
          },
        ),
      )

      let retry = await supabase
        .from('lessons')
        .insert(fallbackPayloads)
        .select(LESSON_MUTATION_SELECT_LEGACY)

      if (retry.error && isMissingRecurrenceColumn(retry.error)) {
        retry = await supabase
          .from('lessons')
          .insert(
            fallbackPayloads
              .map(stripRecurrenceFields)
              .map((payload) =>
                withLegacyRecurrenceNote(
                  payload,
                  recurrenceGroupId,
                  recurrencePattern,
                ),
              ),
          )
          .select(LESSON_MUTATION_SELECT_LEGACY)
        warning = warning ?? LESSON_RECURRENCE_MIGRATION_HINT
      }

      data = retry.data
      error = retry.error
      warning = warning ?? LESSON_TITLE_MIGRATION_HINT
    }

    if (error) {
      console.error('Error creating recurring lessons:', error)
      if (isMemberIdRequiredError(error) && !memberId) {
        return { error: LESSON_TITLE_MIGRATION_HINT }
      }
      const message =
        error.code === 'PGRST205'
          ? 'lessons 테이블이 없습니다. supabase/fix-lessons.sql 을 실행해주세요.'
          : isMissingTitleColumn(error)
            ? LESSON_TITLE_MIGRATION_HINT
            : mapLessonError(error.message)
      return { error: message }
    }

    savedLessons.push(
      ...((data ?? []) as Lesson[]).map(normalizeLessonRecord),
    )
  }

  savedLessons.sort((a, b) => a.lesson_date.localeCompare(b.lesson_date))

  for (const lesson of savedLessons) {
    await syncTrialPayForLesson(supabase, lesson, user?.id ?? null)
  }

  await runGoogleLessonPush(savedLessons.map((lesson) => lesson.id))

  if (!options.silent) {
    revalidatePath('/dashboard/lessons')
    revalidatePath('/dashboard/attendance')
    revalidatePath('/dashboard/calendar')
    revalidatePath('/dashboard/lesson-status')
    revalidatePath('/dashboard/instructors')
    revalidatePath('/dashboard/reports')
  }

  return {
    data: savedLessons,
    warning,
    createdCount: insertDates.length,
    linkedCount,
  }
}

export async function updateLesson(id: string, updates: Partial<LessonFormData>): Promise<LessonMutationResult> {
  await requireRole(['admin', 'instructor'])

  const virtual = parseVirtualLessonId(id)
  if (virtual) {
    const seriesResult = await updateLessonSeries(
      id,
      updates,
      'single',
      virtual.occurrenceDate,
    )
    if (seriesResult.error) return { error: seriesResult.error }
    return {
      data: seriesResult.data?.[0],
      warning: seriesResult.warning,
    }
  }

  const supabase = await lessonWriteClient()

  const { data: existing } = await supabase
    .from('lessons')
    .select('id, lesson_date, start_time, member_id, special_note')
    .eq('id', id)
    .maybeSingle()

  const payload: Record<string, unknown> = { ...updates }
  let titleForFallback: string | null = null

  payload.app_modified_at = touchAppModifiedAt()

  if ('member_id' in updates || 'title' in updates) {
    const enriched = await enrichLessonIdentity(supabase, {
      ...updates,
      lesson_date: updates.lesson_date ?? existing?.lesson_date ?? '',
    })
    const memberId = enriched.memberId
    const title = enriched.title
    if (!memberId && !title) {
      return { error: '이름을 입력해주세요.' }
    }
    payload.member_id = memberId
    titleForFallback = title
    payload.title = title
    if (memberId) {
      payload.google_sync_status = null
      if (existing?.special_note?.includes('[구글 캘린더]')) {
        payload.special_note = null
      }
    }
    if (enriched.sessionPackageId && !updates.session_package_id) {
      payload.session_package_id = enriched.sessionPackageId
    }
  }

  let warning: string | undefined
  let { data, error } = await supabase
    .from('lessons')
    .update(payload)
    .eq('id', id)
    .select(LESSON_MUTATION_SELECT_LEGACY)
    .single()

  if (error && isMissingTitleColumn(error) && titleForFallback) {
    const { title: _removed, ...fallbackPayload } = payload
    fallbackPayload.content = `${LESSON_TITLE_CONTENT_PREFIX}${titleForFallback}`

    const retry = await supabase
      .from('lessons')
      .update(fallbackPayload)
      .eq('id', id)
      .select(LESSON_MUTATION_SELECT_LEGACY)
      .single()

    data = retry.data
    error = retry.error
    warning = LESSON_TITLE_MIGRATION_HINT
  }

  if (error && isMissingRecurrenceColumn(error)) {
    const groupId = payload.recurrence_group_id as string | null | undefined
    const pattern = payload.recurrence_pattern as string | null | undefined
    let legacyPayload = withoutLegacyRecurrenceNote(payload)

    if (groupId && pattern) {
      legacyPayload = withLegacyRecurrenceNote(legacyPayload, groupId, pattern)
    }

    const retry = await supabase
      .from('lessons')
      .update(legacyPayload)
      .eq('id', id)
      .select(LESSON_MUTATION_SELECT_LEGACY)
      .single()

    data = retry.data
    error = retry.error
    warning = LESSON_RECURRENCE_MIGRATION_HINT
  }

  if (error) {
    console.error('Error updating lesson:', error)
    if (isMemberIdRequiredError(error) && !payload.member_id) {
      return { error: LESSON_TITLE_MIGRATION_HINT }
    }
    return {
      error: isMissingTitleColumn(error)
        ? LESSON_TITLE_MIGRATION_HINT
        : mapLessonError(error.message),
    }
  }

  const lesson = normalizeLessonRecord(data as Lesson)
  const user = await getCurrentUser()
  await syncTrialPayForLesson(supabase, lesson, user?.id ?? null)

  await runGoogleLessonPush(lesson.id)

  revalidatePath('/dashboard/lessons')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/lesson-status')
  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/reports')
  return { data: lesson, warning }
}

export async function markAttendance(
  lessonId: string, 
  status: AttendanceStatus,
  signatureData?: string
): Promise<{ data?: Lesson; error?: string }> {
  const checkIn = await checkInLesson(lessonId, status, {
    signatureData,
  })

  if (checkIn.error) {
    return { error: checkIn.error }
  }

  const supabase = await createStaffDataClient()
  const { data, error } = await supabase
    .from('lessons')
    .select(LESSON_MUTATION_SELECT_LEGACY)
    .eq('id', lessonId)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data: normalizeLessonRecord(data as Lesson) }
}

function buildLessonUpdatePayload(updates: Partial<LessonFormData>) {
  const payload: Record<string, unknown> = { ...updates }
  payload.app_modified_at = touchAppModifiedAt()

  if ('instructor_id' in updates) {
    payload.instructor_id = updates.instructor_id?.trim() || null
  }

  if ('lesson_type' in updates) {
    payload.lesson_type = toStoredLessonType(updates.lesson_type)
  }

  if ('member_id' in updates || 'title' in updates) {
    const memberId = updates.member_id?.trim() || null
    const title = updates.title?.trim() || null
    payload.member_id = memberId
    payload.title = title
  }

  return payload
}

function buildSharedSeriesUpdatePayload(updates: Partial<LessonFormData>) {
  const payload = buildLessonUpdatePayload(updates)
  delete payload.lesson_date
  return payload
}

export async function getLessonRecurrenceInfo(lessonId: string): Promise<{
  pattern: LessonRecurrencePattern
  groupId: string | null
  endDate: string | null
} | null> {
  await requireRole(['admin', 'instructor'])
  const supabase = await createStaffDataClient()

  const virtual = parseVirtualLessonId(lessonId)
  const resolvedId = virtual?.masterId ?? lessonId

  let { data: lesson, error } = await supabase
    .from('lessons')
    .select(LESSON_SERIES_SELECT)
    .eq('id', resolvedId)
    .maybeSingle()

  if (error && isMissingRecurrenceColumn(error)) {
    const legacy = await supabase
      .from('lessons')
      .select(LESSON_SERIES_SELECT_LEGACY)
      .eq('id', resolvedId)
      .maybeSingle()
    lesson = legacy.data
    error = legacy.error
  }

  if (error && !isRowNotFoundError(error)) return null
  if (!lesson) return null

  const resolved = resolveLessonRecurrence(lesson)
  if (resolved.groupId && resolved.pattern !== 'none') {
    let endDate: string | null = null

    if (resolved.groupId.startsWith('slot:')) {
      if (lesson.member_id) {
        const { data: candidates } = await supabase
          .from('lessons')
          .select(LESSON_SERIES_SELECT)
          .eq('member_id', lesson.member_id)
        const inferred = inferRecurrenceFromSlotLessons(lesson, candidates ?? [])
        endDate = inferred?.endDate ?? null
      } else {
        const title = resolveLessonTitle(lesson)
        if (title) {
          const { data: candidates } = await supabase
            .from('lessons')
            .select(LESSON_SERIES_SELECT)
            .eq('title', title)
            .is('member_id', null)
          const inferred = inferRecurrenceFromSlotLessons(lesson, candidates ?? [])
          endDate = inferred?.endDate ?? null
        }
      }
    } else {
      const { data: groupSiblings, error: groupError } = await supabase
        .from('lessons')
        .select('lesson_date')
        .eq('recurrence_group_id', resolved.groupId)
        .order('lesson_date', { ascending: false })
        .limit(1)

      if (!groupError && groupSiblings?.length) {
        endDate = groupSiblings[0].lesson_date
      } else {
        const legacy = await supabase
          .from('lessons')
          .select('lesson_date, special_note')
          .ilike('special_note', `%${resolved.groupId}%`)
          .order('lesson_date', { ascending: false })
          .limit(1)
        endDate = legacy.data?.[0]?.lesson_date ?? null
      }
    }

    return {
      pattern: resolved.pattern,
      groupId: resolved.groupId,
      endDate: isOpenEndedRecurrencePattern(resolved.pattern) ? null : endDate,
    }
  }

  if (lesson.member_id) {
    const { data: candidates } = await supabase
      .from('lessons')
      .select(LESSON_SERIES_SELECT)
      .eq('member_id', lesson.member_id)

    const inferred = inferRecurrenceFromSlotLessons(lesson, candidates ?? [])
    if (inferred) {
      return {
        pattern: inferred.pattern,
        groupId: inferred.groupId,
        endDate: inferred.endDate,
      }
    }
  }

  const title = resolveLessonTitle(lesson)
  if (title && !lesson.member_id) {
    const { data: candidates } = await supabase
      .from('lessons')
      .select(LESSON_SERIES_SELECT)
      .eq('title', title)
      .is('member_id', null)

    const inferred = inferRecurrenceFromSlotLessons(lesson, candidates ?? [])
    if (inferred) {
      return {
        pattern: inferred.pattern,
        groupId: inferred.groupId,
        endDate: inferred.endDate,
      }
    }
  }

  const recurringTarget = await resolveRecurringDeleteTarget(lessonId, lesson.lesson_date)
  if (recurringTarget) {
    const { data: master } = await supabase
      .from('lessons')
      .select(LESSON_SERIES_SELECT)
      .eq('id', recurringTarget.masterId)
      .maybeSingle()

    if (master) {
      const masterResolved = resolveLessonRecurrence(master)
      if (masterResolved.groupId && masterResolved.pattern !== 'none') {
        return {
          pattern: masterResolved.pattern,
          groupId: masterResolved.groupId,
          endDate: isOpenEndedRecurrencePattern(masterResolved.pattern)
            ? null
            : null,
        }
      }
    }
  }

  return {
    pattern: 'none',
    groupId: null,
    endDate: null,
  }
}

export async function removeLessonRecurrence(
  lessonId: string,
  scope: LessonSeriesScope,
  anchorDate: string,
  updates: Partial<LessonFormData>,
): Promise<{ data?: Lesson[]; deletedIds?: string[]; error?: string }> {
  await requireRole(['admin', 'instructor'])
  const result = await removeLessonRecurrenceInternal(lessonId, scope, anchorDate, updates)
  return result
}

export async function convertLessonToRecurringSeries(
  lessonId: string,
  scope: LessonSeriesScope,
  anchorDate: string,
  updates: Partial<LessonFormData>,
  pattern: LessonRecurrencePattern,
  endDate?: string | null,
): Promise<{ data?: Lesson[]; deletedIds?: string[]; error?: string }> {
  await requireRole(['admin', 'instructor'])
  return convertLessonToRecurringSeriesInternal(
    lessonId,
    scope,
    anchorDate,
    updates,
    pattern,
    endDate,
  )
}

export async function updateLessonSeries(
  lessonId: string,
  updates: Partial<LessonFormData>,
  scope: LessonSeriesScope,
  anchorDate: string,
): Promise<{ data?: Lesson[]; error?: string; warning?: string; deletedIds?: string[] }> {
  const user = await requireRole(['admin', 'instructor'])

  const virtual = parseVirtualLessonId(lessonId)
  if (virtual) {
    const result = await updateRecurringMasterSeries(
      virtual.masterId,
      scope,
      virtual.occurrenceDate,
      updates,
    )
    return result
  }

  const recurringTarget = await resolveRecurringDeleteTarget(lessonId, anchorDate)
  if (recurringTarget) {
    const result = await updateRecurringMasterSeries(
      recurringTarget.masterId,
      scope,
      recurringTarget.occurrenceDate,
      updates,
    )
    return result
  }

  const supabase = await lessonWriteClient()

  const { data: lesson, error: lessonError } = await fetchLessonSeriesRow(
    supabase,
    lessonId,
  )

  if (lessonError || !lesson) {
    return { error: lessonError ?? '수업을 찾을 수 없습니다.' }
  }

  const { groupId } = resolveLessonRecurrence(lesson)
  const inferredFutureIds =
    !groupId && scope !== 'single'
      ? await inferSeriesSiblingIds(supabase, lesson, anchorDate, 'future')
      : null
  const hasInferredSeries = Boolean(inferredFutureIds?.length)

  if (scope === 'single' || (!groupId && !hasInferredSeries)) {
    const payload = buildLessonUpdatePayload(updates)
    if (scope === 'single' && groupId) {
      Object.assign(
        payload,
        withoutLegacyRecurrenceNote(payload, lesson.special_note),
      )
    }

    const result = await updateLesson(lessonId, payload as Partial<LessonFormData>)
    if (result.error) return { error: result.error }
    return {
      data: result.data ? [result.data] : undefined,
      warning: result.warning,
    }
  }

  const targetIds = await fetchSeriesSiblingIds(
    supabase,
    lesson,
    anchorDate,
    'future',
  )

  const { data: siblings, error: siblingsError } = await supabase
    .from('lessons')
    .select(LESSON_SERIES_SELECT)
    .in('id', targetIds)
    .order('lesson_date', { ascending: true })

  if (siblingsError) {
    return { error: siblingsError.message }
  }

  const targets = siblings ?? []
  const fullPayload = buildLessonUpdatePayload(updates)
  const sharedPayload = buildSharedSeriesUpdatePayload(updates)
  const updatedLessons: Lesson[] = []
  let warning: string | undefined

  for (const target of targets) {
    const payload =
      target.id === lessonId ? fullPayload : { ...sharedPayload }

    const { data, error } = await supabase
      .from('lessons')
      .update(payload)
      .eq('id', target.id)
      .select(LESSON_MUTATION_SELECT_LEGACY)
      .single()

    if (error) {
      if (isMissingRecurrenceColumn(error)) {
        warning = LESSON_RECURRENCE_MIGRATION_HINT
      }
      console.error('Error updating lesson series item:', error)
      return {
        error: mapLessonError(error.message),
      }
    }

    if (data) {
      const normalized = normalizeLessonRecord(data as Lesson)
      updatedLessons.push(normalized)
      await syncTrialPayForLesson(supabase, normalized, user.id)
    }
  }

  revalidatePath('/dashboard/lessons')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/lesson-status')
  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/reports')

  await runGoogleLessonPush(updatedLessons.map((lesson) => lesson.id))

  return { data: updatedLessons, warning }
}

async function lessonDeleteClient() {
  const admin = getLessonWriteClient()
  if (admin) return admin
  return lessonWriteClient()
}

export async function deleteLessonsInSeries(
  lessonId: string,
  scope: LessonSeriesScope,
  anchorDate: string,
): Promise<{ deletedIds?: string[]; error?: string }> {
  await requireRole(['admin', 'instructor'])

  const virtual = parseVirtualLessonId(lessonId)
  if (virtual) {
    return deleteRecurringMasterSeries(
      virtual.masterId,
      scope,
      virtual.occurrenceDate,
    )
  }

  const recurringTarget = await resolveRecurringDeleteTarget(lessonId, anchorDate)
  if (recurringTarget) {
    return deleteRecurringMasterSeries(
      recurringTarget.masterId,
      scope,
      recurringTarget.occurrenceDate,
    )
  }

  const supabase = await lessonDeleteClient()

  const { data: lesson, error: lessonError } = await fetchLessonSeriesRow(
    supabase,
    lessonId,
  )

  if (lessonError || !lesson) {
    return { error: lessonError ?? '수업을 찾을 수 없습니다.' }
  }

  let targetIds = await fetchSeriesSiblingIds(
    supabase,
    lesson,
    anchorDate,
    scope,
  )

  if (
    scope === 'single' &&
    !virtual &&
    !recurringTarget &&
    lesson.member_id
  ) {
    const slotIds = await findMemberSlotRowIds(supabase, {
      lessonDate: lesson.lesson_date,
      startTime: lesson.start_time,
      memberId: lesson.member_id,
    })
    if (slotIds.length > 0) {
      targetIds = slotIds
    }
  }

  const uniqueTargetIds = [...new Set(targetIds)]
  if (uniqueTargetIds.length === 0) {
    return { error: '삭제할 수업을 찾을 수 없습니다.' }
  }

  const { data: googleDeleteSnapshots } = await supabase
    .from('lessons')
    .select(
      'id, google_event_id, google_calendar_id, google_account_id, event_type, session_deducted',
    )
    .in('id', uniqueTargetIds)

  const deletedIds: string[] = []
  const chunkSize = 40

  for (let i = 0; i < uniqueTargetIds.length; i += chunkSize) {
    const chunk = uniqueTargetIds.slice(i, i + chunkSize)
    const { error } = await supabase.from('lessons').delete().in('id', chunk)

    if (error) {
      console.error('Error deleting lesson series:', error)
      return {
        error: mapLessonError(error.message),
        deletedIds: deletedIds.length > 0 ? deletedIds : undefined,
      }
    }

    deletedIds.push(...chunk)
  }

  const uniqueDeletedIds = [...new Set(deletedIds)]
  if (uniqueDeletedIds.length === 0) {
    return {
      error:
        '수업 삭제에 실패했습니다. 권한을 확인하거나 supabase/fix-lessons-rls.sql 을 실행해주세요.',
    }
  }

  revalidatePath('/dashboard/lessons')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/lesson-status')

  const deletedSet = new Set(uniqueDeletedIds)
  scheduleGoogleLessonDeletes(
    (googleDeleteSnapshots ?? []).filter((row) => deletedSet.has(row.id)),
  )

  return { deletedIds: uniqueDeletedIds }
}

export async function deleteLesson(id: string): Promise<{ error?: string }> {
  const result = await deleteLessonsInSeries(id, 'single', '')
  if (result.error) return { error: result.error }
  return {}
}
