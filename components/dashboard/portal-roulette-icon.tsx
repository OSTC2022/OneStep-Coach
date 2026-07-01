'use client'

import { useMemo } from 'react'
import { buildPortalRouletteSegments, describeWedgePath } from '@/lib/running-league/portal-roulette-geometry'
import type { PortalRouletteSlot } from '@/lib/running-league/portal-roulette'
import { cn } from '@/lib/utils'

const ICON_SIZE = 40
const CX = ICON_SIZE / 2
const CY = ICON_SIZE / 2
const R = ICON_SIZE / 2 - 2

const FALLBACK_SLOTS: PortalRouletteSlot[] = [
  { id: 'a1', kind: 'attendance', label: 'A', color: '#38bdf8', weight: 0.5 },
  { id: 'a2', kind: 'attendance', label: 'A', color: '#22d3ee', weight: 0.5 },
]

type PortalRouletteIconProps = {
  slots?: ReadonlyArray<PortalRouletteSlot>
  className?: string
}

export function PortalRouletteIcon({ slots, className }: PortalRouletteIconProps) {
  const segments = useMemo(
    () => buildPortalRouletteSegments(slots && slots.length > 0 ? slots : FALLBACK_SLOTS),
    [slots],
  )

  return (
    <span
      className={cn(
        'relative inline-flex h-10 w-10 shrink-0 items-center justify-center',
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`}
        className="h-9 w-9 drop-shadow-[0_0_10px_rgba(132,204,22,0.25)]"
      >
        <circle cx={CX} cy={CY} r={R + 1.5} fill="#27272a" stroke="#84cc16" strokeWidth={1.2} />
        {segments.map((segment) => (
          <path
            key={segment.slot.id}
            d={describeWedgePath(CX, CY, R, segment.startDeg, segment.endDeg)}
            fill={segment.slot.color}
            stroke="#09090b"
            strokeWidth={0.35}
          />
        ))}
        <circle cx={CX} cy={CY} r={R * 0.34} fill="#09090b" stroke="#3f3f46" strokeWidth={0.6} />
      </svg>
      <span className="pointer-events-none absolute -top-0.5 left-1/2 -translate-x-1/2">
        <span className="block h-0 w-0 border-x-[4px] border-t-[6px] border-x-transparent border-t-lime-300" />
      </span>
    </span>
  )
}
