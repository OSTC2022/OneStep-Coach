import {
  getGoogleOAuthClientId,
  getGoogleOAuthRedirectUri,
  GOOGLE_OAUTH_SCOPES,
} from '@/lib/google-calendar/config'

export function buildGoogleCalendarOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getGoogleOAuthClientId(),
    redirect_uri: getGoogleOAuthRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export const GOOGLE_CALENDAR_OAUTH_STATE_COOKIE = 'google_calendar_oauth_state'
