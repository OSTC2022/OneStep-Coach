import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/admin'
import { GOOGLE_CALENDAR_SYNC_ID } from '@/lib/google-calendar/config'

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

function isMissingOAuthStateColumn(error: { message?: string } | null) {
  if (!error) return false
  return (error.message ?? '').includes('oauth_state')
}

export async function saveGoogleOAuthState(state: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString()

  const { data: current } = await supabase
    .from('google_calendar_sync')
    .select('id')
    .eq('id', GOOGLE_CALENDAR_SYNC_ID)
    .maybeSingle()

  if (current) {
    const { error } = await supabase
      .from('google_calendar_sync')
      .update({
        oauth_state: state,
        oauth_state_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', GOOGLE_CALENDAR_SYNC_ID)

    if (error && !isMissingOAuthStateColumn(error)) {
      throw new Error(error.message)
    }
    return
  }

  const { error } = await supabase.from('google_calendar_sync').insert({
    id: GOOGLE_CALENDAR_SYNC_ID,
    oauth_state: state,
    oauth_state_expires_at: expiresAt,
    sync_enabled: false,
    pending_member_count: 0,
    updated_at: new Date().toISOString(),
  })

  if (error && !isMissingOAuthStateColumn(error)) {
    throw new Error(error.message)
  }
}

export async function verifyGoogleOAuthState(state: string): Promise<boolean> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('google_calendar_sync')
    .select('oauth_state, oauth_state_expires_at')
    .eq('id', GOOGLE_CALENDAR_SYNC_ID)
    .maybeSingle()

  if (error || !data) {
    if (isMissingOAuthStateColumn(error)) return false
    return false
  }

  const savedState = data.oauth_state as string | null
  const expiresAt = data.oauth_state_expires_at as string | null

  if (!savedState || savedState !== state) return false
  if (!expiresAt || Date.parse(expiresAt) < Date.now()) return false

  await supabase
    .from('google_calendar_sync')
    .update({
      oauth_state: null,
      oauth_state_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', GOOGLE_CALENDAR_SYNC_ID)

  return true
}
