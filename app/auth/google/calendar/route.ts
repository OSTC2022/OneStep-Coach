import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/actions/auth'
import { buildGoogleCalendarOAuthUrl } from '@/lib/google-calendar/oauth'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import { saveGoogleOAuthState } from '@/lib/google-calendar/oauth-state'
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
  await saveGoogleOAuthState(state)

  return NextResponse.redirect(buildGoogleCalendarOAuthUrl(state))
}
