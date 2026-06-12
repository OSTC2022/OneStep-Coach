import 'server-only'

import { revalidatePath } from 'next/cache'
import {
  exchangeGoogleOAuthCode,
  fetchGoogleUserEmail,
  listGoogleCalendars,
} from '@/lib/google-calendar/client'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import {
  ensureGoogleCalendarWatch,
  findLessonCalendars,
  syncGoogleCalendarLessons,
  upsertGoogleCalendarSyncRow,
} from '@/lib/google-calendar/sync'
import { GOOGLE_LESSON_CALENDAR_NAME } from '@/lib/google-calendar/config'

export async function connectGoogleCalendarFromOAuthCode(
  code: string,
): Promise<{ error?: string }> {
  if (!isGoogleCalendarConfigured()) {
    return { error: 'Google Calendar 연동 환경 변수가 설정되지 않았습니다.' }
  }

  try {
    const token = await exchangeGoogleOAuthCode(code)
    if (!token.refresh_token) {
      return {
        error:
          'Google refresh token을 받지 못했습니다. Google 계정 연결을 해제한 뒤 다시 시도해 주세요.',
      }
    }

    const email = await fetchGoogleUserEmail(token.access_token)
    const calendars = await listGoogleCalendars(token.access_token)
    const lessonCalendars = findLessonCalendars(calendars)
    const primaryCalendar = lessonCalendars.find(
      (calendar) => calendar.summary === GOOGLE_LESSON_CALENDAR_NAME,
    )
    const secondaryCalendar = lessonCalendars.find(
      (calendar) => calendar.summary !== GOOGLE_LESSON_CALENDAR_NAME,
    )

    if (!primaryCalendar) {
      return {
        error:
          'Google 캘린더에서 "수업" 이름의 캘린더를 찾지 못했습니다. Google Calendar에 "수업" 캘린더를 만든 뒤 다시 연결해 주세요.',
      }
    }

    await upsertGoogleCalendarSyncRow({
      connected_email: email,
      refresh_token: token.refresh_token,
      calendar_id: primaryCalendar.id,
      calendar_name: primaryCalendar.summary,
      calendar_id_2: secondaryCalendar?.id ?? null,
      calendar_name_2: secondaryCalendar?.summary ?? null,
      sync_enabled: true,
      sync_token: null,
      sync_token_2: null,
      watch_channel_id: null,
      watch_resource_id: null,
      watch_expiration: null,
      watch_channel_id_2: null,
      watch_resource_id_2: null,
      watch_expiration_2: null,
      last_sync_error: null,
    })

    await ensureGoogleCalendarWatch()
    // 초기 연결 UI는 빠르게 — 동기화는 사용자가 「지금 동기화」로 실행

    revalidatePath('/dashboard/settings/google-calendar')
    revalidatePath('/dashboard/calendar')
    revalidatePath('/dashboard')

    return {}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: message }
  }
}
