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

export function getGoogleSyncTimeBounds() {
  const now = new Date()
  const timeMin = new Date(now)
  timeMin.setDate(timeMin.getDate() - 30)
  const timeMax = new Date(now)
  timeMax.setDate(timeMax.getDate() + 365)

  return {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  }
}
