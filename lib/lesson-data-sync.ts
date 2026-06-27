import { revalidatePath } from 'next/cache'

/** 캘린더·수업현황·출석이 같은 Supabase 원본을 다시 읽도록 경로 무효화 */
export function revalidateLessonViews() {
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/lesson-status')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard')
}

export function logLessonViewFetch(
  view: 'calendar' | 'lesson-status' | 'attendance',
  options: {
    dateFrom: string
    dateTo: string
    count: number
    sample?: Array<{ id: string; instructor_id: string | null; google_event_id?: string | null }>
  },
) {
  if (process.env.NODE_ENV === 'production' && !process.env.LESSON_SYNC_DEBUG) return
  console.info(`[lesson-sync] ${view} fetch`, {
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    count: options.count,
    sample: options.sample?.slice(0, 8),
  })
}
