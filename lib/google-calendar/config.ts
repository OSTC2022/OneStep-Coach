import 'server-only'

import { getSiteUrl } from '@/lib/site-url'

export const GOOGLE_CALENDAR_SYNC_ID = 'default'
export const GOOGLE_LESSON_CALENDAR_NAME = '수업'
export const GOOGLE_LESSON_CALENDAR_NAME_2 = '수업2'
export const GOOGLE_LESSON_CALENDAR_NAMES = [
  GOOGLE_LESSON_CALENDAR_NAME,
  GOOGLE_LESSON_CALENDAR_NAME_2,
] as const

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export function getGoogleOAuthClientId(): string {
  const value = process.env.GOOGLE_CLIENT_ID?.trim()
  if (!value) {
    throw new Error('GOOGLE_CLIENT_ID 환경 변수가 설정되지 않았습니다.')
  }
  return value
}

export function getGoogleOAuthClientSecret(): string {
  const value = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!value) {
    throw new Error('GOOGLE_CLIENT_SECRET 환경 변수가 설정되지 않았습니다.')
  }
  return value
}

export function getGoogleCalendarWebhookSecret(): string {
  const value = process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET?.trim()
  if (!value) {
    throw new Error('GOOGLE_CALENDAR_WEBHOOK_SECRET 환경 변수가 설정되지 않았습니다.')
  }
  return value
}

export function getGoogleOAuthRedirectUri(): string {
  return `${getSiteUrl()}/auth/google/calendar/callback`
}

export function getGoogleCalendarWebhookUrl(): string {
  return `${getSiteUrl()}/api/google-calendar/webhook`
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET?.trim(),
  )
}
