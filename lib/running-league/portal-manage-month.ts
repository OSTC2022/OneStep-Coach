import { format, parseISO, subMonths } from 'date-fns'
import { formatRankingMonthInputLabel } from '@/lib/running-league/ranking-period'

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function normalizePortalManageMonthKey(
  value: string | null | undefined,
  fallback = format(new Date(), 'yyyy-MM'),
): string {
  const trimmed = value?.trim() ?? ''
  if (MONTH_KEY_RE.test(trimmed)) return trimmed
  return fallback
}

export function listPortalManageMonthOptions(reference = new Date(), count = 12): string[] {
  const keys: string[] = []
  for (let index = 0; index < count; index += 1) {
    keys.push(format(subMonths(reference, index), 'yyyy-MM'))
  }
  return keys
}

export function formatPortalManageMonthOptionLabel(monthKey: string): string {
  try {
    return formatRankingMonthInputLabel(monthKey)
  } catch {
    return monthKey
  }
}

export function isValidPortalManageMonthKey(value: string): boolean {
  if (!MONTH_KEY_RE.test(value)) return false
  try {
    parseISO(`${value}-01`)
    return true
  } catch {
    return false
  }
}
