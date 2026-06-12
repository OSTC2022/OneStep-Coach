import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/actions/auth'
import { connectGoogleCalendarFromOAuthCode } from '@/lib/google-calendar/connect'
import { verifyGoogleOAuthState } from '@/lib/google-calendar/oauth-state'
import { GOOGLE_CALENDAR_OAUTH_STATE_COOKIE } from '@/lib/google-calendar/oauth'

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const settingsUrl = `${origin}/dashboard/settings/google-calendar`
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')
  const cookieState = request.cookies.get(GOOGLE_CALENDAR_OAUTH_STATE_COOKIE)?.value

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

  const stateValid =
    (await verifyGoogleOAuthState(state)) ||
    Boolean(cookieState && cookieState === state)

  if (!stateValid) {
    return NextResponse.redirect(`${settingsUrl}?error=invalid-state`)
  }

  const result = await connectGoogleCalendarFromOAuthCode(code)
  if (result.error) {
    return NextResponse.redirect(
      `${settingsUrl}?error=${encodeURIComponent(result.error)}`,
    )
  }

  const success = NextResponse.redirect(`${settingsUrl}?connected=1`)
  success.cookies.delete(GOOGLE_CALENDAR_OAUTH_STATE_COOKIE)
  return success
}
