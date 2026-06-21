import { getKstDateKey } from '@/lib/member-backup/kst-date'

export type KstYearMonth = {
  year: number
  month: number
  key: string
  sheetName: string
  label: string
}

/** ISO/날짜 문자열 → KST 기준 YYYY-MM */
export function getKstYearMonthKey(isoOrDate: string): string {
  const datePart = isoOrDate.split('T')[0]
  let d: Date
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    d = new Date(`${datePart}T12:00:00+09:00`)
  } else {
    const ms = Date.parse(isoOrDate)
    if (Number.isNaN(ms)) return ''
    d = new Date(ms)
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .slice(0, 7)
}

export function parseKstYearMonthKey(key: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]) }
}

export function buildMonthlySheetName(year: number, month: number): string {
  return `${year}_${String(month).padStart(2, '0')}월`
}

/** 올해 1월 ~ 현재 월 (KST) */
export function listYearMonthsThroughCurrent(asOf = new Date()): KstYearMonth[] {
  const today = getKstDateKey(asOf)
  const year = Number(today.slice(0, 4))
  const currentMonth = Number(today.slice(5, 7))
  const months: KstYearMonth[] = []

  for (let month = 1; month <= currentMonth; month += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    months.push({
      year,
      month,
      key,
      sheetName: buildMonthlySheetName(year, month),
      label: `${month}월`,
    })
  }

  return months
}

export function isDateInKstMonth(dateIso: string, monthKey: string): boolean {
  return getKstYearMonthKey(dateIso) === monthKey
}
