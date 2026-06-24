import { addDays, format, startOfWeek } from 'date-fns'

/** 훈련 스케줄 참여로 자동 생성된 출석 세션 식별용 */
export const CENTER_TRAINING_SCHEDULE_ATTENDANCE_NOTE =
  'center-running-training-schedule'

export function resolveCenterTrainingScheduleSessionDate(
  weekday: number,
  scheduleDate: string | null | undefined,
  now = new Date(),
): string {
  const raw = scheduleDate?.trim().slice(0, 10)
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const monday = startOfWeek(now, { weekStartsOn: 1 })
  return format(addDays(monday, weekday), 'yyyy-MM-dd')
}
