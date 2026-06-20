import 'server-only'

import { getSiteUrl } from '@/lib/site-url'

export const GOOGLE_CALENDAR_SYNC_ID = 'default'
export const GOOGLE_LESSON_ID_PROPERTY = 'onestepLessonId'
export const GOOGLE_LESSON_CALENDAR_NAME = '수업'
export const GOOGLE_LESSON_CALENDAR_NAME_ALT = '수업1'
export const GOOGLE_LESSON_CALENDAR_NAME_2 = '수업2'
export const GOOGLE_LESSON_CALENDAR_NAMES = [
  GOOGLE_LESSON_CALENDAR_NAME,
  GOOGLE_LESSON_CALENDAR_NAME_ALT,
  GOOGLE_LESSON_CALENDAR_NAME_2,
] as const

export function normalizeCalendarSummary(name?: string | null): string {
  if (!name) return ''
  return name
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
}

export function isPrimaryLessonCalendarName(name?: string | null): boolean {
  const trimmed = normalizeCalendarSummary(name)
  return trimmed === GOOGLE_LESSON_CALENDAR_NAME || trimmed === GOOGLE_LESSON_CALENDAR_NAME_ALT
}

export function isSecondaryLessonCalendarName(name?: string | null): boolean {
  return normalizeCalendarSummary(name) === GOOGLE_LESSON_CALENDAR_NAME_2
}

/** Google 캘린더 이름 → 기본 담당 강사 (캘린더 블록 색상은 강사 calendar_color 사용) */
export const GOOGLE_CALENDAR_INSTRUCTOR_BY_CALENDAR_NAME: Record<string, string> = {
  [GOOGLE_LESSON_CALENDAR_NAME]: '이교직',
  [GOOGLE_LESSON_CALENDAR_NAME_ALT]: '이교직',
  [GOOGLE_LESSON_CALENDAR_NAME_2]: '장지용',
}

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.file',
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
