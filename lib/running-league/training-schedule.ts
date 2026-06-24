export const TRAINING_WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const

export type TrainingWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type RunningLeagueTrainingScheduleDayInput = {
  weekday: TrainingWeekday
  training_summary: string
  location_label: string
  naver_map_url: string
  is_hidden: boolean
  schedule_date: string | null
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
  schedule_date: string | null
  schedule_date_label: string | null
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

export function formatTrainingScheduleDateLabel(
  scheduleDate: string | null | undefined,
): string | null {
  const raw = scheduleDate?.trim().slice(0, 10)
  if (!raw) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return null
  return `${match[2]}/${match[3]}`
}

/** 월요일(weekday 0) 날짜를 기준으로 화~일 날짜를 채웁니다. */
export function propagateTrainingWeekDatesFromMonday(
  days: RunningLeagueTrainingScheduleDayInput[],
  mondayDate: string | null,
): RunningLeagueTrainingScheduleDayInput[] {
  const raw = mondayDate?.trim().slice(0, 10)
  if (!raw) {
    return days.map((day) => ({ ...day, schedule_date: null }))
  }

  const monday = new Date(`${raw}T12:00:00`)
  if (Number.isNaN(monday.getTime())) return days

  return days.map((day) => {
    const next = new Date(monday)
    next.setDate(monday.getDate() + day.weekday)
    const yyyy = next.getFullYear()
    const mm = String(next.getMonth() + 1).padStart(2, '0')
    const dd = String(next.getDate()).padStart(2, '0')
    return {
      ...day,
      schedule_date: `${yyyy}-${mm}-${dd}`,
    }
  })
}

export function createEmptyTrainingScheduleDays(): RunningLeagueTrainingScheduleDayInput[] {
  return TRAINING_WEEKDAY_LABELS.map((_, weekday) => ({
    weekday: weekday as TrainingWeekday,
    training_summary: '',
    location_label: '',
    naver_map_url: '',
    is_hidden: false,
    schedule_date: null,
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

/** 월~일 7요일 순서로 맞춥니다. 누락 요일은 휴무 플레이스홀더로 채웁니다. */
export function buildFullWeekScheduleDays(
  days: RunningLeagueTrainingScheduleDayView[],
): RunningLeagueTrainingScheduleDayView[] {
  const byWeekday = new Map(days.map((day) => [day.weekday, day]))
  const mondayDate = days.find((day) => day.weekday === 0)?.schedule_date ?? null
  const datedInputs = propagateTrainingWeekDatesFromMonday(
    createEmptyTrainingScheduleDays(),
    mondayDate,
  )

  return TRAINING_WEEKDAY_LABELS.map((_, weekday) => {
    const existing = byWeekday.get(weekday as TrainingWeekday)
    if (existing) return existing

    const scheduleDate = datedInputs[weekday]?.schedule_date ?? null
    return {
      id: `center-weekday-${weekday}`,
      league_id: '',
      weekday: weekday as TrainingWeekday,
      weekday_label: trainingWeekdayLabel(weekday),
      schedule_date: scheduleDate,
      schedule_date_label: formatTrainingScheduleDateLabel(scheduleDate),
      training_summary: '',
      location_label: '',
      naver_map_url: null,
      map_href: null,
      is_hidden: true,
      signup_count: 0,
      signups: [],
      is_signed_up: false,
    }
  })
}

export function isVotableTrainingScheduleDay(day: RunningLeagueTrainingScheduleDayView): boolean {
  return !day.is_hidden && day.training_summary.trim().length > 0
}
