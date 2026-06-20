import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/actions/auth'
import {
  buildGoogleCalendarOAuthUrl,
  GOOGLE_CALENDAR_OAUTH_REDIRECT_URI_COOKIE,
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
  resolveGoogleCalendarOAuthRedirectUri,
} from '@/lib/google-calendar/oauth'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import { saveGoogleOAuthState } from '@/lib/google-calendar/oauth-state'

function oauthCookieOptions(origin: string) {
  return {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax' as const,
    maxAge: 10 * 60,
    path: '/',
  }
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const settingsUrl = `${origin}/dashboard/settings/google-calendar`

  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?error=admin-only`, origin),
    )
  }

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?error=not-configured`, origin),
    )
  }

  const state = randomBytes(24).toString('hex')
  const redirectUri = resolveGoogleCalendarOAuthRedirectUri(origin)

  try {
    await saveGoogleOAuthState(state)
  } catch (error) {
    console.warn(
      '[google-calendar] oauth state db save failed, using cookie fallback:',
      error instanceof Error ? error.message : error,
    )
  }

  const response = NextResponse.redirect(
    buildGoogleCalendarOAuthUrl(state, redirectUri),
  )
  const cookieOptions = oauthCookieOptions(origin)
  response.cookies.set(GOOGLE_CALENDAR_OAUTH_STATE_COOKIE, state, cookieOptions)
  response.cookies.set(
    GOOGLE_CALENDAR_OAUTH_REDIRECT_URI_COOKIE,
    redirectUri,
    cookieOptions,
  )

  return response
}
