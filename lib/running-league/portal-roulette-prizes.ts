import type { PortalRouletteMode } from '@/lib/running-league/portal-roulette'
import { portalRouletteModeLabel } from '@/lib/running-league/portal-roulette'
import { normalizePortalManageMonthKey } from '@/lib/running-league/portal-manage-month'

export type PortalRoulettePrizes = {
  mileage: string
  beat_rival: string
  attendance: string
}

/** 월별 경품 저장소 — key: yyyy-MM */
export type PortalRoulettePrizesByMonth = Record<string, PortalRoulettePrizes>

export const EMPTY_PORTAL_ROULETTE_PRIZES: PortalRoulettePrizes = {
  mileage: '',
  beat_rival: '',
  attendance: '',
}

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function normalizePortalRoulettePrizeMonthKey(
  value: string | null | undefined,
): string {
  return normalizePortalManageMonthKey(value)
}

export function parsePortalRoulettePrizes(value: unknown): PortalRoulettePrizes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_PORTAL_ROULETTE_PRIZES }
  }
  const row = value as Record<string, unknown>
  return {
    mileage: typeof row.mileage === 'string' ? row.mileage : '',
    beat_rival: typeof row.beat_rival === 'string' ? row.beat_rival : '',
    attendance: typeof row.attendance === 'string' ? row.attendance : '',
  }
}

function isLegacyFlatPrizesShape(row: Record<string, unknown>): boolean {
  const hasModeField =
    typeof row.mileage === 'string' ||
    typeof row.beat_rival === 'string' ||
    typeof row.attendance === 'string'
  if (!hasModeField) return false
  return !Object.keys(row).some((key) => MONTH_KEY_RE.test(key))
}

/**
 * DB JSON 파싱.
 * - 신규: { "2026-09": { mileage, beat_rival, attendance }, ... }
 * - 구형(단일): { mileage, beat_rival, attendance } → 레거시로 보관
 */
export function parsePortalRoulettePrizesStore(value: unknown): {
  byMonth: PortalRoulettePrizesByMonth
  legacy: PortalRoulettePrizes | null
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { byMonth: {}, legacy: null }
  }

  const row = value as Record<string, unknown>

  if (isLegacyFlatPrizesShape(row)) {
    return { byMonth: {}, legacy: parsePortalRoulettePrizes(row) }
  }

  const byMonth: PortalRoulettePrizesByMonth = {}
  let legacy: PortalRoulettePrizes | null = null

  for (const [key, entry] of Object.entries(row)) {
    if (MONTH_KEY_RE.test(key) && entry && typeof entry === 'object' && !Array.isArray(entry)) {
      byMonth[key] = parsePortalRoulettePrizes(entry)
      continue
    }
  }

  // 월 키와 함께 남아 있는 구형 필드가 있으면 레거시로
  if (
    typeof row.mileage === 'string' ||
    typeof row.beat_rival === 'string' ||
    typeof row.attendance === 'string'
  ) {
    legacy = parsePortalRoulettePrizes(row)
  }

  return { byMonth, legacy }
}

/**
 * 해당 월에 저장된 경품만 반환.
 * 구형(단일) 경품은 다른 달에 절대 흘려보내지 않는다.
 */
export function resolvePortalRoulettePrizesForMonth(
  store: {
    byMonth: PortalRoulettePrizesByMonth
    legacy: PortalRoulettePrizes | null
  },
  monthKey: string,
): PortalRoulettePrizes {
  const key = normalizePortalRoulettePrizeMonthKey(monthKey)
  const monthPrizes = store.byMonth[key]
  if (monthPrizes) return { ...monthPrizes }
  return { ...EMPTY_PORTAL_ROULETTE_PRIZES }
}

/** 구형 단일 경품 → 지정 월 한 칸으로만 이전 */
export function migrateLegacyPortalRoulettePrizes(
  store: {
    byMonth: PortalRoulettePrizesByMonth
    legacy: PortalRoulettePrizes | null
  },
  targetMonthKey: string,
): PortalRoulettePrizesByMonth | null {
  if (!store.legacy) return null
  if (Object.keys(store.byMonth).length > 0) return null
  const key = normalizePortalRoulettePrizeMonthKey(targetMonthKey)
  return {
    [key]: { ...store.legacy },
  }
}

export function upsertPortalRoulettePrizesStore(input: {
  store: {
    byMonth: PortalRoulettePrizesByMonth
    legacy: PortalRoulettePrizes | null
  }
  monthKey: string
  prizes: PortalRoulettePrizes
}): PortalRoulettePrizesByMonth {
  const key = normalizePortalRoulettePrizeMonthKey(input.monthKey)
  return {
    ...input.store.byMonth,
    [key]: {
      mileage: input.prizes.mileage,
      beat_rival: input.prizes.beat_rival,
      attendance: input.prizes.attendance,
    },
  }
}

export function normalizePortalRoulettePrizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

export function portalRoulettePrizeForMode(
  prizes: PortalRoulettePrizes,
  mode: PortalRouletteMode,
): string {
  if (mode === 'mileage') return prizes.mileage
  if (mode === 'beat_rival') return prizes.beat_rival
  return prizes.attendance
}

export function portalRoulettePrizeModeLabel(mode: PortalRouletteMode): string {
  return portalRouletteModeLabel(mode)
}
