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

/**
 * 수업현황 출석 버튼 — 클라이언트가 낙관적 반영하므로 lesson-status 전체 RSC 갱신은 생략.
 * (동시 loadLessons·서버 재조회 경쟁으로 출석이 되돌아가거나 무한 로딩이 나는 것 방지)
 */
export function revalidateAfterLessonStatusAttendanceChange(memberId?: string) {
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard')
  if (memberId) {
    revalidatePath(`/dashboard/members/${memberId}`)
  }
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
