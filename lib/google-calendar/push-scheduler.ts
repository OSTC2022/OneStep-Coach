import 'server-only'

import {
  deleteLessonsFromGoogle,
  pushLessonsToGoogle,
  type GoogleLessonDeleteSnapshot,
} from '@/lib/google-calendar/push'

/** 센터 변경 → Google 즉시 반영 (응답 전에 push 완료) */
export async function runGoogleLessonPush(lessonIds: string | string[]) {
  const ids = Array.isArray(lessonIds) ? lessonIds : [lessonIds]
  if (!ids.length) return
  try {
    await pushLessonsToGoogle(ids)
  } catch (error) {
    console.error(
      '[google-calendar] push failed:',
      error instanceof Error ? error.message : error,
    )
  }
}

export async function runGoogleLessonDeletes(
  snapshots: GoogleLessonDeleteSnapshot[],
) {
  if (!snapshots.length) return
  try {
    await deleteLessonsFromGoogle(snapshots)
  } catch (error) {
    console.error(
      '[google-calendar] delete failed:',
      error instanceof Error ? error.message : error,
    )
  }
}

/** @deprecated runGoogleLessonPush 사용 */
export function scheduleGoogleLessonPush(lessonIds: string | string[]) {
  void runGoogleLessonPush(lessonIds)
}

/** @deprecated runGoogleLessonDeletes 사용 */
export function scheduleGoogleLessonDeletes(
  snapshots: GoogleLessonDeleteSnapshot[],
) {
  void runGoogleLessonDeletes(snapshots)
}

export function touchAppModifiedAt(): string {
  return new Date().toISOString()
}
