import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import {
  deleteLessonsFromGoogle,
  pushLessonsToGoogle,
  type GoogleLessonDeleteSnapshot,
} from '@/lib/google-calendar/push'
import { isGoogleOAuthTokenRevoked } from '@/lib/google-calendar/errors'
import { recordGoogleCalendarAuthFailure } from '@/lib/google-calendar/sync'

function normalizeLessonIds(lessonIds: string | string[]): string[] {
  return (Array.isArray(lessonIds) ? lessonIds : [lessonIds]).filter(Boolean)
}

/** Supabase 저장 후 Google 반영 — serverless에서도 완료되도록 after() 사용 */
export function scheduleGoogleLessonPush(lessonIds: string | string[]) {
  const ids = normalizeLessonIds(lessonIds)
  if (!ids.length) return
  after(() => runGoogleLessonPush(ids))
}

/** 반복·예외 수업 저장 직후 app_modified_at 갱신 + Google 푸시 예약 */
export async function touchAndScheduleGoogleLessonPush(
  lessonIds: string | string[],
  supabase?: SupabaseClient,
) {
  const ids = normalizeLessonIds(lessonIds)
  if (!ids.length) return

  const client = supabase ?? createServiceRoleClient()
  const touchedAt = touchAppModifiedAt()

  const { error } = await client
    .from('lessons')
    .update({
      app_modified_at: touchedAt,
      sync_origin: 'app',
    })
    .in('id', ids)

  if (error && !error.message.includes('app_modified_at')) {
    console.warn('[google-calendar] touch before push failed:', error.message)
  }

  scheduleGoogleLessonPush(ids)
}

/** @deprecated scheduleGoogleLessonPush 사용 — 동기 push가 필요한 경우만 */
export async function awaitGoogleLessonPush(lessonIds: string | string[]) {
  await runGoogleLessonPush(lessonIds)
}

export async function runGoogleLessonPush(lessonIds: string | string[]) {
  const ids = normalizeLessonIds(lessonIds)
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

export function scheduleGoogleLessonDeletes(
  snapshots: GoogleLessonDeleteSnapshot[],
) {
  if (!snapshots.length) return
  after(() => runGoogleLessonDeletes(snapshots))
}

export function touchAppModifiedAt(): string {
  return new Date().toISOString()
}
