import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/actions/auth'
import { connectGoogleCalendarFromOAuthCode } from '@/lib/google-calendar/connect'
import { verifyGoogleOAuthState } from '@/lib/google-calendar/oauth-state'
import {
  GOOGLE_CALENDAR_OAUTH_REDIRECT_URI_COOKIE,
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
  resolveGoogleCalendarOAuthRedirectUri,
} from '@/lib/google-calendar/oauth'

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const settingsUrl = `${origin}/dashboard/settings/google-calendar`
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')
  const cookieState = request.cookies.get(GOOGLE_CALENDAR_OAUTH_STATE_COOKIE)?.value
  const cookieRedirectUri = request.cookies.get(
    GOOGLE_CALENDAR_OAUTH_REDIRECT_URI_COOKIE,
  )?.value
  const redirectUri =
    cookieRedirectUri ?? resolveGoogleCalendarOAuthRedirectUri(origin)

  if (oauthError) {
    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent(oauthError)}`,
    )
  }

  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.redirect(`${settingsUrl}?error=admin-only`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${settingsUrl}?error=invalid-state`)
  }

  let stateValid = false
  try {
    stateValid = await verifyGoogleOAuthState(state)
  } catch (error) {
    console.warn(
      '[google-calendar] oauth state db verify failed, trying cookie:',
      error instanceof Error ? error.message : error,
    )
  }

  if (!stateValid && (!cookieState || cookieState !== state)) {
    return NextResponse.redirect(`${settingsUrl}?error=invalid-state`)
  }

  const result = await connectGoogleCalendarFromOAuthCode(code, redirectUri)
  if (result.error) {
    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent(result.error)}`,
    )
  }

  const createdQuery =
    result.createdCalendars && result.createdCalendars.length > 0
      ? `&created=${encodeURIComponent(result.createdCalendars.join(','))}`
      : ''

  const success = NextResponse.redirect(`${settingsUrl}?connected=1${createdQuery}`)
  success.cookies.delete(GOOGLE_CALENDAR_OAUTH_STATE_COOKIE)
  success.cookies.delete(GOOGLE_CALENDAR_OAUTH_REDIRECT_URI_COOKIE)
  return success
}
