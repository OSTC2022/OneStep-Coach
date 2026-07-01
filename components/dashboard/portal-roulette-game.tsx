'use client'

import { PortalRouletteAttendanceList } from '@/components/dashboard/portal-roulette-attendance-list'
import { PortalRouletteWheel } from '@/components/dashboard/portal-roulette-wheel'
import type { AttendanceKingRow } from '@/lib/running-league/attendance-king'
import type { PortalRouletteSlot } from '@/lib/running-league/portal-roulette'

type PortalRouletteGameProps = {
  slots: PortalRouletteSlot[]
  attendanceRows: ReadonlyArray<AttendanceKingRow>
}

export function PortalRouletteGame({ slots, attendanceRows }: PortalRouletteGameProps) {
  return (
    <div className="space-y-5">
      <PortalRouletteWheel slots={slots} diameter={300} />
      <PortalRouletteAttendanceList attendanceRows={attendanceRows} />
    </div>
  )
}
