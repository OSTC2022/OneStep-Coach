import 'server-only'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import {
  exchangeGoogleOAuthCode,
  fetchGoogleUserEmail,
} from '@/lib/google-calendar/client'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import { ensureLessonCalendars } from '@/lib/google-calendar/lesson-calendars'
import {
  ensureGoogleCalendarWatch,
  syncGoogleCalendarLessons,
  upsertGoogleCalendarSyncRow,
} from '@/lib/google-calendar/sync'

export async function connectGoogleCalendarFromOAuthCode(
  code: string,
  redirectUri?: string,
): Promise<{ error?: string; createdCalendars?: string[] }> {
  if (!isGoogleCalendarConfigured()) {
    return { error: 'Google Calendar 연동 환경 변수가 설정되지 않았습니다.' }
  }

  try {
    const token = await exchangeGoogleOAuthCode(code, redirectUri)
    if (!token.refresh_token) {
      return {
        error:
          'Google refresh token을 받지 못했습니다. Google 계정 연결을 해제한 뒤 다시 시도해 주세요.',
      }
    }

    const email = await fetchGoogleUserEmail(token.access_token)
    const { primary, secondary, created } = await ensureLessonCalendars(
      token.access_token,
      email,
    )

    await upsertGoogleCalendarSyncRow({
      connected_email: email,
      refresh_token: token.refresh_token,
      calendar_id: primary.id,
      calendar_name: primary.summary,
      calendar_id_2: secondary?.id ?? null,
      calendar_name_2: secondary?.summary ?? null,
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
      sync_status: null,
      sync_status_detail: null,
      last_sync_attempt_at: null,
    })

    await ensureGoogleCalendarWatch()

    after(async () => {
      try {
        await syncGoogleCalendarLessons({
          reason: 'connect',
          forceFull: true,
          skipDedupe: true,
        })
      } catch (error) {
        console.error(
          '[google-calendar] initial connect sync failed:',
          error instanceof Error ? error.message : error,
        )
      } finally {
        revalidatePath('/dashboard/settings/google-calendar')
        revalidatePath('/dashboard/calendar')
        revalidatePath('/dashboard/lesson-status')
        revalidatePath('/dashboard')
      }
    })

    revalidatePath('/dashboard/settings/google-calendar')
    revalidatePath('/dashboard/calendar')
    revalidatePath('/dashboard')

    return { createdCalendars: created.length > 0 ? created : undefined }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: message }
  }
}
