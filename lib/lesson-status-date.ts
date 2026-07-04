import { toDateKey } from '@/lib/calendar-utils'

export const LESSON_STATUS_DATE_COOKIE = 'lesson_status_date'

/** 수업현황 메뉴 진입 — 항상 오늘 날짜 */
export function resolveLessonStatusEntryDate(): string {
  return toDateKey(new Date())
}

export function setLessonStatusDateCookie(date: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${LESSON_STATUS_DATE_COOKIE}=${encodeURIComponent(date)}; path=/; max-age=31536000; SameSite=Lax`
}

export function buildLessonStatusPath(date: string, view?: string | null) {
  const params = new URLSearchParams({ date })
  if (view && view !== 'day') params.set('view', view)
  return `/dashboard/lesson-status?${params.toString()}`
}

export function buildLessonStatusEntryPath(view?: string | null) {
  return buildLessonStatusPath(resolveLessonStatusEntryDate(), view)
}
