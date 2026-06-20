import { addDays, format, parseISO } from 'date-fns'
import { RRule, rrulestr } from 'rrule'
import type { Lesson } from '@/lib/types'
import { resolveLessonTitle, filterDisplayableCalendarLessons, isLessonCalendarVisible, isLessonStatusPageVisible } from '@/lib/calendar-utils'
import { dedupeLessonsBySlot } from '@/lib/lesson-slot-dedupe'
import {
  buildVirtualLessonId,
  isDisplayStoredLesson,
  isRecurringMaster,
  rruleLinesToPattern,
  type RecurrenceCapableLesson,
} from '@/lib/calendar-recurrence/types'

function toDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function parseLessonDateTime(lessonDate: string, time?: string | null): Date {
  const hhmm = (time ?? '00:00').slice(0, 5)
  return parseISO(`${lessonDate}T${hhmm}:00`)
}

function formatOriginalStartKey(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function isLessonIdentifiable(
  lesson: Pick<Lesson, 'member_id' | 'member' | 'title' | 'content'>,
): boolean {
  if (lesson.member) return true
  if (lesson.member_id) return true
  return Boolean(resolveLessonTitle(lesson))
}

function shouldPreferVirtualLesson(stored: Lesson, virtual: Lesson): boolean {
  if (virtual.recurring_master_id && stored.event_type !== 'exception') {
    const storedInSeries =
      Boolean(stored.recurrence_group_id) || stored.event_type === 'materialized'
    if (!storedInSeries) return true
  }
  return false
}

function lessonIdentityScore(
  lesson: Pick<Lesson, 'member_id' | 'member' | 'title' | 'content'>,
): number {
  if (lesson.member) return 4
  if (lesson.member_id) return 3
  if (resolveLessonTitle(lesson)) return 2
  return 0
}

export function masterHasOccurrenceOnDate(
  master: RecurrenceCapableLesson,
  date: string,
): boolean {
  if (master.lesson_date > date) return false

  if (exdateKeysFromRecurrence(master.recurrence).has(date)) {
    return false
  }

  const rule = buildRRuleFromMaster(master)
  if (!rule) return master.lesson_date === date
  const from = parseISO(`${date}T00:00:00`)
  const to = parseISO(`${date}T23:59:59`)
  return rule.between(from, to, true).some((dt) => toDateKey(dt) === date)
}

function calendarLessonDedupeKey(
  lesson: Pick<Lesson, 'id' | 'member_id' | 'title' | 'content' | 'lesson_date' | 'start_time'>,
): string {
  const memberKey = memberSlotIdentityKey(lesson)
  if (!memberKey) return `id:${lesson.id}`
  return `${lesson.lesson_date}|${(lesson.start_time ?? '').slice(0, 5)}|${memberKey}`
}

function masterIdsForStoredRow(
  row: RecurrenceCapableLesson,
  masters: RecurrenceCapableLesson[],
): string[] {
  const ids = new Set<string>()
  if (row.recurring_master_id) ids.add(row.recurring_master_id)
  if (!row.recurrence_group_id) return [...ids]

  for (const master of masters) {
    if (master.recurrence_group_id === row.recurrence_group_id) ids.add(master.id)
    if (master.id === row.recurrence_group_id) ids.add(master.id)
  }
  return [...ids]
}

export function normalizeCalendarLessonsForDisplay(
  lessons: Lesson[],
  options?: { forStatusPage?: boolean },
): Lesson[] {
  return filterDisplayableCalendarLessons(
    collapseSlotDuplicateLessons(lessons),
    options,
  )
}

function memberSlotIdentityKey(
  lesson: Pick<Lesson, 'member_id' | 'title' | 'content'>,
): string | null {
  if (lesson.member_id) return `m:${lesson.member_id}`
  const title = resolveLessonTitle(lesson)
  if (title) return `t:${title}`
  return null
}

export function collapseSlotDuplicateLessons(lessons: Lesson[]): Lesson[] {
  return dedupeLessonsBySlot(lessons).sort((a, b) => {
    const dateCmp = a.lesson_date.localeCompare(b.lesson_date)
    if (dateCmp !== 0) return dateCmp
    return (a.start_time ?? '').localeCompare(b.start_time ?? '')
  })
}

function recurringGroupSlotOccurrenceKey(
  master: RecurrenceCapableLesson,
  occurrenceDate: string,
): string | null {
  const memberKey = memberSlotIdentityKey(master as Lesson)
  if (!memberKey) return null
  const groupId = master.recurrence_group_id ?? master.id
  const start = (master.start_time ?? '').slice(0, 5)
  return `${groupId}|${occurrenceDate}|${start}|${memberKey}`
}

function shouldPreferRecurringMasterForOccurrence(
  candidate: RecurrenceCapableLesson,
  incumbent: RecurrenceCapableLesson,
  occurrenceDate: string,
): boolean {
  const candidateStart = candidate.lesson_date
  const incumbentStart = incumbent.lesson_date
  if (candidateStart <= occurrenceDate && incumbentStart > occurrenceDate) return true
  if (candidateStart > occurrenceDate && incumbentStart <= occurrenceDate) return false
  return candidateStart > incumbentStart
}

function buildRRuleFromMaster(master: RecurrenceCapableLesson): RRule | null {
  const lines = master.recurrence ?? []
  const rruleLine = lines.find((line) => line.startsWith('RRULE:'))
  if (!rruleLine) return null

  const dtstart = parseLessonDateTime(master.lesson_date, master.start_time)
  try {
    return rrulestr(rruleLine, { dtstart }) as RRule
  } catch {
    return null
  }
}

function exdateKeysFromRecurrence(lines: string[] | null | undefined): Set<string> {
  const set = new Set<string>()
  for (const line of lines ?? []) {
    if (!line.startsWith('EXDATE')) continue
    const dateOnly = line.match(/(?:VALUE=DATE:)?(\d{4})(\d{2})(\d{2})/)
    if (dateOnly) {
      set.add(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`)
      continue
    }
    const iso = line.match(/EXDATE:(\d{4})(\d{2})(\d{2})T/)
    if (iso) set.add(`${iso[1]}-${iso[2]}-${iso[3]}`)
  }
  return set
}

function formatRRuleDtstart(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

function cloneLessonForOccurrence(
  master: RecurrenceCapableLesson,
  occurrenceDate: string,
): Lesson {
  const pattern =
    master.recurrence_pattern ?? rruleLinesToPattern(master.recurrence ?? [])
  return {
    ...(master as Lesson),
    id: buildVirtualLessonId(master.id, occurrenceDate),
    lesson_date: occurrenceDate,
    recurrence_group_id: master.recurrence_group_id ?? master.id,
    recurrence_pattern: pattern === 'none' ? master.recurrence_pattern : pattern,
    event_type: undefined,
    recurrence: undefined,
    recurring_master_id: master.id,
  }
}

function applyException(
  base: Lesson,
  exception: RecurrenceCapableLesson,
): Lesson | null {
  const cancelled =
    exception.event_status === 'cancelled' ||
    exception.attendance_status === 'cancelled'
  if (cancelled) return null

  return {
    ...base,
    ...exception,
    id: exception.id,
    lesson_date: base.lesson_date,
    recurring_master_id: exception.recurring_master_id ?? base.recurring_master_id,
    event_type: undefined,
  } as Lesson
}

function masterCoversRange(
  master: RecurrenceCapableLesson,
  dateFrom: string,
  dateTo: string,
): boolean {
  if (master.lesson_date > dateTo) return false
  const rule = buildRRuleFromMaster(master)
  if (!rule) return master.lesson_date >= dateFrom && master.lesson_date <= dateTo

  const from = parseISO(`${dateFrom}T00:00:00`)
  const to = parseISO(`${dateTo}T23:59:59`)
  const dates = rule.between(from, to, true)
  return dates.length > 0 || (master.lesson_date >= dateFrom && master.lesson_date <= dateTo)
}

export function expandRecurringMastersForRange(
  masters: RecurrenceCapableLesson[],
  exceptions: RecurrenceCapableLesson[],
  dateFrom: string,
  dateTo: string,
  occupiedDatesByMaster: Map<string, Set<string>>,
): Lesson[] {
  const exceptionsByMaster = new Map<string, Map<string, RecurrenceCapableLesson>>()

  for (const ex of exceptions) {
    if (!ex.recurring_master_id) continue
    const key =
      formatOriginalStartKey(ex.original_start_time) ??
      `${ex.lesson_date}T${(ex.start_time ?? '00:00').slice(0, 5)}:00.000Z`
    const dateKey = ex.lesson_date
    const bucket = exceptionsByMaster.get(ex.recurring_master_id) ?? new Map()
    bucket.set(dateKey, ex)
    bucket.set(key, ex)
    exceptionsByMaster.set(ex.recurring_master_id, bucket)
  }

  const expanded: Lesson[] = []
  const virtualByGroupSlot = new Map<
    string,
    { master: RecurrenceCapableLesson; lesson: Lesson }
  >()

  function considerVirtual(
    master: RecurrenceCapableLesson,
    lesson: Lesson,
  ) {
    const slotKey = recurringGroupSlotOccurrenceKey(master, lesson.lesson_date)
    if (!slotKey) {
      expanded.push(lesson)
      return
    }

    const existing = virtualByGroupSlot.get(slotKey)
    if (
      !existing ||
      shouldPreferRecurringMasterForOccurrence(
        master,
        existing.master,
        lesson.lesson_date,
      )
    ) {
      virtualByGroupSlot.set(slotKey, { master, lesson })
    }
  }

  for (const master of masters) {
    if (!isRecurringMaster(master)) continue
    if (master.event_status === 'cancelled') continue
    if (!isLessonIdentifiable(master as Lesson)) continue
    if (!masterCoversRange(master, dateFrom, dateTo)) continue

    const rule = buildRRuleFromMaster(master)
    const occupied = occupiedDatesByMaster.get(master.id) ?? new Set()
    const exMap = exceptionsByMaster.get(master.id) ?? new Map()
    const exdateKeys = exdateKeysFromRecurrence(master.recurrence)

    const occurrenceDates: string[] = []

    if (rule) {
      const from = parseISO(`${dateFrom}T00:00:00`)
      const to = parseISO(`${dateTo}T23:59:59`)
      for (const dt of rule.between(from, to, true)) {
        occurrenceDates.push(toDateKey(dt))
      }
    } else if (master.lesson_date >= dateFrom && master.lesson_date <= dateTo) {
      occurrenceDates.push(master.lesson_date)
    }

    for (const occurrenceDate of occurrenceDates) {
      if (occupied.has(occurrenceDate)) continue
      if (exdateKeys.has(occurrenceDate)) continue

      const base = cloneLessonForOccurrence(master, occurrenceDate)
      const exception =
        exMap.get(occurrenceDate) ??
        [...exMap.values()].find((row) => row.lesson_date === occurrenceDate)

      if (exception) {
        const merged = applyException(base, exception)
        if (merged) considerVirtual(master, merged)
        continue
      }

      considerVirtual(master, base)
    }
  }

  expanded.push(...virtualByGroupSlot.values().map((entry) => entry.lesson))

  return expanded
}

export function mergeCalendarLessonsForRange(
  stored: RecurrenceCapableLesson[],
  masters: RecurrenceCapableLesson[],
  exceptions: RecurrenceCapableLesson[],
  dateFrom: string,
  dateTo: string,
  options?: { forStatusPage?: boolean },
): Lesson[] {
  const isStoredVisible = options?.forStatusPage
    ? (row: RecurrenceCapableLesson) =>
        isLessonStatusPageVisible(row as Lesson) &&
        isDisplayStoredLesson(row) &&
        isLessonIdentifiable(row as Lesson)
    : (row: RecurrenceCapableLesson) =>
        isDisplayStoredLesson(row) &&
        isLessonCalendarVisible(row as Lesson) &&
        isLessonIdentifiable(row as Lesson)

  const inRangeStored = stored.filter(
    (row) =>
      isStoredVisible(row) &&
      row.lesson_date >= dateFrom &&
      row.lesson_date <= dateTo &&
      row.event_type !== 'recurring_master',
  )

  const occupiedDatesByMaster = new Map<string, Set<string>>()
  for (const row of stored) {
    if (row.event_type === 'recurring_master') continue
    if (!isLessonCalendarVisible(row as Lesson)) continue
    for (const masterId of masterIdsForStoredRow(row, masters)) {
      const set = occupiedDatesByMaster.get(masterId) ?? new Set()
      set.add(row.lesson_date)
      occupiedDatesByMaster.set(masterId, set)
    }
  }

  const virtual = expandRecurringMastersForRange(
    masters,
    exceptions,
    dateFrom,
    dateTo,
    occupiedDatesByMaster,
  )

  const dedupeKey = calendarLessonDedupeKey

  const map = new Map<string, Lesson>()
  for (const row of inRangeStored) {
    const key = dedupeKey(row as Lesson)
    const existing = map.get(key)
    if (!existing || lessonIdentityScore(row as Lesson) > lessonIdentityScore(existing)) {
      map.set(key, row as Lesson)
    }
  }
  for (const row of virtual) {
    const key = dedupeKey(row)
    const existing = map.get(key)
    if (
      !existing ||
      shouldPreferVirtualLesson(existing, row) ||
      lessonIdentityScore(row) > lessonIdentityScore(existing)
    ) {
      map.set(key, row)
    }
  }

  return normalizeCalendarLessonsForDisplay(
    Array.from(map.values()).sort((a, b) => {
      const dateCmp = a.lesson_date.localeCompare(b.lesson_date)
      if (dateCmp !== 0) return dateCmp
      return (a.start_time ?? '').localeCompare(b.start_time ?? '')
    }),
    options,
  )
}

export function addExdateToRecurrence(
  recurrence: string[] | null | undefined,
  occurrenceDate: string,
  _startTime?: string | null,
): string[] {
  const lines = [...(recurrence ?? [])]
  const compact = occurrenceDate.replace(/-/g, '')
  const exdate = `EXDATE;VALUE=DATE:${compact}`
  const already = lines.some((line) => line.includes(compact))
  if (!already) lines.push(exdate)
  return lines
}

export function truncateRecurrenceUntil(
  recurrence: string[] | null | undefined,
  untilDate: string,
): string[] {
  const lines = (recurrence ?? []).filter((line) => !line.includes('UNTIL='))
  const rruleIndex = lines.findIndex((line) => line.startsWith('RRULE:'))
  const until = formatRRuleDtstart(parseISO(`${untilDate}T23:59:59`))
  if (rruleIndex >= 0) {
    lines[rruleIndex] = `${lines[rruleIndex]};UNTIL=${until}`
  }
  return lines
}

export function getNextOccurrenceDate(dateKey: string): string {
  return toDateKey(addDays(parseISO(dateKey), 1))
}
