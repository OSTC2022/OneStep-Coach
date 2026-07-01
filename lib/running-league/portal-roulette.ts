import type { AttendanceKingRow } from '@/lib/running-league/attendance-king'

export type PortalRouletteSlotKind = 'mileage' | 'beat_rival' | 'attendance' | 'pb'

export type PortalRouletteSlot = {
  id: string
  kind: PortalRouletteSlotKind
  label: string
  sublabel?: string | null
  memberId?: string | null
  color: string
  weight: number
}

const SLOT_COLORS = {
  mileage: '#84cc16',
  beat_rival: '#f97316',
  pb: '#a78bfa',
} as const

export const PORTAL_ROULETTE_CATEGORY_COLORS = SLOT_COLORS

const ATTENDANCE_PALETTE = [
  '#38bdf8',
  '#22d3ee',
  '#2dd4bf',
  '#34d399',
  '#4ade80',
  '#60a5fa',
  '#818cf8',
  '#c084fc',
] as const

function pushAttendanceMemberSlots(
  slots: PortalRouletteSlot[],
  row: AttendanceKingRow,
  color: string,
) {
  const sliceCount = Math.max(1, row.attendanceCount)
  for (let index = 0; index < sliceCount; index += 1) {
    slots.push({
      id: `attendance-${row.memberId}-${index}`,
      kind: 'attendance',
      label: '출석왕',
      sublabel: row.memberName,
      memberId: row.memberId,
      color,
      weight: 0,
    })
  }
}

export function buildPortalRouletteSlots(input: {
  attendanceRows: ReadonlyArray<AttendanceKingRow>
}): PortalRouletteSlot[] {
  const slots: PortalRouletteSlot[] = []

  if (input.attendanceRows.length === 0) {
    slots.push({
      id: 'attendance-empty',
      kind: 'attendance',
      label: '출석왕',
      sublabel: '3km+ 없음',
      color: '#64748b',
      weight: 0,
    })
  } else {
    input.attendanceRows.forEach((row, index) => {
      pushAttendanceMemberSlots(
        slots,
        row,
        ATTENDANCE_PALETTE[index % ATTENDANCE_PALETTE.length],
      )
    })
  }

  const unit = 1 / slots.length
  return slots.map((slot) => ({ ...slot, weight: unit }))
}

export function pickPortalRouletteSlot(slots: ReadonlyArray<PortalRouletteSlot>): PortalRouletteSlot {
  if (slots.length === 0) {
    throw new Error('룰렛 칸이 없습니다.')
  }
  const target = Math.random()
  let cumulative = 0
  for (const slot of slots) {
    cumulative += slot.weight
    if (target <= cumulative) return slot
  }
  return slots[slots.length - 1]
}

export function formatPortalRouletteResult(slot: PortalRouletteSlot): string {
  if (slot.kind === 'attendance' && slot.sublabel) {
    if (slot.id === 'attendance-empty') return slot.sublabel
    return slot.sublabel
  }
  return slot.label
}

/** 룰렛 하단·다이얼로그용 안내 문구 */
export function formatPortalRouletteHint(slots: ReadonlyArray<PortalRouletteSlot>): string {
  if (slots.length === 0) return '칸 없음'

  const attendanceMemberIds = new Set(
    slots
      .filter((slot) => slot.kind === 'attendance' && slot.id !== 'attendance-empty')
      .map((slot) => slot.memberId)
      .filter((memberId): memberId is string => Boolean(memberId)),
  )

  if (attendanceMemberIds.size > 0) {
    return `총 ${slots.length}칸 · 출석왕 ${attendanceMemberIds.size}명`
  }

  return `총 ${slots.length}칸`
}

/** 출석왕 룰렛 범례 — 멤버별 색·칸 수 */
export function buildPortalRouletteAttendanceLegend(
  attendanceRows: ReadonlyArray<AttendanceKingRow>,
): Array<{
  memberId: string
  memberName: string
  attendanceCount: number
  rank: number
  color: string
  slotCount: number
}> {
  return attendanceRows.map((row, index) => ({
    memberId: row.memberId,
    memberName: row.memberName,
    attendanceCount: row.attendanceCount,
    rank: row.rank,
    color: ATTENDANCE_PALETTE[index % ATTENDANCE_PALETTE.length],
    slotCount: row.attendanceCount,
  }))
}

export function buildPortalRouletteGradient(slots: ReadonlyArray<PortalRouletteSlot>): string {
  let cursor = 0
  const parts: string[] = []
  for (const slot of slots) {
    const start = cursor * 360
    cursor += slot.weight
    const end = cursor * 360
    parts.push(`${slot.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`)
  }
  return parts.join(', ')
}

export function portalRouletteTargetRotation(
  slots: ReadonlyArray<PortalRouletteSlot>,
  selectedId: string,
  extraSpins = 5,
): number {
  let cursor = 0
  let midAngle = 0
  for (const slot of slots) {
    const span = slot.weight * 360
    if (slot.id === selectedId) {
      midAngle = cursor + span / 2
      break
    }
    cursor += span
  }
  return extraSpins * 360 + (360 - midAngle)
}
