export const TRAINING_WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const

export type TrainingWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type RunningLeagueTrainingScheduleDayInput = {
  weekday: TrainingWeekday
  training_summary: string
  location_label: string
  naver_map_url: string
  is_hidden: boolean
}

export type RunningLeagueTrainingScheduleSignup = {
  member_id: string
  member_name: string
  signed_at: string
}

export type RunningLeagueTrainingScheduleDayView = {
  id: string
  league_id: string
  weekday: TrainingWeekday
  weekday_label: string
  training_summary: string
  location_label: string
  naver_map_url: string | null
  map_href: string | null
  is_hidden: boolean
  signup_count: number
  signups: RunningLeagueTrainingScheduleSignup[]
  is_signed_up: boolean
}

export function trainingWeekdayLabel(weekday: number): string {
  return TRAINING_WEEKDAY_LABELS[weekday] ?? `${weekday}`
}

export function createEmptyTrainingScheduleDays(): RunningLeagueTrainingScheduleDayInput[] {
  return TRAINING_WEEKDAY_LABELS.map((_, weekday) => ({
    weekday: weekday as TrainingWeekday,
    training_summary: '',
    location_label: '',
    naver_map_url: '',
    is_hidden: false,
  }))
}

export function buildNaverMapSearchUrl(query: string): string | null {
  const trimmed = query.trim()
  if (!trimmed) return null
  return `https://map.naver.com/v5/search/${encodeURIComponent(trimmed)}`
}

export function resolveTrainingScheduleMapHref(input: {
  naver_map_url: string | null
  location_label: string
}): string | null {
  const custom = input.naver_map_url?.trim()
  if (custom) {
    if (/^https?:\/\//i.test(custom)) return custom
    return buildNaverMapSearchUrl(custom)
  }
  return buildNaverMapSearchUrl(input.location_label)
}

export function hasVisibleTrainingSchedule(
  days: RunningLeagueTrainingScheduleDayView[],
): boolean {
  return days.some((day) => !day.is_hidden && day.training_summary.trim().length > 0)
}
