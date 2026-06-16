import type { GoogleCalendarEvent } from '@/lib/google-calendar/types'

const KST = 'Asia/Seoul'

export function parseGoogleEventDateTime(
  event: GoogleCalendarEvent,
): { lessonDate: string; startTime: string | null; endTime: string | null } | null {
  const start = event.start
  const end = event.end
  if (!start) return null

  if (start.date && !start.dateTime) {
    return {
      lessonDate: start.date,
      startTime: null,
      endTime: null,
    }
  }

  if (!start.dateTime) return null

  const startParts = formatInTimeZone(start.dateTime, KST)
  const endParts = end?.dateTime ? formatInTimeZone(end.dateTime, KST) : null

  return {
    lessonDate: startParts.date,
    startTime: startParts.time,
    endTime: endParts?.time ?? null,
  }
}

function formatInTimeZone(iso: string, timeZone: string): { date: string; time: string } {
  const date = new Date(iso)
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return {
    date: dateFormatter.format(date),
    time: timeFormatter.format(date),
  }
}

export function normalizeGoogleEventTitle(summary?: string | null): string {
  return summary?.trim() || '제목 없음'
}

export function isGoogleEventCancelled(event: GoogleCalendarEvent): boolean {
  return event.status === 'cancelled'
}

function addCalendarDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

/** KST 기준 해당 날짜 00:00을 RFC3339로 (Google timeMin/timeMax용) */
function toKstDayBoundaryIso(date: Date, endOfDay = false): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'
  const time = endOfDay ? 'T23:59:59' : 'T00:00:00'
  return `${year}-${month}-${day}${time}+09:00`
}

export function getGoogleSyncTimeBounds() {
  const now = new Date()
  return {
    timeMin: toKstDayBoundaryIso(addCalendarDays(now, -30)),
    timeMax: toKstDayBoundaryIso(addCalendarDays(now, 180), true),
  }
}

/** @deprecated 전체 동기화와 동일 범위 사용 */
export function getGoogleRecentSyncWindow() {
  return getGoogleSyncTimeBounds()
}

/** 최근 N일 이내 수정·생성된 일정 보강 조회용 */
export function getGoogleUpdatedSince(days: number): string {
  const since = addCalendarDays(new Date(), -days)
  return since.toISOString()
}
