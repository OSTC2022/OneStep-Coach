import { format, subMonths, subYears } from 'date-fns'

export type BodyPeriodMode = 'all' | '1m' | '3m' | '6m' | '1y' | 'custom'

export type BodyPeriodSettings = {
  mode: BodyPeriodMode
  fromDate?: string
  toDate?: string
}

export type BodyPeriodRange = {
  from: string
  to: string
}

const STORAGE_PREFIX = 'one-step-coach:body-period:'

export const DEFAULT_BODY_PERIOD_SETTINGS: BodyPeriodSettings = {
  mode: 'all',
}

export const BODY_PERIOD_PRESETS: { mode: BodyPeriodMode; label: string }[] = [
  { mode: 'all', label: '전체' },
  { mode: '1m', label: '1개월' },
  { mode: '3m', label: '3개월' },
  { mode: '6m', label: '6개월' },
  { mode: '1y', label: '1년' },
  { mode: 'custom', label: '직접 지정' },
]

function storageKey(memberId: string) {
  return `${STORAGE_PREFIX}${memberId}`
}

function isValidMode(mode: unknown): mode is BodyPeriodMode {
  return (
    mode === 'all' ||
    mode === '1m' ||
    mode === '3m' ||
    mode === '6m' ||
    mode === '1y' ||
    mode === 'custom'
  )
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function normalizeBodyPeriodSettings(
  value: Partial<BodyPeriodSettings> | null | undefined,
): BodyPeriodSettings {
  if (!value || !isValidMode(value.mode)) {
    return { ...DEFAULT_BODY_PERIOD_SETTINGS }
  }
  if (value.mode === 'custom') {
    return {
      mode: 'custom',
      fromDate: isIsoDate(value.fromDate) ? value.fromDate : undefined,
      toDate: isIsoDate(value.toDate) ? value.toDate : undefined,
    }
  }
  return { mode: value.mode }
}

export function loadBodyPeriodSettings(memberId: string): BodyPeriodSettings | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey(memberId))
    if (!raw) return null
    return normalizeBodyPeriodSettings(JSON.parse(raw) as Partial<BodyPeriodSettings>)
  } catch {
    return null
  }
}

export function saveBodyPeriodSettings(
  memberId: string,
  settings: BodyPeriodSettings,
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    storageKey(memberId),
    JSON.stringify(normalizeBodyPeriodSettings(settings)),
  )
}

export function clearBodyPeriodSettings(memberId: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(storageKey(memberId))
}

export function resolveBodyPeriodRange(
  settings: BodyPeriodSettings,
  today = new Date(),
): BodyPeriodRange | null {
  const to = format(today, 'yyyy-MM-dd')
  switch (settings.mode) {
    case 'all':
      return null
    case '1m':
      return { from: format(subMonths(today, 1), 'yyyy-MM-dd'), to }
    case '3m':
      return { from: format(subMonths(today, 3), 'yyyy-MM-dd'), to }
    case '6m':
      return { from: format(subMonths(today, 6), 'yyyy-MM-dd'), to }
    case '1y':
      return { from: format(subYears(today, 1), 'yyyy-MM-dd'), to }
    case 'custom': {
      if (!settings.fromDate && !settings.toDate) return null
      return {
        from: settings.fromDate ?? '1970-01-01',
        to: settings.toDate ?? to,
      }
    }
    default:
      return null
  }
}

export function formatBodyPeriodLabel(settings: BodyPeriodSettings): string {
  const preset = BODY_PERIOD_PRESETS.find((item) => item.mode === settings.mode)
  if (settings.mode !== 'custom') {
    return preset?.label ?? '전체'
  }
  if (settings.fromDate && settings.toDate) {
    return `${settings.fromDate} ~ ${settings.toDate}`
  }
  if (settings.fromDate) {
    return `${settings.fromDate} ~`
  }
  if (settings.toDate) {
    return `~ ${settings.toDate}`
  }
  return '직접 지정'
}

export function bodyPeriodSettingsEqual(
  a: BodyPeriodSettings,
  b: BodyPeriodSettings,
): boolean {
  return (
    a.mode === b.mode &&
    (a.fromDate ?? '') === (b.fromDate ?? '') &&
    (a.toDate ?? '') === (b.toDate ?? '')
  )
}
