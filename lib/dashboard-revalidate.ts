import { revalidatePath } from 'next/cache'
import { revalidateLessonViews } from '@/lib/lesson-data-sync'

/** 출석·수업현황 핵심 화면만 갱신 */
export function revalidateLessonAttendanceViews() {
  revalidateLessonViews()
}

/** 캘린더까지 포함한 출석 관련 화면 */
export function revalidateLessonAttendanceWithCalendar() {
  revalidateLessonViews()
}

/** 세션 차감·복구 시 회원/세션 화면까지 갱신 */
export function revalidateSessionDeductionPaths(memberId?: string) {
  revalidateLessonAttendanceWithCalendar()
  revalidatePath('/dashboard/sessions')
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/members')
  if (memberId) {
    revalidatePath(`/dashboard/members/${memberId}`)
  }
}
