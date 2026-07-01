import type { PortalRouletteSlot } from '@/lib/running-league/portal-roulette'

export type PortalRouletteSegment = {
  slot: PortalRouletteSlot
  startDeg: number
  endDeg: number
  midDeg: number
}

/** 12시 방향 = 0°, 시계 방향 */
export function buildPortalRouletteSegments(
  slots: ReadonlyArray<PortalRouletteSlot>,
): PortalRouletteSegment[] {
  let cursor = 0
  return slots.map((slot) => {
    const span = slot.weight * 360
    const startDeg = cursor
    const endDeg = cursor + span
    cursor = endDeg
    return {
      slot,
      startDeg,
      endDeg,
      midDeg: startDeg + span / 2,
    }
  })
}

function clockDegToRad(deg: number): number {
  return ((deg - 90) * Math.PI) / 180
}

export function polarFromClockDeg(cx: number, cy: number, radius: number, deg: number) {
  const rad = clockDegToRad(deg)
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  }
}

export function describeWedgePath(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
): string {
  if (endDeg - startDeg >= 359.99) {
    return `M ${cx - radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx + radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx - radius} ${cy} Z`
  }

  const start = polarFromClockDeg(cx, cy, radius, startDeg)
  const end = polarFromClockDeg(cx, cy, radius, endDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0

  return [
    `M ${cx} ${cy}`,
    `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}
