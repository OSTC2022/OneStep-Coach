'use client'

import type { AttendanceKingRow } from '@/lib/running-league/attendance-king'
import { formatMileageKmDisplay } from '@/lib/running-league/mileage-leaderboard'
import type { MileageDistanceRankRow } from '@/lib/running-league/mileage-leaderboard'
import { formatRankingMemberName } from '@/lib/running-league/mask-member-name'
import {
  buildPortalRouletteAttendanceLegend,
  buildPortalRouletteMileageLegend,
  MILEAGE_KM_PER_ROULETTE_SLOT,
  type PortalRouletteMode,
} from '@/lib/running-league/portal-roulette'
import { cn } from '@/lib/utils'

export function PortalRouletteParticipantList({
  mode,
  attendanceRows,
  mileageRows,
  memberColorMap,
  beatRivalMemberId = null,
  className,
}: {
  mode: PortalRouletteMode
  attendanceRows: ReadonlyArray<AttendanceKingRow>
  mileageRows: ReadonlyArray<MileageDistanceRankRow>
  memberColorMap: Map<string, string>
  beatRivalMemberId?: string | null
  className?: string
}) {
  if (mode === 'mileage' || mode === 'beat_rival') {
    const legend = buildPortalRouletteMileageLegend(mileageRows, {
      memberColorMap,
      beatRivalMemberId,
    })
    const title = mode === 'beat_rival' ? '이겨라 참가자' : '마일리지왕 참가자'
    const emptyMessage =
      mode === 'beat_rival'
        ? `이번 달 ${MILEAGE_KM_PER_ROULETTE_SLOT}km 이상 기록이 있는 회원이 없습니다.`
        : `이번 달 ${MILEAGE_KM_PER_ROULETTE_SLOT}km 이상 기록이 있는 회원이 없습니다.`

    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-lime-300/90">
            {title}
          </p>
          <p className="text-[11px] text-zinc-500">
            {MILEAGE_KM_PER_ROULETTE_SLOT}km = 룰렛 칸 1개
          </p>
        </div>

        {legend.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-700/80 bg-black/25 px-3 py-4 text-center text-sm text-zinc-500">
            {emptyMessage}
          </div>
        ) : (
          <ul className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-lime-500/15 bg-black/35 p-2">
            {legend.map((row) => {
              const isRival =
                mode === 'beat_rival' &&
                beatRivalMemberId != null &&
                row.memberId === beatRivalMemberId
              return (
                <li
                  key={row.memberId}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/5',
                    isRival && 'bg-orange-500/10 ring-1 ring-orange-400/30',
                  )}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-white/20 shadow-sm"
                    style={{ backgroundColor: row.color }}
                    aria-hidden
                  />
                  <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-zinc-500">
                    {row.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-100">
                    {formatRankingMemberName(row.memberName)}
                    {isRival ? (
                      <span className="ml-1 text-[10px] font-semibold text-orange-300">
                        타깃
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                    {formatMileageKmDisplay(row.mileageKm)}
                  </span>
                  <span className="shrink-0 rounded-full bg-lime-500/15 px-2 py-0.5 text-[10px] font-medium text-lime-300">
                    {row.slotCount}칸
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  const legend = buildPortalRouletteAttendanceLegend(attendanceRows, {
    memberColorMap,
    beatRivalMemberId,
  })

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-lime-300/90">
          출석왕 참가자
        </p>
        <p className="text-[11px] text-zinc-500">출석 1회 = 룰렛 칸 1개</p>
      </div>

      {legend.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700/80 bg-black/25 px-3 py-4 text-center text-sm text-zinc-500">
          이번 달 3km+ 출석 기록이 있는 회원이 없습니다.
        </div>
      ) : (
        <ul className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-lime-500/15 bg-black/35 p-2">
          {legend.map((row) => (
            <li
              key={row.memberId}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/5"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-white/20 shadow-sm"
                style={{ backgroundColor: row.color }}
                aria-hidden
              />
              <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-zinc-500">
                {row.rank}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-zinc-100">
                {formatRankingMemberName(row.memberName)}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                {row.attendanceCount}회
              </span>
              <span className="shrink-0 rounded-full bg-lime-500/15 px-2 py-0.5 text-[10px] font-medium text-lime-300">
                {row.slotCount}칸
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** @deprecated PortalRouletteParticipantList 사용 */
export function PortalRouletteAttendanceList({
  attendanceRows,
  memberColorMap,
  beatRivalMemberId = null,
  className,
  mileageRows = [],
}: {
  attendanceRows: ReadonlyArray<AttendanceKingRow>
  memberColorMap: Map<string, string>
  beatRivalMemberId?: string | null
  className?: string
  mileageRows?: ReadonlyArray<MileageDistanceRankRow>
}) {
  return (
    <PortalRouletteParticipantList
      mode="attendance"
      attendanceRows={attendanceRows}
      mileageRows={mileageRows}
      memberColorMap={memberColorMap}
      beatRivalMemberId={beatRivalMemberId}
      className={className}
    />
  )
}
