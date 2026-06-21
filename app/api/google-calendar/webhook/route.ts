import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { handleGoogleCalendarWebhookSync } from '@/lib/google-calendar/webhook-handler'
import { getGoogleCalendarWebhookSecret } from '@/lib/google-calendar/config'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  const channelToken = request.headers.get('x-goog-channel-token')
  const resourceState = request.headers.get('x-goog-resource-state')

  try {
    const expectedToken = getGoogleCalendarWebhookSecret()
    if (channelToken !== expectedToken) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
  } catch {
    return new NextResponse('Not configured', { status: 503 })
  }

  if (resourceState === 'sync') {
    return new NextResponse(null, { status: 200 })
  }

  after(async () => {
    try {
      await handleGoogleCalendarWebhookSync()
    } catch (error) {
      console.error('[google-calendar] webhook sync failed', error)
    }
  })

  return new NextResponse(null, { status: 200 })
}
