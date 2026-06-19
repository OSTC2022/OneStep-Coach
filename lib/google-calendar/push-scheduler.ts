import 'server-only'

import { after } from 'next/server'
import {
  deleteLessonsFromGoogle,
  pushLessonsToGoogle,
  type GoogleLessonDeleteSnapshot,
} from '@/lib/google-calendar/push'

export function scheduleGoogleLessonPush(lessonIds: string | string[]) {
  const ids = Array.isArray(lessonIds) ? lessonIds : [lessonIds]
  if (!ids.length) return

  after(async () => {
    await pushLessonsToGoogle(ids)
  })
}

export function scheduleGoogleLessonDeletes(snapshots: GoogleLessonDeleteSnapshot[]) {
  if (!snapshots.length) return

  after(async () => {
    await deleteLessonsFromGoogle(snapshots)
  })
}

export function touchAppModifiedAt(): string {
  return new Date().toISOString()
}
