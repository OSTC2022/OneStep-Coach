'use client'

import { useMemo, useState } from 'react'
import {
  buildPortalRouletteSegments,
  describeWedgePath,
  polarFromClockDeg,
} from '@/lib/running-league/portal-roulette-geometry'
import {
  formatPortalRouletteHint,
  formatPortalRouletteResult,
  pickPortalRouletteSlot,
  portalRouletteTargetRotation,
  type PortalRouletteSlot,
} from '@/lib/running-league/portal-roulette'
import { cn } from '@/lib/utils'

const SPIN_MS = 4800

type PortalRouletteWheelProps = {
  slots: PortalRouletteSlot[]
  className?: string
  diameter?: number
  onResult?: (label: string) => void
}

function RoulettePointer() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2"
      style={{ marginTop: '-4px' }}
      aria-hidden
    >
      <svg width="28" height="32" viewBox="0 0 28 32" className="drop-shadow-lg">
        <path d="M14 28 L4 6 Q14 2 24 6 Z" fill="#d9f99d" stroke="#365314" strokeWidth="1.5" />
        <circle cx="14" cy="8" r="3" fill="#ecfccb" stroke="#365314" strokeWidth="1" />
      </svg>
    </div>
  )
}

function RimPegs({
  cx,
  cy,
  radius,
  segments,
}: {
  cx: number
  cy: number
  radius: number
  segments: ReturnType<typeof buildPortalRouletteSegments>
}) {
  const pegs = segments.flatMap((segment) => {
    const points = [segment.startDeg]
    if (segment.endDeg - segment.startDeg > 6) {
      points.push(segment.midDeg)
    }
    return points
  })

  return (
    <>
      {pegs.map((deg, index) => {
        const outer = polarFromClockDeg(cx, cy, radius + 3, deg)
        return (
          <circle
            key={`${deg}-${index}`}
            cx={outer.x}
            cy={outer.y}
            r={1.8}
            fill="#fafafa"
            stroke="#52525b"
            strokeWidth={0.5}
          />
        )
      })}
    </>
  )
}

export function PortalRouletteWheel({
  slots,
  className,
  diameter = 280,
  onResult,
}: PortalRouletteWheelProps) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const segments = useMemo(() => buildPortalRouletteSegments(slots), [slots])
  const cx = diameter / 2
  const cy = diameter / 2
  const discRadius = diameter / 2 - 14
  const hubRadius = discRadius * 0.22

  function handleSpin() {
    if (spinning || slots.length === 0) return

    const picked = pickPortalRouletteSlot(slots)
    const label = formatPortalRouletteResult(picked)
    const nextRotation =
      rotation + portalRouletteTargetRotation(slots, picked.id, 6 + Math.floor(Math.random() * 3))

    setSpinning(true)
    setResult(null)
    setRotation(nextRotation)

    window.setTimeout(() => {
      setSpinning(false)
      setResult(label)
      onResult?.(label)
    }, SPIN_MS)
  }

  return (
    <div className={cn('flex w-full flex-col items-center gap-4', className)}>
      <div className="relative" style={{ width: diameter, height: diameter }}>
        <RoulettePointer />

        {/* 고정 외곽 프레임 */}
        <div
          className="absolute inset-0 rounded-full bg-gradient-to-b from-zinc-500 via-zinc-800 to-zinc-950 p-[7px] shadow-[0_12px_40px_rgba(0,0,0,0.55)] ring-1 ring-lime-500/30"
          style={{ width: diameter, height: diameter }}
        >
          <div className="relative h-full w-full overflow-hidden rounded-full bg-zinc-950">
            <svg
              viewBox={`0 0 ${diameter} ${diameter}`}
              className="h-full w-full"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: spinning
                  ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.85, 0.18, 1)`
                  : undefined,
              }}
            >
              {segments.map((segment) => (
                <path
                  key={segment.slot.id}
                  d={describeWedgePath(cx, cy, discRadius, segment.startDeg, segment.endDeg)}
                  fill={segment.slot.color}
                  stroke="#09090b"
                  strokeWidth={0.8}
                />
              ))}
              <RimPegs cx={cx} cy={cy} radius={discRadius} segments={segments} />
              <circle
                cx={cx}
                cy={cy}
                r={discRadius}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={1}
              />
            </svg>
          </div>
        </div>

        {/* 고정 SPIN 허브 */}
        <button
          type="button"
          onClick={handleSpin}
          disabled={spinning || slots.length === 0}
          aria-label="룰렛 돌리기"
          className={cn(
            'absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 border-lime-400/60 bg-gradient-to-b from-zinc-700 to-zinc-950 font-bold text-lime-50 shadow-[0_6px_20px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all',
            spinning
              ? 'pointer-events-none scale-95 opacity-80'
              : 'hover:scale-105 hover:border-lime-300 hover:shadow-[0_0_24px_rgba(132,204,22,0.4)] active:scale-95',
          )}
          style={{ width: hubRadius * 2, height: hubRadius * 2 }}
        >
          <span className="text-sm tracking-[0.2em]">{spinning ? '···' : 'SPIN'}</span>
        </button>
      </div>

      {result ? (
        <div className="w-full animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-lime-400/40 bg-gradient-to-b from-lime-500/15 to-lime-500/5 px-4 py-3 text-center duration-300">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-lime-300/90">
            출석왕
          </p>
          <p className="mt-1 text-lg font-bold text-lime-50">{result}</p>
        </div>
      ) : (
        <p className="text-center text-xs leading-relaxed text-zinc-500">
          {formatPortalRouletteHint(slots)}
        </p>
      )}
    </div>
  )
}
