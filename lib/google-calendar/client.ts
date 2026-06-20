import 'server-only'

import {
  getGoogleOAuthClientId,
  getGoogleOAuthClientSecret,
  getGoogleOAuthRedirectUri,
  GOOGLE_LESSON_ID_PROPERTY,
} from '@/lib/google-calendar/config'
import { GoogleCalendarApiError } from '@/lib/google-calendar/errors'
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

export type GoogleEventsListResponse = {
  items?: GoogleCalendarEvent[]
  nextSyncToken?: string
  nextPageToken?: string
}

export type GoogleEventsFullListQuery = {
  mode: 'full'
  timeMin: string
  timeMax: string
  pageToken?: string | null
}

export type GoogleEventsIncrementalListQuery = {
  mode: 'incremental'
  syncToken: string
  pageToken?: string | null
}

export type GoogleEventsListQuery =
  | GoogleEventsFullListQuery
  | GoogleEventsIncrementalListQuery

export async function exchangeGoogleOAuthCode(
  code: string,
  redirectUri?: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: getGoogleOAuthClientId(),
    client_secret: getGoogleOAuthClientSecret(),
    redirect_uri: redirectUri ?? getGoogleOAuthRedirectUri(),
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
    throw new GoogleCalendarApiError(response.status, text)
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

export async function createGoogleCalendar(
  accessToken: string,
  summary: string,
  timeZone = 'Asia/Seoul',
): Promise<GoogleCalendarListEntry> {
  return googleFetch<GoogleCalendarListEntry>(
    accessToken,
    'https://www.googleapis.com/calendar/v3/calendars',
    {
      method: 'POST',
      body: JSON.stringify({ summary, timeZone }),
    },
  )
}

/**
 * Google Calendar events.list
 * - 증분(syncToken): syncToken + showDeleted + maxResults (+ pageToken) 만 사용
 * - 전체: timeMin/timeMax + singleEvents=true + orderBy=startTime (+ pageToken)
 */
export async function listGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  query: GoogleEventsListQuery,
): Promise<GoogleEventsListResponse> {
  const params = new URLSearchParams({
    maxResults: '2500',
  })

  if (query.mode === 'incremental') {
    params.set('syncToken', query.syncToken)
    params.set('showDeleted', 'true')
    if (query.pageToken) {
      params.set('pageToken', query.pageToken)
    }
  } else {
    params.set('timeMin', query.timeMin)
    params.set('timeMax', query.timeMax)
    params.set('singleEvents', 'true')
    params.set('orderBy', 'startTime')
    params.set('sortOrder', 'ascending')
    params.set('showDeleted', 'false')
    if (query.pageToken) {
      params.set('pageToken', query.pageToken)
    }
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

export async function getGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<GoogleCalendarEvent> {
  const encodedCalendarId = encodeURIComponent(calendarId)
  const encodedEventId = encodeURIComponent(eventId)
  return googleFetch<GoogleCalendarEvent>(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events/${encodedEventId}`,
  )
}

export async function findGoogleEventsByLessonId(
  accessToken: string,
  calendarId: string,
  lessonId: string,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    privateExtendedProperty: `${GOOGLE_LESSON_ID_PROPERTY}=${lessonId}`,
    maxResults: '10',
  })
  const encodedCalendarId = encodeURIComponent(calendarId)
  const data = await googleFetch<GoogleEventsListResponse>(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events?${params}`,
  )
  return data.items ?? []
}

export async function insertGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  body: Record<string, unknown>,
): Promise<GoogleCalendarEvent> {
  const encodedCalendarId = encodeURIComponent(calendarId)
  return googleFetch<GoogleCalendarEvent>(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
}

export async function updateGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  body: Record<string, unknown>,
): Promise<GoogleCalendarEvent> {
  const encodedCalendarId = encodeURIComponent(calendarId)
  const encodedEventId = encodeURIComponent(eventId)
  return googleFetch<GoogleCalendarEvent>(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events/${encodedEventId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  )
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const encodedCalendarId = encodeURIComponent(calendarId)
  const encodedEventId = encodeURIComponent(eventId)
  await googleFetch(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events/${encodedEventId}`,
    { method: 'DELETE' },
  )
}

export async function moveGoogleCalendarEvent(
  accessToken: string,
  sourceCalendarId: string,
  eventId: string,
  destinationCalendarId: string,
): Promise<GoogleCalendarEvent> {
  const encodedSource = encodeURIComponent(sourceCalendarId)
  const encodedEventId = encodeURIComponent(eventId)
  const encodedDestination = encodeURIComponent(destinationCalendarId)
  return googleFetch<GoogleCalendarEvent>(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodedSource}/events/${encodedEventId}/move?destination=${encodedDestination}`,
    { method: 'POST' },
  )
}

let cachedAccessToken: {
  refreshToken: string
  accessToken: string
  expiresAt: number
} | null = null

export async function withGoogleAccessToken<T>(
  refreshToken: string,
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const now = Date.now()
  if (
    cachedAccessToken &&
    cachedAccessToken.refreshToken === refreshToken &&
    cachedAccessToken.expiresAt > now + 30_000
  ) {
    return fn(cachedAccessToken.accessToken)
  }

  const token = await refreshGoogleAccessToken(refreshToken)
  cachedAccessToken = {
    refreshToken,
    accessToken: token.access_token,
    expiresAt: now + Math.max((token.expires_in - 60) * 1000, 60_000),
  }
  return fn(token.access_token)
}
