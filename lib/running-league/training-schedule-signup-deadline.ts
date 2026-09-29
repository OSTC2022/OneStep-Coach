import { getKstDateKey } from '@/lib/member-backup/kst-date'

/** 훈련 요일: 0=월 … 5=토, 6=일 */
export function isTrainingScheduleWeekend(weekday: number): boolean {
  return weekday === 5 || weekday === 6
}

/** 평일 18:00 / 주말 16:00 (KST) */
export function getTrainingScheduleSignupDeadlineHour(weekday: number): number {
  return isTrainingScheduleWeekend(weekday) ? 16 : 18
}

function getKstHourMinute(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '0'

  return {
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  }
}

/**
 * 해당 훈련일 참여 신청 마감 여부.
 * - 훈련일(schedule_date) 기준 평일 18시 / 주말 16시 이후 마감
 * - schedule_date 없으면 "오늘"이 그 요일이면 오늘 시각으로 판정
 */
export function isTrainingScheduleSignupClosed(input: {
  weekday: number
  scheduleDate?: string | null
  now?: Date
}): boolean {
  const now = input.now ?? new Date()
  const today = getKstDateKey(now)
  const scheduleDate = (input.scheduleDate ?? '').slice(0, 10)
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(scheduleDate) ? scheduleDate : today

  if (targetDate < today) return true
  if (targetDate > today) return false

  const { hour, minute } = getKstHourMinute(now)
  const deadlineHour = getTrainingScheduleSignupDeadlineHour(input.weekday)
  return hour * 60 + minute >= deadlineHour * 60
}

export function trainingScheduleSignupClosedMessage(weekday: number): string {
  const hour = getTrainingScheduleSignupDeadlineHour(weekday)
  const when = isTrainingScheduleWeekend(weekday) ? '주말' : '평일'
  return `참여 신청이 마감되었습니다. (${when} ${hour}:00 이후)`
}
