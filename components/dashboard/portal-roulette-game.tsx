'use client'

import { PortalRouletteAttendanceList } from '@/components/dashboard/portal-roulette-attendance-list'
import { PortalRouletteWheel } from '@/components/dashboard/portal-roulette-wheel'
import type { AttendanceKingRow } from '@/lib/running-league/attendance-king'
import type { PortalRouletteSlot } from '@/lib/running-league/portal-roulette'

type PortalRouletteGameProps = {
  slots: PortalRouletteSlot[]
  attendanceRows: ReadonlyArray<AttendanceKingRow>
  memberColorMap: Map<string, string>
  beatRivalMemberId?: string | null
}

export function PortalRouletteGame({
  slots,
  attendanceRows,
  memberColorMap,
  beatRivalMemberId = null,
}: PortalRouletteGameProps) {
  return (
    <div className="space-y-5">
      <PortalRouletteWheel slots={slots} diameter={300} />
      <PortalRouletteAttendanceList
        attendanceRows={attendanceRows}
        memberColorMap={memberColorMap}
        beatRivalMemberId={beatRivalMemberId}
      />
    </div>
  )
}
