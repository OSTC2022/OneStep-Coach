export const LESSON_STATUS_DATE_COOKIE = 'lesson_status_date'

export function setLessonStatusDateCookie(date: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${LESSON_STATUS_DATE_COOKIE}=${encodeURIComponent(date)}; path=/; max-age=31536000; SameSite=Lax`
}

export function buildLessonStatusPath(date: string, view?: string | null) {
  const params = new URLSearchParams({ date })
  if (view && view !== 'day') params.set('view', view)
  return `/dashboard/lesson-status?${params.toString()}`
}
