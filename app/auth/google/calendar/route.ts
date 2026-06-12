import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/actions/auth'
import {
  buildGoogleCalendarOAuthUrl,
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
} from '@/lib/google-calendar/oauth'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import { getSiteUrl } from '@/lib/site-url'

export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.redirect(
      new URL('/dashboard/settings/google-calendar?error=admin-only', getSiteUrl()),
    )
  }

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.redirect(
      new URL('/dashboard/settings/google-calendar?error=not-configured', getSiteUrl()),
    )
  }

  const state = randomBytes(24).toString('hex')
  const response = NextResponse.redirect(buildGoogleCalendarOAuthUrl(state))
  response.cookies.set(GOOGLE_CALENDAR_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  })

  return response
}
