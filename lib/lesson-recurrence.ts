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

export const MAX_RECURRING_LESSONS = 100

function toDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function parseDateKey(value: string) {
  return parseISO(value)
}

export function defaultRecurrenceEndDate(startDate: string) {
  if (!startDate) return ''
  return toDateKey(addMonths(parseDateKey(startDate), 1))
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

export function getAdditionalRecurrenceDates(
  startDate: string,
  pattern: LessonRecurrencePattern,
  endDate: string,
) {
  return generateRecurrenceDates(startDate, pattern, endDate).slice(1)
}

export function parseLessonRecurrencePattern(
  value: string | null | undefined,
): LessonRecurrencePattern {
  if (!value) return 'none'
  const found = LESSON_RECURRENCE_OPTIONS.find((option) => option.value === value)
  return found?.value ?? 'none'
}

export function formatRecurrencePreview(
  startDate: string,
  pattern: LessonRecurrencePattern,
  endDate: string,
  options?: { editing?: boolean },
) {
  if (!startDate || pattern === 'none' || !endDate) return null

  const dates = generateRecurrenceDates(startDate, pattern, endDate)
  if (dates.length <= 1) return null

  const range = `${dates[0]} ~ ${dates[dates.length - 1]}`
  if (options?.editing) {
    const additional = dates.length - 1
    return `이 수업 수정 + ${additional}회 추가 · ${range}`
  }

  return `총 ${dates.length}회 · ${range}`
}
