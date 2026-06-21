import 'server-only'

import { GOOGLE_CALENDAR_SYNC_ID } from '@/lib/google-calendar/config'
import { getSupabaseAdmin } from '@/lib/member-backup/supabase-admin'

export async function getGoogleBackupAuthRow(): Promise<{
  refresh_token: string | null
  connected_email: string | null
} | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('google_calendar_sync')
    .select('refresh_token, connected_email')
    .eq('id', GOOGLE_CALENDAR_SYNC_ID)
    .maybeSingle()

  if (error) {
    if (
      error.message.includes('google_calendar_sync') ||
      error.code === '42P01'
    ) {
      return null
    }
    throw new Error(error.message)
  }

  return data
}
