import type { AttendanceKingRow } from '@/lib/running-league/attendance-king'
import { getMemberChartColor } from '@/lib/running-league/chart-member-colors'
import type { MileageDistanceRankRow } from '@/lib/running-league/mileage-leaderboard'

export type PortalRouletteSlotKind = 'mileage' | 'beat_rival' | 'attendance' | 'pb'

export type PortalRouletteMode = 'mileage' | 'beat_rival' | 'attendance'

export type PortalRouletteSlot = {
  id: string
  kind: PortalRouletteSlotKind
  label: string
  sublabel?: string | null
  memberId?: string | null
  color: string
  weight: number
}

/** 마일리지왕·이겨라 룰렛 — 10km당 칸 1개 */
export const MILEAGE_KM_PER_ROULETTE_SLOT = 10

export function portalRouletteModeLabel(mode: PortalRouletteMode): string {
  if (mode === 'mileage') return '마일리지왕'
  if (mode === 'beat_rival') return '이겨라'
  return '출석왕'
}

const SLOT_COLORS = {
  mileage: '#84cc16',
  beat_rival: '#f97316',
  pb: '#a78bfa',
} as const

export const PORTAL_ROULETTE_CATEGORY_COLORS = SLOT_COLORS

export function mileageKmToRouletteSlotCount(km: number): number {
  if (!Number.isFinite(km) || km <= 0) return 0
  return Math.floor(km / MILEAGE_KM_PER_ROULETTE_SLOT)
}

function equalizeSlotWeights(slots: PortalRouletteSlot[]): PortalRouletteSlot[] {
  if (slots.length === 0) return slots
  const unit = 1 / slots.length
  return slots.map((slot) => ({ ...slot, weight: unit }))
}

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

function pushMileageMemberSlots(
  slots: PortalRouletteSlot[],
  row: MileageDistanceRankRow,
  color: string,
  kind: 'mileage' | 'beat_rival' = 'mileage',
) {
  const sliceCount = mileageKmToRouletteSlotCount(row.mileageKm)
  const label = kind === 'beat_rival' ? '이겨라' : '마일리지왕'
  for (let index = 0; index < sliceCount; index += 1) {
    slots.push({
      id: `${kind}-${row.memberId}-${index}`,
      kind,
      label,
      sublabel: row.memberName,
      memberId: row.memberId,
      color,
      weight: 0,
    })
  }
}

export function buildPortalRouletteAttendanceSlots(input: {
  attendanceRows: ReadonlyArray<AttendanceKingRow>
  memberColorMap: Map<string, string>
  beatRivalMemberId?: string | null
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
    input.attendanceRows.forEach((row) => {
      pushAttendanceMemberSlots(
        slots,
        row,
        getMemberChartColor(
          row.memberId,
          input.memberColorMap,
          input.beatRivalMemberId,
        ),
      )
    })
  }

  return equalizeSlotWeights(slots)
}

export function buildPortalRouletteMileageSlots(input: {
  mileageRows: ReadonlyArray<MileageDistanceRankRow>
  memberColorMap: Map<string, string>
  beatRivalMemberId?: string | null
}): PortalRouletteSlot[] {
  const slots: PortalRouletteSlot[] = []
  const withSlots = input.mileageRows.filter(
    (row) => mileageKmToRouletteSlotCount(row.mileageKm) > 0,
  )

  if (withSlots.length === 0) {
    slots.push({
      id: 'mileage-empty',
      kind: 'mileage',
      label: '마일리지왕',
      sublabel: '10km 미만',
      color: '#64748b',
      weight: 0,
    })
  } else {
    withSlots.forEach((row) => {
      pushMileageMemberSlots(
        slots,
        row,
        getMemberChartColor(
          row.memberId,
          input.memberColorMap,
          input.beatRivalMemberId,
        ),
        'mileage',
      )
    })
  }

  return equalizeSlotWeights(slots)
}

/** 이겨라 룰렛 — 기간 마일리지 기준, 10km당 1칸 */
export function buildPortalRouletteBeatRivalSlots(input: {
  mileageRows: ReadonlyArray<MileageDistanceRankRow>
  memberColorMap: Map<string, string>
  beatRivalMemberId?: string | null
}): PortalRouletteSlot[] {
  const slots: PortalRouletteSlot[] = []
  const withSlots = input.mileageRows.filter(
    (row) => mileageKmToRouletteSlotCount(row.mileageKm) > 0,
  )

  if (withSlots.length === 0) {
    slots.push({
      id: 'beat_rival-empty',
      kind: 'beat_rival',
      label: '이겨라',
      sublabel: '10km 미만',
      color: '#64748b',
      weight: 0,
    })
  } else {
    withSlots.forEach((row) => {
      pushMileageMemberSlots(
        slots,
        row,
        getMemberChartColor(
          row.memberId,
          input.memberColorMap,
          input.beatRivalMemberId,
        ),
        'beat_rival',
      )
    })
  }

  return equalizeSlotWeights(slots)
}

/** @deprecated 출석왕 슬롯 — buildPortalRouletteAttendanceSlots 사용 */
export function buildPortalRouletteSlots(input: {
  attendanceRows: ReadonlyArray<AttendanceKingRow>
  memberColorMap: Map<string, string>
  beatRivalMemberId?: string | null
}): PortalRouletteSlot[] {
  return buildPortalRouletteAttendanceSlots(input)
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
  if (slot.sublabel) {
    if (
      slot.id === 'attendance-empty' ||
      slot.id === 'mileage-empty' ||
      slot.id === 'beat_rival-empty'
    ) {
      return slot.sublabel
    }
    return slot.sublabel
  }
  return slot.label
}

export function formatPortalRouletteResultKindLabel(slot: PortalRouletteSlot): string {
  if (slot.kind === 'mileage') return '마일리지왕'
  if (slot.kind === 'beat_rival') return '이겨라'
  if (slot.kind === 'attendance') return '출석왕'
  return slot.label
}

/** 룰렛 하단·다이얼로그용 안내 문구 */
export function formatPortalRouletteHint(slots: ReadonlyArray<PortalRouletteSlot>): string {
  if (slots.length === 0) return '칸 없음'

  const beatRivalMemberIds = new Set(
    slots
      .filter((slot) => slot.kind === 'beat_rival' && slot.id !== 'beat_rival-empty')
      .map((slot) => slot.memberId)
      .filter((memberId): memberId is string => Boolean(memberId)),
  )
  if (beatRivalMemberIds.size > 0) {
    return `총 ${slots.length}칸 · 이겨라 ${beatRivalMemberIds.size}명`
  }

  const mileageMemberIds = new Set(
    slots
      .filter((slot) => slot.kind === 'mileage' && slot.id !== 'mileage-empty')
      .map((slot) => slot.memberId)
      .filter((memberId): memberId is string => Boolean(memberId)),
  )
  if (mileageMemberIds.size > 0) {
    return `총 ${slots.length}칸 · 마일리지왕 ${mileageMemberIds.size}명`
  }

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
  options: {
    memberColorMap: Map<string, string>
    beatRivalMemberId?: string | null
  },
): Array<{
  memberId: string
  memberName: string
  attendanceCount: number
  rank: number
  color: string
  slotCount: number
}> {
  return attendanceRows.map((row) => ({
    memberId: row.memberId,
    memberName: row.memberName,
    attendanceCount: row.attendanceCount,
    rank: row.rank,
    color: getMemberChartColor(
      row.memberId,
      options.memberColorMap,
      options.beatRivalMemberId,
    ),
    slotCount: row.attendanceCount,
  }))
}

/** 마일리지왕 룰렛 범례 — 10km당 1칸 */
export function buildPortalRouletteMileageLegend(
  mileageRows: ReadonlyArray<MileageDistanceRankRow>,
  options: {
    memberColorMap: Map<string, string>
    beatRivalMemberId?: string | null
  },
): Array<{
  memberId: string
  memberName: string
  mileageKm: number
  rank: number
  color: string
  slotCount: number
}> {
  return mileageRows
    .map((row) => ({
      memberId: row.memberId,
      memberName: row.memberName,
      mileageKm: row.mileageKm,
      rank: row.rank,
      color: getMemberChartColor(
        row.memberId,
        options.memberColorMap,
        options.beatRivalMemberId,
      ),
      slotCount: mileageKmToRouletteSlotCount(row.mileageKm),
    }))
    .filter((row) => row.slotCount > 0)
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
