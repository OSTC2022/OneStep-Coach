/** 러닝레슨 강사료 — 회당 2만원 (평일·주말 동일) */
export const RUNNING_LESSON_PAY = 20_000

export function getRunningLessonPayAmount(): number {
  return RUNNING_LESSON_PAY
}

export function isRunningLessonPayAmount(amount: number): boolean {
  return amount === RUNNING_LESSON_PAY
}

export function formatRunningLessonPayHint(): string {
  return '러닝레슨 강사료 회당 2만원'
}
