/** 수업 유형 — UI·저장 공통 */
export const LESSON_TYPE_OPTIONS = [
  '개인레슨',
  '그룹레슨',
  '체험레슨',
  '러닝레슨',
  '육상부',
] as const

export type LessonTypeOption = (typeof LESSON_TYPE_OPTIONS)[number]

const LEGACY_RUNNING_LESSON_TYPE = '보강'

/** DB에 남아 있는 구 「보강」 표기를 러닝레슨으로 통일 */
export function normalizeLessonType(
  lessonType: string | null | undefined,
): string {
  if (!lessonType) return '개인레슨'
  if (lessonType === LEGACY_RUNNING_LESSON_TYPE) return '러닝레슨'
  return lessonType
}

export function isRunningLessonType(
  lessonType: string | null | undefined,
): boolean {
  const normalized = normalizeLessonType(lessonType)
  return normalized === '러닝레슨'
}

export function isAthleticsClubLessonType(
  lessonType: string | null | undefined,
): boolean {
  return normalizeLessonType(lessonType) === '육상부'
}

/** 신규 저장 시 러닝레슨으로 통일 */
export function toStoredLessonType(
  lessonType: string | null | undefined,
): string {
  return normalizeLessonType(lessonType)
}
