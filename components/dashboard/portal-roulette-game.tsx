'use client'

import { useState } from 'react'
import { PortalRouletteParticipantList } from '@/components/dashboard/portal-roulette-attendance-list'
import { PortalRoulettePrizePanel } from '@/components/dashboard/portal-roulette-prize-panel'
import { PortalRouletteWheel } from '@/components/dashboard/portal-roulette-wheel'
import type { AttendanceKingRow } from '@/lib/running-league/attendance-king'
import type { MileageDistanceRankRow } from '@/lib/running-league/mileage-leaderboard'
import type {
  PortalRouletteMode,
  PortalRouletteSlot,
} from '@/lib/running-league/portal-roulette'
import {
  MILEAGE_KM_PER_ROULETTE_SLOT,
} from '@/lib/running-league/portal-roulette'
import { cn } from '@/lib/utils'

type PortalRouletteGameProps = {
  attendanceSlots: PortalRouletteSlot[]
  mileageSlots: PortalRouletteSlot[]
  beatRivalSlots: PortalRouletteSlot[]
  attendanceRows: ReadonlyArray<AttendanceKingRow>
  mileageRows: ReadonlyArray<MileageDistanceRankRow>
  memberColorMap: Map<string, string>
  beatRivalMemberId?: string | null
  defaultMode?: PortalRouletteMode
}

const MODE_TABS: Array<{ value: PortalRouletteMode; label: string }> = [
  { value: 'mileage', label: '마일리지왕' },
  { value: 'beat_rival', label: '이겨라' },
  { value: 'attendance', label: '출석왕' },
]

function modeHint(mode: PortalRouletteMode): string {
  if (mode === 'mileage') {
    return `마일리지왕 참가자만 표시됩니다. ${MILEAGE_KM_PER_ROULETTE_SLOT}km마다 칸이 1개씩 늘어납니다.`
  }
  if (mode === 'beat_rival') {
    return `이겨라 참가자만 표시됩니다. 기간 마일리지 기준 ${MILEAGE_KM_PER_ROULETTE_SLOT}km마다 칸이 1개씩 늘어납니다.`
  }
  return '출석왕 참가자만 표시됩니다. 출석 1회마다 칸이 하나씩 늘어납니다.'
}

export function PortalRouletteGame({
  attendanceSlots,
  mileageSlots,
  beatRivalSlots,
  attendanceRows,
  mileageRows,
  memberColorMap,
  beatRivalMemberId = null,
  defaultMode = 'mileage',
}: PortalRouletteGameProps) {
  const [mode, setMode] = useState<PortalRouletteMode>(defaultMode)
  const slots =
    mode === 'mileage'
      ? mileageSlots
      : mode === 'beat_rival'
        ? beatRivalSlots
        : attendanceSlots

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-lime-500/20 bg-black/40 p-1">
        {MODE_TABS.map((tab) => {
          const active = mode === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setMode(tab.value)}
              className={cn(
                'rounded-md px-2 py-2 text-xs font-semibold transition-colors sm:text-sm',
                active
                  ? 'bg-lime-500/20 text-lime-100 shadow-[inset_0_0_0_1px_rgba(163,230,53,0.35)]'
                  : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <p className="text-center text-[11px] leading-relaxed text-zinc-500">
        {modeHint(mode)}
      </p>

      <PortalRoulettePrizePanel mode={mode} />

      <PortalRouletteWheel key={mode} slots={slots} diameter={300} />
      <PortalRouletteParticipantList
        mode={mode}
        attendanceRows={attendanceRows}
        mileageRows={mileageRows}
        memberColorMap={memberColorMap}
        beatRivalMemberId={beatRivalMemberId}
      />
    </div>
  )
}
