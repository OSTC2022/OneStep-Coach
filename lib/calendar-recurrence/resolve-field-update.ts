import type { LessonFormData } from '@/lib/types'
import { toStoredLessonType } from '@/lib/lesson-types'

export function resolveInstructorIdUpdate(
  updates: Partial<LessonFormData>,
  current: string | null | undefined,
): string | null {
  if ('instructor_id' in updates) {
    return updates.instructor_id?.trim() || null
  }
  return current?.trim() || null
}

export function resolveLessonTypeUpdate(
  updates: Partial<LessonFormData>,
  current: string | null | undefined,
): string {
  if ('lesson_type' in updates) {
    return toStoredLessonType(updates.lesson_type ?? 'individual')
  }
  return toStoredLessonType(current ?? 'individual')
}
