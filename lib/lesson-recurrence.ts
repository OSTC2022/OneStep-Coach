import { addDays, addMonths, addWeeks, format, parseISO } from 'date-fns'

export type LessonRecurrencePattern =
  | 'none'
  | 'daily'
  | 'every_other_day'
  | 'weekly'
  | 'biweekly'
  | 'monthly'

export const LESSON_RECURRENCE_OPTIONS: {
  value: LessonRecurrencePattern
  label: string
}[] = [
  { value: 'none', label: '반복 없음' },
  { value: 'daily', label: '매일' },
  { value: 'every_other_day', label: '격일' },
  { value: 'weekly', label: '매주' },
  { value: 'biweekly', label: '2주마다' },
  { value: 'monthly', label: '매월' },
]

/** 한 번에 DB에 만들 반복 수업 상한 (무한 반복도 윈도우 단위로만 저장) */
export const RECURRENCE_MATERIALIZE_COUNT = 26
/** 캘린더 조회 시 미리 확장해 둘 주 수 */
export const RECURRENCE_EXTEND_LEAD_WEEKS = 8
export const MAX_RECURRING_LESSONS = 100

function toDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function parseDateKey(value: string) {
  return parseISO(value)
}

export function isOpenEndedRecurrencePattern(
  pattern: LessonRecurrencePattern,
): boolean {
  return pattern === 'weekly' || pattern === 'biweekly'
}

export function defaultRecurrenceEndDate(
  startDate: string,
  pattern: LessonRecurrencePattern = 'none',
) {
  if (!startDate) return ''
  if (isOpenEndedRecurrencePattern(pattern)) return ''
  return toDateKey(addMonths(parseDateKey(startDate), 1))
}

export function getRecurrenceMaterializeEndDate(
  startDate: string,
  pattern: LessonRecurrencePattern,
) {
  if (!startDate || pattern === 'none') return startDate
  const dates = generateRecurrenceDates(startDate, pattern, '2099-12-31')
  if (dates.length <= RECURRENCE_MATERIALIZE_COUNT) {
    return dates[dates.length - 1] ?? startDate
  }
  return dates[RECURRENCE_MATERIALIZE_COUNT - 1]!
}

export function resolveRecurrenceEndDate(
  startDate: string,
  pattern: LessonRecurrencePattern,
  endDate: string,
) {
  if (isOpenEndedRecurrencePattern(pattern)) {
    return getRecurrenceMaterializeEndDate(startDate, pattern)
  }
  return endDate
}

export function generateRecurrenceDates(
  startDate: string,
  pattern: LessonRecurrencePattern,
  endDate: string,
): string[] {
  if (!startDate || pattern === 'none') return [startDate]

  const start = parseDateKey(startDate)
  const end = parseDateKey(endDate)
  if (end < start) return [startDate]

  const dates: string[] = []
  let current = start

  while (current <= end) {
    dates.push(toDateKey(current))
    if (dates.length >= MAX_RECURRING_LESSONS) break

    switch (pattern) {
      case 'daily':
        current = addDays(current, 1)
        break
      case 'every_other_day':
        current = addDays(current, 2)
        break
      case 'weekly':
        current = addWeeks(current, 1)
        break
      case 'biweekly':
        current = addWeeks(current, 2)
        break
      case 'monthly':
        current = addMonths(current, 1)
        break
      default:
        return dates
    }
  }

  return dates
}

export function advanceRecurrenceDate(
  dateKey: string,
  pattern: LessonRecurrencePattern,
): string {
  const current = parseDateKey(dateKey)
  switch (pattern) {
    case 'daily':
      return toDateKey(addDays(current, 1))
    case 'every_other_day':
      return toDateKey(addDays(current, 2))
    case 'weekly':
      return toDateKey(addWeeks(current, 1))
    case 'biweekly':
      return toDateKey(addWeeks(current, 2))
    case 'monthly':
      return toDateKey(addMonths(current, 1))
    default:
      return dateKey
  }
}

export function generateRecurrenceExtensionDates(
  lastDate: string,
  pattern: LessonRecurrencePattern,
  untilDate: string,
  maxCount = RECURRENCE_MATERIALIZE_COUNT,
): string[] {
  if (!isOpenEndedRecurrencePattern(pattern)) return []

  const dates: string[] = []
  let current = advanceRecurrenceDate(lastDate, pattern)
  const end = parseDateKey(untilDate)

  while (parseDateKey(current) <= end && dates.length < maxCount) {
    dates.push(current)
    current = advanceRecurrenceDate(current, pattern)
  }

  return dates
}

export function getRecurrenceExtensionTargetDate(rangeEndDate: string) {
  return toDateKey(
    addWeeks(parseDateKey(rangeEndDate), RECURRENCE_MATERIALIZE_COUNT),
  )
}

export function shouldExtendRecurrenceSeries(
  lastLessonDate: string,
  rangeEndDate: string,
) {
  const threshold = toDateKey(
    addWeeks(parseDateKey(rangeEndDate), RECURRENCE_EXTEND_LEAD_WEEKS),
  )
  return lastLessonDate < threshold
}

export function getAdditionalRecurrenceDates(
  startDate: string,
  pattern: LessonRecurrencePattern,
  endDate: string,
) {
  const resolvedEnd = resolveRecurrenceEndDate(startDate, pattern, endDate)
  return generateRecurrenceDates(startDate, pattern, resolvedEnd).slice(1)
}

export function parseLessonRecurrencePattern(
  value: string | null | undefined,
): LessonRecurrencePattern {
  if (!value) return 'none'
  const found = LESSON_RECURRENCE_OPTIONS.find((option) => option.value === value)
  return found?.value ?? 'none'
}

function formatOpenEndedRecurrenceLabel(pattern: LessonRecurrencePattern) {
  return pattern === 'biweekly' ? '2주마다' : '매주'
}

export function formatRecurrencePreview(
  startDate: string,
  pattern: LessonRecurrencePattern,
  endDate: string,
  options?: { editing?: boolean },
) {
  if (!startDate || pattern === 'none') return null

  if (isOpenEndedRecurrencePattern(pattern)) {
    const label = formatOpenEndedRecurrenceLabel(pattern)
    if (options?.editing) {
      return `이 수업 수정 · 이후 ${label} 반복 (삭제할 때까지)`
    }
    return `${label} 반복 · 삭제할 때까지`
  }

  if (!endDate) return null

  const dates = generateRecurrenceDates(startDate, pattern, endDate)
  if (dates.length <= 1) return null

  const range = `${dates[0]} ~ ${dates[dates.length - 1]}`
  if (options?.editing) {
    const additional = dates.length - 1
    return `이 수업 수정 + ${additional}회 추가 · ${range}`
  }

  return `총 ${dates.length}회 · ${range}`
}
