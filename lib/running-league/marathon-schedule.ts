import { differenceInCalendarDays, format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'

export type MarathonEventSignup = {
  member_id: string
  member_name: string
  signed_at: string
}

export type MarathonLabelTone =
  | 'amber'
  | 'sky'
  | 'lime'
  | 'rose'
  | 'violet'
  | 'zinc'

export type MarathonCustomLabel = {
  text: string
  tone: MarathonLabelTone
}

export const MARATHON_LABEL_TONES: MarathonLabelTone[] = [
  'amber',
  'sky',
  'lime',
  'rose',
  'violet',
  'zinc',
]

export type MarathonEventInput = {
  id?: string | null
  title: string
  event_date: string
  location_label: string
  registration_url: string
  notes: string
  is_hidden: boolean
  region: string
  is_featured: boolean
  registration_open: boolean
  /** 신청 마감일 (없으면 대회일 기준으로 자동 종료) */
  registration_end_date: string
  custom_labels: MarathonCustomLabel[]
  catalog_key?: string | null
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
  region: string
  is_featured: boolean
  registration_open: boolean
  registration_end_date: string | null
  /** 신청기간 반영된 표시용 */
  registration_open_active: boolean
  custom_labels: MarathonCustomLabel[]
  catalog_key: string | null
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

/** 신청가능 라벨 — 마감일(또는 대회일)이 지나면 false */
export function isMarathonRegistrationOpenActive(options: {
  registration_open?: boolean | null
  event_date?: string | null
  registration_end_date?: string | null
  today?: Date | string
}): boolean {
  if (!options.registration_open) return false
  const todayRaw =
    typeof options.today === 'string'
      ? options.today
      : format(options.today ?? new Date(), 'yyyy-MM-dd')
  const today = normalizeMarathonDate(todayRaw) ?? todayRaw.slice(0, 10)
  const end =
    normalizeMarathonDate(options.registration_end_date) ??
    normalizeMarathonDate(options.event_date)
  if (!end) return Boolean(options.registration_open)
  return today <= end
}

export function normalizeMarathonCustomLabels(
  value: unknown,
): MarathonCustomLabel[] {
  if (!Array.isArray(value)) return []
  const tones = new Set<string>(MARATHON_LABEL_TONES)
  const out: MarathonCustomLabel[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const text = String((item as { text?: unknown }).text ?? '').trim()
    if (!text) continue
    const toneRaw = String((item as { tone?: unknown }).tone ?? 'zinc')
    const tone = (tones.has(toneRaw) ? toneRaw : 'zinc') as MarathonLabelTone
    out.push({ text: text.slice(0, 20), tone })
    if (out.length >= 8) break
  }
  return out
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
    region: '',
    is_featured: false,
    registration_open: false,
    registration_end_date: '',
    custom_labels: [],
    catalog_key: null,
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
