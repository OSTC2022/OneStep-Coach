import 'server-only'

import {
  getGoogleOAuthClientId,
  getGoogleOAuthClientSecret,
  getGoogleOAuthRedirectUri,
} from '@/lib/google-calendar/config'
import type {
  GoogleCalendarEvent,
  GoogleCalendarListEntry,
} from '@/lib/google-calendar/types'

type GoogleTokenResponse = {
  access_token: string
  expires_in: number
  token_type: string
  scope?: string
  refresh_token?: string
}

type GoogleEventsListResponse = {
  items?: GoogleCalendarEvent[]
  nextSyncToken?: string
  nextPageToken?: string
}

export async function exchangeGoogleOAuthCode(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: getGoogleOAuthClientId(),
    client_secret: getGoogleOAuthClientSecret(),
    redirect_uri: getGoogleOAuthRedirectUri(),
    grant_type: 'authorization_code',
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google OAuth 토큰 교환 실패: ${text}`)
  }

  return response.json() as Promise<GoogleTokenResponse>
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: getGoogleOAuthClientId(),
    client_secret: getGoogleOAuthClientSecret(),
    grant_type: 'refresh_token',
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google 액세스 토큰 갱신 실패: ${text}`)
  }

  return response.json() as Promise<GoogleTokenResponse>
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) return null
  const data = (await response.json()) as { email?: string }
  return data.email ?? null
}

async function googleFetch<T>(
  accessToken: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Calendar API 오류 (${response.status}): ${text}`)
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json() as Promise<T>
}

export async function listGoogleCalendars(
  accessToken: string,
): Promise<GoogleCalendarListEntry[]> {
  const data = await googleFetch<{ items?: GoogleCalendarListEntry[] }>(
    accessToken,
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader',
  )
  return data.items ?? []
}

export async function listGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  options: {
    syncToken?: string | null
    pageToken?: string | null
    timeMin?: string
    timeMax?: string
    updatedMin?: string
    orderBy?: 'startTime' | 'updated'
    singleEvents?: boolean
  },
): Promise<GoogleEventsListResponse> {
  const params = new URLSearchParams({
    singleEvents: options.singleEvents === false ? 'false' : 'true',
    showDeleted: 'true',
    maxResults: '250',
  })

  if (options.syncToken) {
    params.set('syncToken', options.syncToken)
  } else {
    if (options.timeMin) params.set('timeMin', options.timeMin)
    if (options.timeMax) params.set('timeMax', options.timeMax)
    if (options.updatedMin) params.set('updatedMin', options.updatedMin)
    if (options.orderBy) {
      params.set('orderBy', options.orderBy)
      if (options.orderBy === 'startTime') {
        params.set('sortOrder', 'ascending')
      }
    }
  }

  if (options.pageToken) {
    params.set('pageToken', options.pageToken)
  }

  const encodedCalendarId = encodeURIComponent(calendarId)
  return googleFetch<GoogleEventsListResponse>(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events?${params}`,
  )
}

export async function watchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  channel: { id: string; address: string; token: string; expiration: number },
): Promise<{ resourceId?: string; expiration?: string }> {
  const encodedCalendarId = encodeURIComponent(calendarId)
  return googleFetch(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events/watch`,
    {
      method: 'POST',
      body: JSON.stringify({
        id: channel.id,
        type: 'web_hook',
        address: channel.address,
        token: channel.token,
        expiration: channel.expiration,
      }),
    },
  )
}

export async function stopGoogleCalendarWatch(
  accessToken: string,
  channelId: string,
  resourceId: string,
): Promise<void> {
  await googleFetch(accessToken, 'https://www.googleapis.com/calendar/v3/channels/stop', {
    method: 'POST',
    body: JSON.stringify({ id: channelId, resourceId }),
  })
}

export async function withGoogleAccessToken<T>(
  refreshToken: string,
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const token = await refreshGoogleAccessToken(refreshToken)
  return fn(token.access_token)
}
