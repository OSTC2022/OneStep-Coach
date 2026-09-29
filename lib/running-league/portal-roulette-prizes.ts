import type { PortalRouletteMode } from '@/lib/running-league/portal-roulette'
import { portalRouletteModeLabel } from '@/lib/running-league/portal-roulette'

export type PortalRoulettePrizes = {
  mileage: string
  beat_rival: string
  attendance: string
}

export const EMPTY_PORTAL_ROULETTE_PRIZES: PortalRoulettePrizes = {
  mileage: '',
  beat_rival: '',
  attendance: '',
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
