/** 육상부 수업 — 강사료 없음 */
export const ATHLETICS_CLUB_LESSON_PAY = 0

export function getAthleticsClubLessonPayAmount(): number {
  return ATHLETICS_CLUB_LESSON_PAY
}

export function isAthleticsClubPayAmount(amount: number): boolean {
  return amount === ATHLETICS_CLUB_LESSON_PAY
}
