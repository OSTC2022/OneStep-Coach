import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Lesson } from '@/lib/types'
import {
  AUTO_INSTRUCTOR_ID,
  formatMemberCalendarLabel,
  formatMemberCalendarMeta,
  getMemberCalendarDisplayParts,
} from '@/lib/member-utils'
import type { Instructor } from '@/lib/types'
import { scoreMemberSearch } from '@/lib/korean-search'

export const LESSON_TITLE_CONTENT_PREFIX = '__cal_title__:'

export function resolveLessonTitle(
  lesson: Pick<Lesson, 'title' | 'content'>,
): string | null {
  const direct = lesson.title?.trim()
  if (direct) return direct
  const content = lesson.content ?? ''
  if (content.startsWith(LESSON_TITLE_CONTENT_PREFIX)) {
    const fallback = content.slice(LESSON_TITLE_CONTENT_PREFIX.length).trim()
    return fallback || null
  }
  return null
}

export function getLessonCalendarDisplayParts(
  lesson: Pick<Lesson, 'member' | 'title' | 'content'>,
): { name: string; meta: string } {
  const custom = resolveLessonTitle(lesson)
  if (custom) return { name: custom, meta: '' }
  if (lesson.member) return getMemberCalendarDisplayParts(lesson.member)
  return { name: '일정', meta: '' }
}

export function getLessonCalendarLabel(
  lesson: Pick<Lesson, 'member' | 'title' | 'content'>,
): string {
  const custom = resolveLessonTitle(lesson)
  if (custom) return custom
  if (lesson.member) return formatMemberCalendarLabel(lesson.member)
  return '일정'
}

export function enrichLessonWithMemberCatalog<
  T extends Pick<Lesson, 'member_id' | 'member'>,
>(
  lesson: T,
  members: Array<
    Pick<import('@/lib/types').Member, 'id' | 'name'> &
      Partial<Pick<import('@/lib/types').Member, 'age' | 'birth_date' | 'sport'>>
  >,
): T {
  if (lesson.member || !lesson.member_id) return lesson
  const member = members.find((item) => item.id === lesson.member_id)
  if (!member) return lesson
  return { ...lesson, member }
}

/** 캘린더에 표시할 가치가 있는 수업만 (취소·「일정」 placeholder 제외) */
export function isLessonCalendarVisible(
  lesson: Pick<Lesson, 'attendance_status' | 'event_status'>,
): boolean {
  if (lesson.attendance_status === 'cancelled') return false
  if (lesson.event_status === 'cancelled') return false
  return true
}

/** 수업현황 — 출석 취소(취소)도 표시, Google 일정 삭제(event_status)만 제외 */
export function isLessonStatusPageVisible(
  lesson: Pick<Lesson, 'attendance_status' | 'event_status'>,
): boolean {
  if (lesson.event_status === 'cancelled') return false
  return true
}

/** 캘린더에 표시할 가치가 있는 수업만 (「일정」 placeholder 제외) */
export function filterDisplayableCalendarLessons<T extends Lesson>(
  lessons: T[],
  options?: { forStatusPage?: boolean },
): T[] {
  const isVisible = options?.forStatusPage
    ? isLessonStatusPageVisible
    : isLessonCalendarVisible
  return lessons.filter(
    (lesson) =>
      isVisible(lesson) && getLessonCalendarLabel(lesson) !== '일정',
  )
}

export function getDefaultLessonCalendarLabel(
  member: Pick<import('@/lib/types').Member, 'name' | 'age' | 'birth_date' | 'sport'> | null | undefined,
): string {
  if (!member?.name) return ''
  return formatMemberCalendarLabel(member)
}

/** 월 보기 등 한 줄 표시 — 예: 16:00 이교직(39축구) */
export function getLessonCalendarDisplayLine(
  lesson: Pick<Lesson, 'member' | 'title' | 'content' | 'start_time'>,
): string {
  const label = getLessonCalendarLabel(lesson)
  const time = lesson.start_time?.slice(0, 5) ?? '시간 미정'
  return `${time} ${label}`
}

function getLessonSearchHaystack(lesson: Lesson): string {
  const { name, meta } = getLessonCalendarDisplayParts(lesson)
  const dateLabel = format(new Date(`${lesson.lesson_date}T12:00:00`), 'yyyy-MM-dd M월 d일', {
    locale: ko,
  })
  const timeLabel = [lesson.start_time?.slice(0, 5), lesson.end_time?.slice(0, 5)]
    .filter(Boolean)
    .join('-')

  return [
    name,
    meta,
    getLessonCalendarLabel(lesson),
    lesson.member?.name,
    lesson.member?.phone,
    lesson.member?.sport,
    resolveLessonTitle(lesson),
    lesson.instructor?.name,
    lesson.lesson_type,
    lesson.lesson_date,
    dateLabel,
    timeLabel,
    lesson.content,
    lesson.special_note,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function matchCalendarLessonSearch(lesson: Lesson, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return getLessonSearchHaystack(lesson).includes(q)
}

export function formatLessonSearchSubtitle(lesson: Lesson): string {
  const dateLabel = format(new Date(`${lesson.lesson_date}T12:00:00`), 'M월 d일 (EEE)', {
    locale: ko,
  })
  const start = lesson.start_time?.slice(0, 5)
  const end = lesson.end_time?.slice(0, 5)
  const time =
    start && end ? `${start}–${end}` : start ? start : end ? end : ''
  const instructor = lesson.instructor?.name
  const type = lesson.lesson_type

  return [dateLabel, time, instructor, type].filter(Boolean).join(' · ')
}

export type CalendarMemberSearchItem = {
  id: string
  name: string
  sport?: string | null
  age?: number | null
  birth_date?: string | null
}

export type CalendarMemberSearchResult = {
  member: CalendarMemberSearchItem
  targetLesson: Lesson | null
}

function sortMemberLessonsForSearch(lessons: Lesson[]): Lesson[] {
  const today = format(new Date(), 'yyyy-MM-dd')

  return [...lessons].sort((a, b) => {
    const aUpcoming = a.lesson_date >= today
    const bUpcoming = b.lesson_date >= today
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1

    if (aUpcoming) {
      const byDate = a.lesson_date.localeCompare(b.lesson_date)
      if (byDate !== 0) return byDate
    } else {
      const byDate = b.lesson_date.localeCompare(a.lesson_date)
      if (byDate !== 0) return byDate
    }

    return (a.start_time ?? '').localeCompare(b.start_time ?? '')
  })
}

export function buildCalendarMemberSearchResults(
  members: CalendarMemberSearchItem[],
  lessons: Lesson[],
  query: string,
  limit = 50,
): CalendarMemberSearchResult[] {
  const q = query.trim()
  if (!q) return []

  const matchingMembers = members
    .map((member) => ({
      member,
      score: scoreMemberSearch(member, q),
    }))
    .filter(({ score }) => score < Number.POSITIVE_INFINITY)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      return a.member.name.localeCompare(b.member.name, 'ko')
    })

  const results: Array<CalendarMemberSearchResult & { score: number }> = []

  for (const { member, score } of matchingMembers) {
    const memberLessons = sortMemberLessonsForSearch(getLessonsForMember(lessons, member.id))

    if (memberLessons.length === 0) {
      results.push({ member, targetLesson: null, score })
      continue
    }

    for (const lesson of memberLessons) {
      results.push({ member, targetLesson: lesson, score })
    }
  }

  return results
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      const nameCmp = a.member.name.localeCompare(b.member.name, 'ko')
      if (nameCmp !== 0) return nameCmp
      const dateCmp = (b.targetLesson?.lesson_date ?? '').localeCompare(
        a.targetLesson?.lesson_date ?? '',
      )
      if (dateCmp !== 0) return dateCmp
      return (b.targetLesson?.start_time ?? '').localeCompare(a.targetLesson?.start_time ?? '')
    })
    .slice(0, limit)
    .map(({ member, targetLesson }) => ({ member, targetLesson }))
}

export function buildCalendarMonthMemberResults(
  members: CalendarMemberSearchItem[],
  lessons: Lesson[],
  monthDate: Date,
): CalendarMemberSearchResult[] {
  const monthStart = format(startOfMonth(monthDate), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(monthDate), 'yyyy-MM-dd')

  const monthLessons = lessons.filter(
    (lesson) => lesson.lesson_date >= monthStart && lesson.lesson_date <= monthEnd,
  )

  const memberMap = new Map(members.map((member) => [member.id, member]))
  const memberIds = new Set<string>()

  for (const lesson of monthLessons) {
    const memberId = getMemberIdFromLesson(lesson)
    if (memberId) memberIds.add(memberId)
  }

  const results: CalendarMemberSearchResult[] = []

  for (const memberId of memberIds) {
    const member = memberMap.get(memberId)
    if (!member) continue

    const memberMonthLessons = sortMemberLessonsForSearch(
      getLessonsForMember(monthLessons, memberId),
    )

    results.push({
      member,
      targetLesson: memberMonthLessons[0] ?? null,
    })
  }

  return results.sort((a, b) => a.member.name.localeCompare(b.member.name, 'ko'))
}

export function filterLessonsForMonth(lessons: Lesson[], monthDate: Date): Lesson[] {
  const monthStart = format(startOfMonth(monthDate), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(monthDate), 'yyyy-MM-dd')

  return lessons.filter(
    (lesson) => lesson.lesson_date >= monthStart && lesson.lesson_date <= monthEnd,
  )
}

/** 캘린더 보기(일·주·월)에 맞춰 목록 필터 */
export function filterLessonsForView(
  lessons: Lesson[],
  date: Date,
  view: CalendarView,
): Lesson[] {
  if (view === 'month') {
    return filterLessonsForMonth(lessons, date)
  }
  const { dateFrom, dateTo } = getRangeForView(date, view)
  return lessons.filter(
    (lesson) => lesson.lesson_date >= dateFrom && lesson.lesson_date <= dateTo,
  )
}

export function sortLessonsBySchedule(lessons: Lesson[]): Lesson[] {
  return [...lessons].sort((a, b) => {
    const dateCmp = a.lesson_date.localeCompare(b.lesson_date)
    if (dateCmp !== 0) return dateCmp
    return (a.start_time ?? '').localeCompare(b.start_time ?? '')
  })
}

export function getLessonInstructorGroupId(lesson: Lesson): string {
  return lesson.instructor_id ?? AUTO_INSTRUCTOR_ID
}

export function buildInstructorOrderMap(instructors: Instructor[]) {
  const map = new Map<string, number>()
  instructors.forEach((instructor, index) => {
    map.set(instructor.id, index)
  })
  map.set(AUTO_INSTRUCTOR_ID, instructors.length)
  return map
}

function compareLessonsByInstructorThenSchedule(
  a: Lesson,
  b: Lesson,
  instructorOrder: Map<string, number>,
) {
  const instructorA = instructorOrder.get(getLessonInstructorGroupId(a)) ?? 9999
  const instructorB = instructorOrder.get(getLessonInstructorGroupId(b)) ?? 9999
  if (instructorA !== instructorB) return instructorA - instructorB

  const startCmp = (a.start_time ?? '').localeCompare(b.start_time ?? '')
  if (startCmp !== 0) return startCmp

  const createdCmp = (a.created_at ?? '').localeCompare(b.created_at ?? '')
  if (createdCmp !== 0) return createdCmp

  return a.id.localeCompare(b.id)
}

/** 수업현황 — 강사별 → 시간순 (출석 변경해도 자리 고정) */
export function sortLessonsForStatusDisplay(
  lessons: Lesson[],
  instructors: Instructor[] = [],
): Lesson[] {
  const instructorOrder = buildInstructorOrderMap(instructors)
  return [...lessons].sort((a, b) =>
    compareLessonsByInstructorThenSchedule(a, b, instructorOrder),
  )
}

export const LESSON_STATUS_MAX_PER_ROW = 8

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return []
  const chunkSize = Math.max(1, size)
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}

/** 같은 시간대 안에서 강사 순으로 정렬 */
export function sortLessonsInTimeSlot(
  lessons: Lesson[],
  instructors: Instructor[] = [],
): Lesson[] {
  const instructorOrder = buildInstructorOrderMap(instructors)
  return [...lessons].sort((a, b) => {
    const instructorA = instructorOrder.get(getLessonInstructorGroupId(a)) ?? 9999
    const instructorB = instructorOrder.get(getLessonInstructorGroupId(b)) ?? 9999
    if (instructorA !== instructorB) return instructorA - instructorB

    const createdCmp = (a.created_at ?? '').localeCompare(b.created_at ?? '')
    if (createdCmp !== 0) return createdCmp

    return a.id.localeCompare(b.id)
  })
}

/** 연속된 같은 강사 수업을 한 덩어리로 묶음 */
export function groupConsecutiveByInstructor(lessons: Lesson[]) {
  const chunks: { instructorId: string; lessons: Lesson[] }[] = []

  for (const lesson of lessons) {
    const instructorId = getLessonInstructorGroupId(lesson)
    const last = chunks[chunks.length - 1]
    if (last?.instructorId === instructorId) {
      last.lessons.push(lesson)
    } else {
      chunks.push({ instructorId, lessons: [lesson] })
    }
  }

  return chunks
}

/** 일별 수업현황 — 현재 시각 기준 스크롤 대상 시간대 */
export function findLessonStatusScrollSlotStart(
  slots: { start: string }[],
  now = new Date(),
): string {
  if (slots.length === 0) return ''
  const nowKey = format(now, 'HH:mm')
  let target = slots[0]?.start ?? ''
  for (const slot of slots) {
    if (!slot.start) continue
    if (slot.start <= nowKey) {
      target = slot.start
      continue
    }
    break
  }
  return target
}

export function buildLessonStatusTimeSlots(
  lessons: Lesson[],
  instructors: Instructor[] = [],
) {
  const byTime = new Map<string, Lesson[]>()

  for (const lesson of lessons) {
    const key = lesson.start_time?.slice(0, 5) ?? ''
    const group = byTime.get(key) ?? []
    group.push(lesson)
    byTime.set(key, group)
  }

  return [...byTime.entries()]
    .map(([start, slotLessons]) => {
      const sorted = sortLessonsInTimeSlot(slotLessons, instructors)
      const rows = chunkArray(sorted, LESSON_STATUS_MAX_PER_ROW).map((rowLessons) =>
        groupConsecutiveByInstructor(rowLessons),
      )
      return { start, total: sorted.length, rows }
    })
    .sort((a, b) => {
      if (!a.start && !b.start) return 0
      if (!a.start) return 1
      if (!b.start) return -1
      return a.start.localeCompare(b.start)
    })
}

export function groupLessonsByInstructorForStatus(
  lessons: Lesson[],
  instructors: Instructor[],
) {
  const groups = new Map<string, Lesson[]>()

  for (const lesson of lessons) {
    const key = getLessonInstructorGroupId(lesson)
    const group = groups.get(key) ?? []
    group.push(lesson)
    groups.set(key, group)
  }

  const orderedKeys = [
    ...instructors.map((instructor) => instructor.id).filter((id) => groups.has(id)),
    ...(groups.has(AUTO_INSTRUCTOR_ID) ? [AUTO_INSTRUCTOR_ID] : []),
    ...[...groups.keys()].filter(
      (id) => id !== AUTO_INSTRUCTOR_ID && !instructors.some((instructor) => instructor.id === id),
    ),
  ]

  return orderedKeys.map((instructorId) => ({
    instructorId,
    lessons: (groups.get(instructorId) ?? []).sort((a, b) => {
      const startCmp = (a.start_time ?? '').localeCompare(b.start_time ?? '')
      if (startCmp !== 0) return startCmp
      const createdCmp = (a.created_at ?? '').localeCompare(b.created_at ?? '')
      if (createdCmp !== 0) return createdCmp
      return a.id.localeCompare(b.id)
    }),
  }))
}

function getMemberIdFromLesson(lesson: Lesson): string | null {
  return lesson.member_id || lesson.member?.id || null
}

export function getLessonsForMember(lessons: Lesson[], memberId: string): Lesson[] {
  return lessons.filter((lesson) => getMemberIdFromLesson(lesson) === memberId)
}

export function formatMemberSearchSubtitle(
  member: CalendarMemberSearchItem,
  targetLesson: Lesson | null,
): string {
  const meta = formatMemberCalendarMeta(member)
  if (!targetLesson) {
    return meta ? `${meta} · 일정 없음` : '등록된 일정 없음'
  }

  const dateLabel = format(
    new Date(`${targetLesson.lesson_date}T12:00:00`),
    'M월 d일',
    { locale: ko },
  )
  const time = targetLesson.start_time?.slice(0, 5)
  const schedule = [dateLabel, time].filter(Boolean).join(' ')
  return meta ? `${meta} · ${schedule}` : schedule
}

export type CalendarView = 'day' | 'week' | 'month'

export type LessonDraft = {
  date: string
  startTime: string
  endTime: string
}

export type LessonEditAnchor = {
  top: number
  left: number
  right: number
  bottom: number
}

const POPUP_WIDTH = 272
export const POPUP_ESTIMATED_HEIGHT = 290
const POPUP_GAP = 8
const MOBILE_POPUP_MAX_VW = 24

export function getLessonPopupPosition(anchor: LessonEditAnchor) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const isMobile = vw < 640
  const popupWidth = isMobile ? Math.min(POPUP_WIDTH, vw - MOBILE_POPUP_MAX_VW) : POPUP_WIDTH

  let left = anchor.left - popupWidth - POPUP_GAP
  let top = anchor.top

  if (isMobile) {
    left = Math.max(12, (vw - popupWidth) / 2)
  } else if (left < 12) {
    left = anchor.right + POPUP_GAP
  }
  if (left + popupWidth > vw - 12) {
    left = Math.max(12, vw - popupWidth - 12)
  }

  if (top + POPUP_ESTIMATED_HEIGHT > vh - 12) {
    top = Math.max(12, vh - POPUP_ESTIMATED_HEIGHT - 12)
  }

  return { top, left, width: popupWidth }
}

export function isSameLessonSlot(a: Lesson, b: Lesson): boolean {
  return (
    a.lesson_date === b.lesson_date &&
    (a.start_time?.slice(0, 5) ?? '') === (b.start_time?.slice(0, 5) ?? '')
  )
}

export function getLessonSlotKey(lesson: Lesson): string {
  return `${lesson.lesson_date}|${lesson.start_time?.slice(0, 5) ?? ''}`
}

export function groupLessonsBySlot(lessons: Lesson[]): Lesson[][] {
  const groups = new Map<string, Lesson[]>()
  for (const lesson of lessons) {
    const key = getLessonSlotKey(lesson)
    const list = groups.get(key) ?? []
    list.push(lesson)
    groups.set(key, list)
  }
  return Array.from(groups.values())
}

export type LessonColumnLayout = {
  lesson: Lesson
  column: number
  columnCount: number
  startMin: number
  endMin: number
}

export function getLessonEndMinutes(lesson: Lesson, startMin?: number): number {
  const start = startMin ?? parseTimeToMinutes(lesson.start_time)
  const endMin = lesson.end_time ? parseTimeToMinutes(lesson.end_time) : start + 60
  return endMin > start ? endMin : start + 60
}

function lessonsTimeRangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd
}

function mergeOverlappingLessonClusters(
  clusters: Array<
    Array<{
      lesson: Lesson
      startMin: number
      endMin: number
    }>
  >,
): Array<
  Array<{
    lesson: Lesson
    startMin: number
    endMin: number
  }>
> {
  let merged = clusters.map((cluster) => [...cluster])
  let changed = true

  while (changed) {
    changed = false
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const overlaps = merged[i].some((a) =>
          merged[j].some((b) =>
            lessonsTimeRangesOverlap(a.startMin, a.endMin, b.startMin, b.endMin),
          ),
        )
        if (overlaps) {
          merged[i].push(...merged[j])
          merged.splice(j, 1)
          changed = true
          break
        }
      }
      if (changed) break
    }
  }

  return merged
}

/** Overlapping lessons are placed side-by-side with vertical labels. */
export function computeLessonColumnLayouts(lessons: Lesson[]): LessonColumnLayout[] {
  if (lessons.length === 0) return []

  const items = lessons
    .map((lesson) => {
      const startMin = parseTimeToMinutes(lesson.start_time)
      return {
        lesson,
        startMin,
        endMin: getLessonEndMinutes(lesson, startMin),
      }
    })
    .sort(
      (a, b) =>
        a.startMin - b.startMin ||
        a.endMin - b.endMin ||
        getLessonCalendarLabel(a.lesson).localeCompare(
          getLessonCalendarLabel(b.lesson),
          'ko',
        ),
    )

  const initialClusters: Array<
    Array<{
      lesson: Lesson
      startMin: number
      endMin: number
    }>
  > = []

  for (const item of items) {
    let placed = false
    for (const cluster of initialClusters) {
      const overlaps = cluster.some((existing) =>
        lessonsTimeRangesOverlap(
          item.startMin,
          item.endMin,
          existing.startMin,
          existing.endMin,
        ),
      )
      if (overlaps) {
        cluster.push(item)
        placed = true
        break
      }
    }
    if (!placed) initialClusters.push([item])
  }

  const clusters = mergeOverlappingLessonClusters(initialClusters)
  const layouts: LessonColumnLayout[] = []

  for (const cluster of clusters) {
    const sorted = [...cluster].sort(
      (a, b) =>
        getLessonCalendarLabel(a.lesson).localeCompare(
          getLessonCalendarLabel(b.lesson),
          'ko',
        ) || a.lesson.id.localeCompare(b.lesson.id),
    )
    const columnCount = sorted.length

    for (let column = 0; column < sorted.length; column++) {
      const { lesson, startMin, endMin } = sorted[column]
      layouts.push({
        lesson,
        column,
        columnCount,
        startMin,
        endMin,
      })
    }
  }

  return layouts.sort(
    (a, b) => a.startMin - b.startMin || a.column - b.column,
  )
}

export function getLessonBlockHorizontalStyle(
  column: number,
  columnCount: number,
  insetPx = 4,
  gapPx = 2,
): { left: string; width: string } {
  if (columnCount <= 1) {
    return {
      left: `${insetPx}px`,
      width: `calc(100% - ${insetPx * 2}px)`,
    }
  }
  const gaps = (columnCount - 1) * gapPx
  const widthExpr = `(100% - ${insetPx * 2 + gaps}px) / ${columnCount}`
  return {
    width: `calc(${widthExpr})`,
    left: `calc(${insetPx}px + ${column} * (${widthExpr} + ${gapPx}px))`,
  }
}

/** Same slot, one row per member (deduped by member_id). */
export function getUniqueLessonsByMember(group: Lesson[]): Lesson[] {
  const seen = new Set<string>()
  const result: Lesson[] = []
  for (const lesson of group) {
    const memberKey = lesson.member_id || lesson.member?.id
    if (!memberKey || seen.has(memberKey)) continue
    seen.add(memberKey)
    result.push(lesson)
  }
  return result.length > 0 ? result : group.slice(0, 1)
}

/** Pick the lesson row for the member line the user clicked in a grouped block. */
export function resolveClickedLessonInGroup(
  group: Lesson[],
  clientY: number,
  rect: DOMRect,
  options?: { hasResizeHandle?: boolean },
): Lesson {
  const unique = getUniqueLessonsByMember(group)
  if (unique.length <= 1) return unique[0] ?? group[0]

  const handleHeight = options?.hasResizeHandle ? 8 : 0
  const paddingTop = 2
  const memberLineHeight = 14
  const memberGap = 2
  const y = clientY - rect.top - handleHeight - paddingTop

  const membersBlockHeight =
    unique.length * memberLineHeight + (unique.length - 1) * memberGap

  if (y >= membersBlockHeight) {
    return unique[unique.length - 1]
  }

  const index = Math.min(
    unique.length - 1,
    Math.max(0, Math.floor(y / (memberLineHeight + memberGap))),
  )
  return unique[index]
}

export const CALENDAR_START_HOUR = 7
export const CALENDAR_END_HOUR = 22
export const DEFAULT_HOUR_HEIGHT = 56
/** @deprecated use DEFAULT_HOUR_HEIGHT or pass hourHeight to helpers */
export const HOUR_HEIGHT = DEFAULT_HOUR_HEIGHT
export const MIN_HOUR_HEIGHT = 32
export const MAX_HOUR_HEIGHT = 140
export const HOUR_HEIGHT_ZOOM_STEP = 6
export const SLOT_MINUTES = 15
/** 드래그 이동·리사이즈 격자 (분) */
export const DRAG_SNAP_MINUTES = 5
export const WEEK_STARTS_ON = 1 as const

export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function parseTimeToMinutes(time: string | null): number {
  if (!time) return CALENDAR_START_HOUR * 60
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

/** 수업 종료 시각이 현재보다 이전이면 true */
export function isLessonScheduleEnded(
  lessonDate: string | null | undefined,
  endTime: string | null | undefined,
): boolean {
  if (!lessonDate) return false
  const end = endTime?.slice(0, 5)
  if (!end) return false
  const endAt = new Date(`${lessonDate}T${end}:00`)
  if (!Number.isFinite(endAt.getTime())) return false
  return endAt.getTime() <= Date.now()
}

export function resolveLessonDurationMinutes(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  fallbackMinutes = 60,
): number {
  const startMin = parseTimeToMinutes(startTime ?? null)
  const endMin = endTime
    ? parseTimeToMinutes(endTime)
    : startMin + fallbackMinutes
  return Math.max(15, endMin - startMin)
}

export function shiftEndTimeByDuration(
  startTime: string,
  durationMinutes: number,
): string | null {
  const normalizedStart = startTime.slice(0, 5)
  const endMin = parseTimeToMinutes(normalizedStart) + durationMinutes
  if (endMin >= 24 * 60) return null
  return minutesToTimeString(endMin)
}

export function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function snapMinutes(minutes: number, slot = SLOT_MINUTES): number {
  return Math.round(minutes / slot) * slot
}

export function yToMinutes(y: number, hourHeight = DEFAULT_HOUR_HEIGHT): number {
  const raw =
    CALENDAR_START_HOUR * 60 + (y / hourHeight) * 60
  const clamped = Math.max(
    CALENDAR_START_HOUR * 60,
    Math.min(CALENDAR_END_HOUR * 60, raw),
  )
  return snapMinutes(clamped)
}

/** 드래그 이동·리사이즈 — 5분 단위 스냅 */
export function yToDragMinutes(y: number, hourHeight = DEFAULT_HOUR_HEIGHT): number {
  const raw = CALENDAR_START_HOUR * 60 + (y / hourHeight) * 60
  const clamped = Math.max(
    CALENDAR_START_HOUR * 60,
    Math.min(CALENDAR_END_HOUR * 60, raw),
  )
  return snapMinutes(clamped, DRAG_SNAP_MINUTES)
}

export function snapDragTop(
  top: number,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  maxTop = Number.POSITIVE_INFINITY,
): number {
  const snapped = minutesToTop(yToDragMinutes(top, hourHeight), hourHeight)
  return Math.max(0, Math.min(maxTop, snapped))
}

export function getGridHeight(hourHeight = DEFAULT_HOUR_HEIGHT): number {
  return (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * hourHeight
}

export function minutesToTop(minutes: number, hourHeight = DEFAULT_HOUR_HEIGHT): number {
  return ((minutes - CALENDAR_START_HOUR * 60) / 60) * hourHeight
}

export function minutesToHeight(
  durationMinutes: number,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  minHeight = 24,
): number {
  return Math.max((durationMinutes / 60) * hourHeight, minHeight)
}

export function getWeekDates(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function getMonthGridDates(date: Date): Date[] {
  const monthStart = startOfMonth(date)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON })
  const monthEnd = endOfMonth(date)
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON })

  const dates: Date[] = []
  let current = gridStart
  while (current <= gridEnd) {
    dates.push(current)
    current = addDays(current, 1)
  }
  return dates
}

export function navigateDate(
  date: Date,
  view: CalendarView,
  direction: -1 | 1,
): Date {
  if (view === 'day') return addDays(date, direction)
  if (view === 'week') return addWeeks(date, direction)
  return addMonths(date, direction)
}

export function getViewTitle(date: Date, view: CalendarView): string {
  if (view === 'day') {
    return format(date, 'yy년 M월 d일 (EEE)', { locale: ko })
  }
  if (view === 'week') {
    const week = getWeekDates(date)
    const start = week[0]
    const end = week[6]
    if (start.getMonth() === end.getMonth()) {
      return format(start, 'yy년 M월 d일', { locale: ko }) +
        ' – ' +
        format(end, 'd일', { locale: ko })
    }
    return format(start, 'yy년 M월 d일', { locale: ko }) +
      ' – ' +
      format(end, 'M월 d일', { locale: ko })
  }
  return format(date, 'yy년 M월', { locale: ko })
}

export function getRangeForView(date: Date, view: CalendarView): {
  dateFrom: string
  dateTo: string
} {
  if (view === 'day') {
    const key = toDateKey(date)
    return { dateFrom: key, dateTo: key }
  }
  if (view === 'week') {
    const week = getWeekDates(date)
    return {
      dateFrom: toDateKey(week[0]),
      dateTo: toDateKey(week[6]),
    }
  }
  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON })
  return {
    dateFrom: toDateKey(gridStart),
    dateTo: toDateKey(gridEnd),
  }
}

export function getEventStyle(
  lesson: Lesson,
  hourHeight = DEFAULT_HOUR_HEIGHT,
): {
  top: number
  height: number
} {
  const startMin = parseTimeToMinutes(lesson.start_time)
  let endMin = lesson.end_time
    ? parseTimeToMinutes(lesson.end_time)
    : startMin + 60
  if (endMin <= startMin) endMin = startMin + 30

  const top = minutesToTop(startMin, hourHeight)
  const height = minutesToHeight(endMin - startMin, hourHeight)
  return { top, height }
}

export function getLessonDurationMinutes(lesson: Lesson): number {
  const startMin = parseTimeToMinutes(lesson.start_time)
  let endMin = lesson.end_time
    ? parseTimeToMinutes(lesson.end_time)
    : startMin + 60
  if (endMin <= startMin) endMin = startMin + 30
  return endMin - startMin
}

export function formatTimeDisplay(time: string | null): string {
  if (!time) return ''
  return time.slice(0, 5)
}

export { isSameDay, isSameMonth }
