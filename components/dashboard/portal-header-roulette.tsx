'use client'

import { useMemo, useState } from 'react'
import { PortalRouletteGame } from '@/components/dashboard/portal-roulette-game'
import { PortalRouletteIcon } from '@/components/dashboard/portal-roulette-icon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { buildAttendanceKingLeaderboard } from '@/lib/running-league/attendance-king'
import type { MemberRunningLeagueHome } from '@/lib/running-league/member-ranking-types'
import { buildPortalRouletteMemberColorMap } from '@/lib/running-league/portal-member-color-sync'
import { buildPortalRouletteSlots } from '@/lib/running-league/portal-roulette'
import { resolveEffectiveRankingPeriod } from '@/lib/running-league/ranking-period'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'
import { cn } from '@/lib/utils'

type PortalHeaderRouletteProps = {
  mileageLogs: ReadonlyArray<RunningLeagueMileageLog>
  participants: ReadonlyArray<RunningLeagueParticipant>
  rankingReferenceDate?: string | null
  rankingCycleStartDate?: string | null
  beatRivalMemberId?: string | null
  className?: string
}

export function resolvePortalHeaderRouletteProps(input: {
  runningLeagueHome?: Pick<
    MemberRunningLeagueHome,
    'mileageLogs' | 'rankingBundle' | 'league'
  > | null
  rankingReferenceDate?: string | null
  rankingCycleStartDate?: string | null
  beatRivalMemberId?: string | null
}): PortalHeaderRouletteProps | null {
  const bundle = input.runningLeagueHome?.rankingBundle
  if (!bundle || bundle.participants.length === 0) return null

  const mileageLogs =
    bundle.mileageLogs.length > 0
      ? bundle.mileageLogs
      : (input.runningLeagueHome?.mileageLogs ?? [])

  return {
    mileageLogs,
    participants: bundle.participants,
    rankingReferenceDate: input.rankingReferenceDate ?? null,
    rankingCycleStartDate: input.rankingCycleStartDate ?? null,
    beatRivalMemberId:
      input.beatRivalMemberId ??
      input.runningLeagueHome?.league?.beat_rival_member_id ??
      null,
  }
}

export function MemberPortalHeaderRoulette({
  runningLeagueHome,
  rankingReferenceDate,
  rankingCycleStartDate,
  beatRivalMemberId,
  className,
}: {
  runningLeagueHome?: Pick<
    MemberRunningLeagueHome,
    'mileageLogs' | 'rankingBundle' | 'league'
  > | null
  rankingReferenceDate?: string | null
  rankingCycleStartDate?: string | null
  beatRivalMemberId?: string | null
  className?: string
}) {
  const props = useMemo(
    () =>
      resolvePortalHeaderRouletteProps({
        runningLeagueHome,
        rankingReferenceDate,
        rankingCycleStartDate,
        beatRivalMemberId,
      }),
    [beatRivalMemberId, rankingCycleStartDate, rankingReferenceDate, runningLeagueHome],
  )

  if (!props) return null
  return <PortalHeaderRoulette {...props} className={className} />
}

export function PortalHeaderRoulette({
  mileageLogs,
  participants,
  rankingReferenceDate,
  rankingCycleStartDate,
  beatRivalMemberId,
  className,
}: PortalHeaderRouletteProps) {
  const [open, setOpen] = useState(false)

  const { period } = resolveEffectiveRankingPeriod(
    null,
    null,
    rankingReferenceDate ?? null,
    rankingCycleStartDate ?? null,
  )
  const attendanceRows = useMemo(
    () => buildAttendanceKingLeaderboard(participants, mileageLogs, period),
    [mileageLogs, participants, period],
  )

  const memberColorMap = useMemo(
    () =>
      buildPortalRouletteMemberColorMap({
        participants,
        mileageLogs,
        period,
        beatRivalMemberId,
        attendanceMemberIds: attendanceRows.map((row) => row.memberId),
      }),
    [attendanceRows, beatRivalMemberId, mileageLogs, participants, period],
  )

  const slots = useMemo(
    () =>
      buildPortalRouletteSlots({
        attendanceRows,
        memberColorMap,
        beatRivalMemberId,
      }),
    [attendanceRows, beatRivalMemberId, memberColorMap],
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="룰렛 열기"
        className={cn(
          'inline-flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-lime-500/25 bg-lime-500/5 px-2.5 py-1.5 transition-transform hover:scale-105 hover:bg-lime-500/10 active:scale-95',
          className,
        )}
      >
        <PortalRouletteIcon slots={slots} />
        <span className="text-[10px] font-semibold leading-none text-lime-200">룰렛</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          mobileSheet
          showCloseButton
          className="max-h-[min(92dvh,760px)] gap-0 overflow-y-auto border-lime-500/25 bg-zinc-950 p-0 sm:max-w-md"
        >
          <DialogHeader className="border-b border-lime-500/15 px-5 pb-3 pt-5 text-left">
            <DialogTitle className="text-lg text-lime-100">행운의 룰렛</DialogTitle>
            <DialogDescription className="text-zinc-400">
              출석왕 참가자만 룰렛에 표시됩니다. 출석 1회마다 칸이 하나씩 늘어납니다.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-5">
            {open ? (
              <PortalRouletteGame
                key="portal-roulette-game"
                slots={slots}
                attendanceRows={attendanceRows}
                memberColorMap={memberColorMap}
                beatRivalMemberId={beatRivalMemberId}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
