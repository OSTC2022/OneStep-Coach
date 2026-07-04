import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/admin'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import { pushLessonsToGoogle } from '@/lib/google-calendar/push'
import { getGoogleCalendarSyncRow } from '@/lib/google-calendar/sync'

function isMissingSyncColumn(error: { message?: string } | null): boolean {
  if (!error?.message) return false
  const msg = error.message
  return (
    msg.includes('sync_origin') ||
    msg.includes('app_modified_at') ||
    msg.includes('google_event_id')
  )
}

/** DB에 저장됐지만 Google에 아직 연결되지 않은 앱 수업 재푸시 */
export async function pushPendingGoogleLessons(limit = 40): Promise<number> {
  if (!isGoogleCalendarConfigured()) return 0

  const row = await getGoogleCalendarSyncRow()
  if (!row?.sync_enabled || !row.refresh_token || !row.calendar_id) return 0

  const supabase = createServiceRoleClient()

  let query = supabase
    .from('lessons')
    .select('id')
    .is('google_event_id', null)
    .eq('session_deducted', false)
    .neq('event_type', 'materialized')
    .neq('attendance_status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(limit)

  const withOrigin = await query.eq('sync_origin', 'app')

  let rows = withOrigin.data
  if (withOrigin.error && isMissingSyncColumn(withOrigin.error)) {
    const fallback = await supabase
      .from('lessons')
      .select('id')
      .is('google_event_id', null)
      .eq('session_deducted', false)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (fallback.error || !fallback.data?.length) return 0
    rows = fallback.data
  } else if (withOrigin.error || !rows?.length) {
    return 0
  }

  const ids = rows.map((row) => row.id).filter(Boolean)
  if (!ids.length) return 0

  await pushLessonsToGoogle(ids)
  return ids.length
}
