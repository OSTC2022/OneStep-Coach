/** 캘린더 빠른 등록 낙관적 UI용 임시 ID */
export function isOptimisticLessonId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('optimistic-')
}

export function createOptimisticLessonId(): string {
  return `optimistic-${crypto.randomUUID()}`
}
