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
  findLessonCalendarId,
  syncGoogleCalendarLessons,
  upsertGoogleCalendarSyncRow,
} from '@/lib/google-calendar/sync'

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
    const lessonCalendar = findLessonCalendarId(calendars)

    if (!lessonCalendar) {
      return {
        error:
          'Google 캘린더에서 "수업" 이름의 캘린더를 찾지 못했습니다. Google Calendar에 "수업" 캘린더를 만든 뒤 다시 연결해 주세요.',
      }
    }

    await upsertGoogleCalendarSyncRow({
      connected_email: email,
      refresh_token: token.refresh_token,
      calendar_id: lessonCalendar.id,
      calendar_name: lessonCalendar.summary,
      sync_enabled: true,
      sync_token: null,
      watch_channel_id: null,
      watch_resource_id: null,
      watch_expiration: null,
      last_sync_error: null,
    })

    await ensureGoogleCalendarWatch()
    await syncGoogleCalendarLessons({ reason: 'initial-connect' })

    revalidatePath('/dashboard/settings/google-calendar')
    revalidatePath('/dashboard/calendar')
    revalidatePath('/dashboard')

    return {}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: message }
  }
}
