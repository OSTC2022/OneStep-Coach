import {
  clearLessonAttendanceCheck,
  updateLessonAttendanceStatus,
} from '@/lib/actions/lesson-sessions'
import { isAttendanceMarked } from '@/lib/lesson-record-utils'
import type { Lesson } from '@/lib/types'

/** 수업현황 실행 취소 — 출석/취소 상태를 이전 스냅샷으로 복원 */
export async function restoreLessonAttendanceSnapshot(
  snap: Lesson,
): Promise<{ error?: string }> {
  if (snap.attendance_status === 'cancelled') {
    const result = await updateLessonAttendanceStatus(snap.id, 'cancelled')
    return result.error ? { error: result.error } : {}
  }

  if (isAttendanceMarked(snap)) {
    const result = await updateLessonAttendanceStatus(snap.id, 'present')
    return result.error ? { error: result.error } : {}
  }

  const presentResult = await updateLessonAttendanceStatus(snap.id, 'present')
  if (presentResult.error) {
    return { error: presentResult.error }
  }

  const clearResult = await clearLessonAttendanceCheck(snap.id)
  if (clearResult.error && !clearResult.error.includes('종료된 수업')) {
    return { error: clearResult.error }
  }

  return {}
}

export function lessonAttendanceLocalPatch(snap: Lesson): Partial<Lesson> {
  if (snap.attendance_status === 'cancelled') {
    return {
      attendance_status: 'cancelled',
      lesson_sessions: [],
    }
  }

  if (isAttendanceMarked(snap)) {
    return {
      attendance_status: 'present',
      lesson_sessions: snap.lesson_sessions?.length
        ? snap.lesson_sessions
        : [{ checked_in_at: new Date().toISOString() }],
    }
  }

  return {
    attendance_status: 'present',
    lesson_sessions: [],
    session_deducted: snap.session_deducted ?? false,
  }
}
