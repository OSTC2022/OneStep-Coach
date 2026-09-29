/** 육상선수반 주 종목·PB */

export const YOUTH_ATHLETICS_EVENT_OPTIONS = [
  { key: '60m', label: '60m', kind: 'time' },
  { key: '100m', label: '100m', kind: 'time' },
  { key: '200m', label: '200m', kind: 'time' },
  { key: '400m', label: '400m', kind: 'time' },
  { key: '800m', label: '800m', kind: 'time' },
  { key: '1500m', label: '1500m', kind: 'time' },
  { key: '3000m', label: '3000m', kind: 'time' },
  { key: '3000mSC', label: '3000mSC', kind: 'time' },
  { key: '5000m', label: '5000m', kind: 'time' },
  { key: '10000m', label: '10000m', kind: 'time' },
  { key: 'half', label: 'Half', kind: 'time' },
  { key: 'full', label: 'Full', kind: 'time' },
  { key: '100mH', label: '100mH', kind: 'time' },
  { key: '110mH', label: '110mH', kind: 'time' },
  { key: '400mH', label: '400mH', kind: 'time' },
  { key: 'LJ', label: '멀리뛰기', kind: 'mark' },
  { key: 'TJ', label: '세단뛰기', kind: 'mark' },
  { key: 'HJ', label: '높이뛰기', kind: 'mark' },
  { key: 'PV', label: '장대높이뛰기', kind: 'mark' },
  { key: 'SP', label: '포환던지기', kind: 'mark' },
  { key: 'DT', label: '원반던지기', kind: 'mark' },
  { key: 'JT', label: '창던지기', kind: 'mark' },
] as const

export type YouthAthleticsEventKey =
  (typeof YOUTH_ATHLETICS_EVENT_OPTIONS)[number]['key']

export type YouthAthleticsResultKind = 'time' | 'mark'

export function isYouthAthleticsEventKey(
  value: string | null | undefined,
): value is YouthAthleticsEventKey {
  if (!value) return false
  return YOUTH_ATHLETICS_EVENT_OPTIONS.some((event) => event.key === value)
}

export function getYouthAthleticsEventLabel(
  key: string | null | undefined,
): string {
  if (!key) return '종목 미선택'
  const found = YOUTH_ATHLETICS_EVENT_OPTIONS.find((event) => event.key === key)
  return found?.label ?? key
}

export function getYouthAthleticsEventKind(
  key: string | null | undefined,
): YouthAthleticsResultKind {
  const found = YOUTH_ATHLETICS_EVENT_OPTIONS.find((event) => event.key === key)
  return found?.kind ?? 'time'
}

/** 짧은 거리·단거리부터 앞에 오도록 정렬 */
export function sortYouthAthleticsEventsByDistance<T extends string>(
  keys: ReadonlyArray<T | null | undefined>,
): T[] {
  const order = new Map(
    YOUTH_ATHLETICS_EVENT_OPTIONS.map((event, index) => [event.key, index]),
  )
  return keys
    .filter((key): key is T => Boolean(key))
    .slice()
    .sort((a, b) => {
      const aOrder = order.get(a as YouthAthleticsEventKey) ?? Number.MAX_SAFE_INTEGER
      const bOrder = order.get(b as YouthAthleticsEventKey) ?? Number.MAX_SAFE_INTEGER
      return aOrder - bOrder
    })
}

export function formatYouthAthleticsPrimaryEventsLabel(
  event1: string | null | undefined,
  event2: string | null | undefined,
): string {
  return sortYouthAthleticsEventsByDistance([event1, event2])
    .map((key) => getYouthAthleticsEventLabel(key))
    .join(' / ')
}

function formatTrackSecondsPart(seconds: number, rawPart?: string): string {
  if (rawPart?.includes('.')) {
    const core = Number(rawPart).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    return seconds < 10 && !core.startsWith('0') ? `0${core}` : core
  }
  const whole = Math.trunc(seconds)
  return String(whole).padStart(2, '0')
}

/**
 * 육상 기록 파서
 * - 시간: "11.45", "1:05.22", "18:30", "1:32:10"
 * - 거리/높이: "6.45", "1.85" (m)
 */
export function parseYouthAthleticsResult(
  input: string | null | undefined,
  kind: YouthAthleticsResultKind,
): { value: number; text: string } | null {
  const raw = (input ?? '').trim().replace(',', '.')
  if (!raw) return null

  if (kind === 'mark') {
    const cleaned = raw.replace(/\s*m$/i, '')
    const value = Number(cleaned)
    if (!Number.isFinite(value) || value <= 0 || value > 120) return null
    const text = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    return { value, text: `${text}m` }
  }

  // time — "11.45" | "1:05.22" | "18:30" | "1:32:10"
  if (raw.includes(':')) {
    const parts = raw.split(':')
    if (parts.length === 2) {
      const minutes = Number(parts[0])
      const seconds = Number(parts[1])
      if (
        !Number.isFinite(minutes) ||
        !Number.isFinite(seconds) ||
        minutes < 0 ||
        seconds < 0 ||
        seconds >= 60
      ) {
        return null
      }
      const value = minutes * 60 + seconds
      if (value <= 0 || value > 10 * 3600) return null
      return {
        value,
        text: `${minutes}:${formatTrackSecondsPart(seconds, parts[1])}`,
      }
    }
    if (parts.length === 3) {
      const hours = Number(parts[0])
      const minutes = Number(parts[1])
      const seconds = Number(parts[2])
      if (
        !Number.isFinite(hours) ||
        !Number.isFinite(minutes) ||
        !Number.isFinite(seconds) ||
        hours < 0 ||
        minutes < 0 ||
        minutes >= 60 ||
        seconds < 0 ||
        seconds >= 60
      ) {
        return null
      }
      const value = hours * 3600 + minutes * 60 + seconds
      if (value <= 0 || value > 10 * 3600) return null
      return {
        value,
        text: `${hours}:${String(Math.trunc(minutes)).padStart(2, '0')}:${formatTrackSecondsPart(seconds, parts[2])}`,
      }
    }
    return null
  }

  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0 || value > 10 * 3600) return null
  const text = Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return { value, text }
}

export function formatYouthAthleticsResultValue(
  value: number,
  kind: YouthAthleticsResultKind,
): string {
  if (!Number.isFinite(value)) return '-'
  if (kind === 'mark') {
    return `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}m`
  }
  if (value >= 3600) {
    const hours = Math.floor(value / 3600)
    const minutes = Math.floor((value % 3600) / 60)
    const seconds = value - hours * 3600 - minutes * 60
    const secText = seconds.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    const paddedSec = seconds < 10 ? `0${secText}` : secText
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSec}`
  }
  if (value >= 60) {
    const minutes = Math.floor(value / 60)
    const seconds = value - minutes * 60
    const secText = seconds.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    const padded = seconds < 10 ? `0${secText}` : secText
    return `${minutes}:${padded}`
  }
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/** 수업권 남은 일수 → 디데이 표기 */
export function formatYouthAthleticsRemainingDday(
  daysUntilExpiry: number | null | undefined,
): string {
  if (daysUntilExpiry == null) return '기간 미지정'
  if (daysUntilExpiry < 0) return `D+${Math.abs(daysUntilExpiry)}`
  if (daysUntilExpiry === 0) return 'D-Day'
  return `D-${daysUntilExpiry}`
}
