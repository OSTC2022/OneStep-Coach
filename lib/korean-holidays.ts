/** 고정 공휴일 (매년 MM-DD) */
const FIXED_HOLIDAYS = new Set([
  '01-01', // 신정
  '03-01', // 삼일절
  '05-05', // 어린이날
  '06-06', // 현충일
  '08-15', // 광복절
  '10-03', // 개천절
  '10-09', // 한글날
  '12-25', // 크리스마스
])

/** 음력·대체공휴일 등 연도별 공휴일 (yyyy-MM-dd) */
const VARIABLE_HOLIDAYS: Record<number, string[]> = {
  2025: [
    '2025-01-28', '2025-01-29', '2025-01-30', // 설날
    '2025-03-03', // 삼일절 대체
    '2025-05-05', // 어린이날
    '2025-05-06', // 어린이날 대체
    '2025-06-06', // 현충일
    '2025-08-15', // 광복절
    '2025-10-03', // 개천절
    '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08', // 추석
    '2025-10-09', // 한글날
    '2025-12-25', // 크리스마스
  ],
  2026: [
    '2026-02-16', '2026-02-17', '2026-02-18', // 설날
    '2026-03-02', // 삼일절 대체
    '2026-05-05', // 어린이날
    '2026-05-25', // 부처님오신날
    '2026-06-06', // 현충일
    '2026-08-15', // 광복절
    '2026-08-17', // 광복절 대체
    '2026-09-24', '2026-09-25', '2026-09-26', // 추석
    '2026-10-05', // 개천절 대체
    '2026-10-09', // 한글날
    '2026-12-25', // 크리스마스
  ],
  2027: [
    '2027-02-06', '2027-02-07', '2027-02-08', // 설날
    '2027-03-01', // 삼일절
    '2027-05-05', // 어린이날
    '2027-05-13', // 부처님오신날
    '2027-06-06', // 현충일
    '2027-08-15', // 광복절
    '2027-09-14', '2027-09-15', '2027-09-16', // 추석
    '2027-10-03', // 개천절
    '2027-10-04', // 개천절 대체
    '2027-10-09', // 한글날
    '2027-10-11', // 한글날 대체
    '2027-12-25', // 크리스마스
  ],
}

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isKoreanHoliday(date: Date): boolean {
  const key = toDateKey(date)
  const monthDay = key.slice(5)

  if (FIXED_HOLIDAYS.has(monthDay)) return true

  const yearHolidays = VARIABLE_HOLIDAYS[date.getFullYear()]
  return yearHolidays?.includes(key) ?? false
}

export function isSunday(date: Date): boolean {
  return date.getDay() === 0
}

export function isSaturday(date: Date): boolean {
  return date.getDay() === 6
}

/** 일요일·공휴일 → 빨간색, 토요일 → 파란색 */
export function getDateColorClass(
  date: Date,
  options?: { muted?: boolean },
): string {
  const holiday = isKoreanHoliday(date)
  const sunday = isSunday(date)
  const saturday = isSaturday(date)

  if (holiday || sunday) {
    return options?.muted ? 'text-red-400/60' : 'text-red-500'
  }
  if (saturday) {
    return options?.muted ? 'text-blue-400/60' : 'text-blue-500'
  }
  return options?.muted ? 'text-muted-foreground' : ''
}

/** 월요일 시작 주간 헤더 라벨 (index 5=토, 6=일) */
export const WEEKDAY_LABELS_MON_START = ['월', '화', '수', '목', '금', '토', '일'] as const

export function getWeekdayHeaderColorClass(index: number): string {
  if (index === 5) return 'text-blue-500'
  if (index === 6) return 'text-red-500'
  return 'text-muted-foreground'
}
