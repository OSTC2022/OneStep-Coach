import {
  getGoogleOAuthClientId,
  getGoogleOAuthRedirectUri,
  GOOGLE_OAUTH_SCOPES,
} from '@/lib/google-calendar/config'

export const GOOGLE_CALENDAR_OAUTH_STATE_COOKIE = 'google_calendar_oauth_state'
export const GOOGLE_CALENDAR_OAUTH_REDIRECT_URI_COOKIE =
  'google_calendar_oauth_redirect_uri'

export function resolveGoogleCalendarOAuthRedirectUri(origin?: string): string {
  const base = origin?.replace(/\/$/, '') || getGoogleOAuthRedirectUri().replace(
    /\/auth\/google\/calendar\/callback$/,
    '',
  )
  return `${base}/auth/google/calendar/callback`
}

export function buildGoogleCalendarOAuthUrl(
  state: string,
  redirectUri?: string,
): string {
  const resolvedRedirectUri =
    redirectUri ?? getGoogleOAuthRedirectUri()

  const params = new URLSearchParams({
    client_id: getGoogleOAuthClientId(),
    redirect_uri: resolvedRedirectUri,
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}
