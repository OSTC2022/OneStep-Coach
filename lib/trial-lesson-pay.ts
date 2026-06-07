import { isKoreanHoliday } from '@/lib/korean-holidays'

/** 체험레슨 강사료 — 평일 2만원, 주말·공휴일 3만원 */
export const TRIAL_LESSON_PAY_WEEKDAY = 20_000
export const TRIAL_LESSON_PAY_WEEKEND = 30_000

export function isTrialLessonType(lessonType: string | null | undefined): boolean {
  return lessonType === '체험레슨'
}

function isTrialWeekendOrHoliday(lessonDate: string): boolean {
  const date = new Date(`${lessonDate}T12:00:00`)
  const day = date.getDay()
  return day === 0 || day === 6 || isKoreanHoliday(date)
}

export function getTrialLessonPayAmount(lessonDate: string): number {
  return isTrialWeekendOrHoliday(lessonDate)
    ? TRIAL_LESSON_PAY_WEEKEND
    : TRIAL_LESSON_PAY_WEEKDAY
}

export function isTrialLessonPayAmount(amount: number): boolean {
  return amount === TRIAL_LESSON_PAY_WEEKDAY || amount === TRIAL_LESSON_PAY_WEEKEND
}

export function formatTrialLessonPayHint(lessonDate: string): string {
  const amount = getTrialLessonPayAmount(lessonDate)
  const label = amount === TRIAL_LESSON_PAY_WEEKEND ? '주말·공휴일 3만원' : '평일 2만원'
  return `체험레슨 강사료 ${label}`
}
