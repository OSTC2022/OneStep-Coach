import { differenceInCalendarDays, format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'

export type MarathonEventSignup = {
  member_id: string
  member_name: string
  signed_at: string
}

export type MarathonEventInput = {
  id?: string | null
  title: string
  event_date: string
  location_label: string
  registration_url: string
  notes: string
  is_hidden: boolean
}

export type MarathonEventView = {
  id: string
  title: string
  event_date: string
  event_date_label: string
  weekday_label: string
  day_label: string
  days_until: number
  location_label: string
  registration_url: string | null
  registration_href: string | null
  notes: string
  is_hidden: boolean
  signup_count: number
  signups: MarathonEventSignup[]
  is_signed_up: boolean
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

export function normalizeMarathonDate(value: string | null | undefined): string | null {
  const raw = value?.trim().slice(0, 10)
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  return raw
}

export const MARATHON_SCHEDULE_ALL_KEY = 'all'

export function normalizeMarathonMonthKey(
  value: string | null | undefined,
  fallback = format(new Date(), 'yyyy-MM'),
): string {
  const trimmed = value?.trim() ?? ''
  if (trimmed === MARATHON_SCHEDULE_ALL_KEY) return MARATHON_SCHEDULE_ALL_KEY
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) return trimmed
  return fallback
}

export function isMarathonScheduleAllKey(value: string | null | undefined): boolean {
  return value?.trim() === MARATHON_SCHEDULE_ALL_KEY
}

export function marathonMonthDateRange(monthKey: string): { start: string; end: string } {
  const reference = parseISO(`${monthKey}-01`)
  return {
    start: format(startOfMonth(reference), 'yyyy-MM-dd'),
    end: format(endOfMonth(reference), 'yyyy-MM-dd'),
  }
}

export function formatMarathonMonthLabel(monthKey: string): string {
  if (isMarathonScheduleAllKey(monthKey)) return '전체'
  try {
    return format(parseISO(`${monthKey}-01`), 'yyyy년 M월', { locale: ko })
  } catch {
    return monthKey
  }
}

export function formatMarathonEventDateLabel(eventDate: string): string {
  const raw = normalizeMarathonDate(eventDate)
  if (!raw) return eventDate
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return eventDate
  return `${match[2]}/${match[3]}`
}

export function marathonWeekdayLabel(eventDate: string): string {
  const raw = normalizeMarathonDate(eventDate)
  if (!raw) return ''
  try {
    return WEEKDAY_LABELS[parseISO(raw).getDay()] ?? ''
  } catch {
    return ''
  }
}

/** D-Day / D-3 / D+2 — 오늘 기준 달력일 차이 */
export function formatMarathonDayLabel(
  eventDate: string,
  today = new Date(),
): { day_label: string; days_until: number } {
  const raw = normalizeMarathonDate(eventDate)
  if (!raw) return { day_label: '—', days_until: 0 }
  try {
    const daysUntil = differenceInCalendarDays(parseISO(raw), today)
    if (daysUntil === 0) return { day_label: 'D-Day', days_until: 0 }
    if (daysUntil > 0) return { day_label: `D-${daysUntil}`, days_until: daysUntil }
    return { day_label: `D+${Math.abs(daysUntil)}`, days_until: daysUntil }
  } catch {
    return { day_label: '—', days_until: 0 }
  }
}

export function resolveMarathonRegistrationHref(
  registrationUrl: string | null | undefined,
): string | null {
  const trimmed = registrationUrl?.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function isVisibleMarathonEvent(event: Pick<MarathonEventView, 'is_hidden' | 'title'>): boolean {
  return !event.is_hidden && Boolean(event.title.trim())
}

export function createEmptyMarathonEventInput(
  eventDate = format(new Date(), 'yyyy-MM-dd'),
): MarathonEventInput {
  return {
    id: null,
    title: '',
    event_date: eventDate,
    location_label: '',
    registration_url: '',
    notes: '',
    is_hidden: false,
  }
}

export function listNearbyMarathonMonthKeys(reference = new Date(), past = 2, future = 6): string[] {
  const keys: string[] = []
  for (let offset = -past; offset <= future; offset += 1) {
    const date = new Date(reference.getFullYear(), reference.getMonth() + offset, 1)
    keys.push(format(date, 'yyyy-MM'))
  }
  return keys
}
