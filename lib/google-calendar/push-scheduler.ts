import 'server-only'

import {
  deleteLessonsFromGoogle,
  pushLessonsToGoogle,
  type GoogleLessonDeleteSnapshot,
} from '@/lib/google-calendar/push'
import { isGoogleOAuthTokenRevoked } from '@/lib/google-calendar/errors'
import { recordGoogleCalendarAuthFailure } from '@/lib/google-calendar/sync'

/** Supabase 저장 후 Google 반영 — 백그라운드 (앱 UI는 Supabase 기준 즉시 표시) */
export function scheduleGoogleLessonPush(lessonIds: string | string[]) {
  void runGoogleLessonPush(lessonIds)
}

/** @deprecated scheduleGoogleLessonPush 사용 — 동기 push가 필요한 경우만 */
export async function awaitGoogleLessonPush(lessonIds: string | string[]) {
  await runGoogleLessonPush(lessonIds)
}

export async function runGoogleLessonPush(lessonIds: string | string[]) {
  const ids = Array.isArray(lessonIds) ? lessonIds : [lessonIds]
  if (!ids.length) return
  try {
    await pushLessonsToGoogle(ids)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)
    console.error('[google-calendar] push failed:', message)
    if (isGoogleOAuthTokenRevoked(error)) {
      await recordGoogleCalendarAuthFailure(error).catch(() => {})
    }
    if (
      message.includes('쓰기 권한') ||
      message.includes('403') ||
      message.includes('insufficient')
    ) {
      console.error(
        '[google-calendar] Google 계정을 설정에서 다시 연결해 주세요 (calendar 쓰기 권한 필요).',
      )
    }
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

/** @deprecated scheduleGoogleLessonPush 사용 */
export function scheduleGoogleLessonDeletes(
  snapshots: GoogleLessonDeleteSnapshot[],
) {
  void runGoogleLessonDeletes(snapshots)
}

export function touchAppModifiedAt(): string {
  return new Date().toISOString()
}
