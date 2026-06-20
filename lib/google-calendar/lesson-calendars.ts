import 'server-only'

import {
  createGoogleCalendar,
  listGoogleCalendars,
} from '@/lib/google-calendar/client'
import {
  GOOGLE_LESSON_CALENDAR_NAME,
  GOOGLE_LESSON_CALENDAR_NAME_2,
  isPrimaryLessonCalendarName,
  isSecondaryLessonCalendarName,
  normalizeCalendarSummary,
} from '@/lib/google-calendar/config'
import type { GoogleCalendarListEntry } from '@/lib/google-calendar/types'

export type ResolvedLessonCalendars = {
  primary: { id: string; summary: string }
  secondary: { id: string; summary: string } | null
  created: string[]
}

function pickPrimary(
  calendars: GoogleCalendarListEntry[],
): { id: string; summary: string } | null {
  const match = calendars.find((calendar) =>
    isPrimaryLessonCalendarName(calendar.summary),
  )
  if (!match?.id) return null
  return {
    id: match.id,
    summary:
      normalizeCalendarSummary(match.summary) || GOOGLE_LESSON_CALENDAR_NAME,
  }
}

function pickSecondary(
  calendars: GoogleCalendarListEntry[],
): { id: string; summary: string } | null {
  const match = calendars.find((calendar) =>
    isSecondaryLessonCalendarName(calendar.summary),
  )
  if (!match?.id) return null
  return {
    id: match.id,
    summary:
      normalizeCalendarSummary(match.summary) || GOOGLE_LESSON_CALENDAR_NAME_2,
  }
}

function formatDiscoveredCalendarNames(
  calendars: GoogleCalendarListEntry[],
): string {
  const names = calendars
    .map((calendar) => normalizeCalendarSummary(calendar.summary))
    .filter(Boolean)
    .slice(0, 10)
  return names.length > 0 ? names.map((name) => `「${name}」`).join(', ') : '없음'
}

export async function ensureLessonCalendars(
  accessToken: string,
  connectedEmail: string | null,
): Promise<ResolvedLessonCalendars> {
  let calendars = await listGoogleCalendars(accessToken)
  const created: string[] = []

  let primary = pickPrimary(calendars)
  let secondary = pickSecondary(calendars)

  if (!primary) {
    try {
      const createdCalendar = await createGoogleCalendar(
        accessToken,
        GOOGLE_LESSON_CALENDAR_NAME,
      )
      if (!createdCalendar.id) {
        throw new Error('Google 캘린더 생성 ID를 받지 못했습니다.')
      }
      created.push(GOOGLE_LESSON_CALENDAR_NAME)
      calendars = [
        ...calendars,
        {
          ...createdCalendar,
          summary: GOOGLE_LESSON_CALENDAR_NAME,
        },
      ]
      primary = {
        id: createdCalendar.id,
        summary: GOOGLE_LESSON_CALENDAR_NAME,
      }
    } catch (error) {
      const accountLabel = connectedEmail ? ` (${connectedEmail})` : ''
      const discovered = formatDiscoveredCalendarNames(calendars)
      const detail =
        error instanceof Error ? error.message : '알 수 없는 오류'
      throw new Error(
        `Google 계정${accountLabel}에서 「수업」 캘린더를 찾지 못했고 자동 생성도 실패했습니다. Google Calendar 앱에서 이름을 정확히 「수업」으로 만든 뒤 다시 연결해 주세요. (발견된 캘린더: ${discovered}) (${detail})`,
      )
    }
  }

  if (!secondary) {
    secondary = pickSecondary(calendars)
  }

  if (!secondary) {
    try {
      const createdCalendar = await createGoogleCalendar(
        accessToken,
        GOOGLE_LESSON_CALENDAR_NAME_2,
      )
      if (createdCalendar.id) {
        created.push(GOOGLE_LESSON_CALENDAR_NAME_2)
        secondary = {
          id: createdCalendar.id,
          summary: GOOGLE_LESSON_CALENDAR_NAME_2,
        }
      }
    } catch (error) {
      console.warn(
        '[google-calendar] optional calendar create failed:',
        error instanceof Error ? error.message : error,
      )
    }
  }

  return { primary, secondary, created }
}
