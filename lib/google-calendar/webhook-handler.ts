import 'server-only'

import { revalidatePath } from 'next/cache'
import {
  ensureGoogleCalendarWatch,
  syncGoogleCalendarLessons,
} from '@/lib/google-calendar/sync'

export async function handleGoogleCalendarWebhookSync(): Promise<void> {
  await ensureGoogleCalendarWatch()
  await syncGoogleCalendarLessons({ reason: 'webhook', skipDedupe: true })
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard')
}
