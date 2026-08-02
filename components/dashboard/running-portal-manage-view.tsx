'use client'

import { useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PortalHeaderRoulette } from '@/components/dashboard/portal-header-roulette'
import { PortalRouletteGame } from '@/components/dashboard/portal-roulette-game'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AdultRunningPortalManageMonthData } from '@/lib/actions/adult-running-portal-manage'
import {
  ATTENDANCE_KING_DAY_RULE_LABEL,
  buildAttendanceKingLeaderboard,
} from '@/lib/running-league/attendance-king'
import { formatRankingMemberName } from '@/lib/running-league/mask-member-name'
import { buildPortalRouletteMemberColorMap } from '@/lib/running-league/portal-member-color-sync'
import { formatPortalManageMonthOptionLabel } from '@/lib/running-league/portal-manage-month'
import { buildPortalRouletteSlots } from '@/lib/running-league/portal-roulette'
import { MEMBER_PORTAL_SHELL_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'

type RunningPortalManageViewProps = {
  data: AdultRunningPortalManageMonthData
}

export function RunningPortalManageView({ data }: RunningPortalManageViewProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const attendanceRows = useMemo(
    () =>
      buildAttendanceKingLeaderboard(data.participants, data.mileageLogs, data.period),
    [data.mileageLogs, data.participants, data.period],
  )

  const memberColorMap = useMemo(
    () =>
      buildPortalRouletteMemberColorMap({
        participants: data.participants,
        mileageLogs: data.mileageLogs,
        period: data.period,
        beatRivalMemberId: data.beatRivalMemberId,
        attendanceMemberIds: attendanceRows.map((row) => row.memberId),
      }),
    [attendanceRows, data.beatRivalMemberId, data.mileageLogs, data.participants, data.period],
  )

  const slots = useMemo(
    () =>
      buildPortalRouletteSlots({
        attendanceRows,
        memberColorMap,
        beatRivalMemberId: data.beatRivalMemberId,
      }),
    [attendanceRows, data.beatRivalMemberId, memberColorMap],
  )

  function handleMonthChange(nextMonth: string) {
    startTransition(() => {
      router.push(`/dashboard/running-portal/manage?month=${encodeURIComponent(nextMonth)}`)
    })
  }

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-muted-foreground">
            <Link href="/dashboard/running-portal">
              <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
              내 러닝 포털
            </Link>
          </Button>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">러닝 포털 관리</h1>
          <p className="text-sm text-muted-foreground">
            월을 선택하면 해당 기간 출석왕·룰렛을 다시 집계합니다.
          </p>
        </div>
        <PortalHeaderRoulette
          mileageLogs={data.mileageLogs}
          participants={data.participants}
          rankingMonthKey={data.monthKey}
          beatRivalMemberId={data.beatRivalMemberId}
        />
      </div>

      <section className={cn(MEMBER_PORTAL_SHELL_CLASS, 'space-y-4 p-4 sm:p-5')}>
        <div className="space-y-2">
          <Label htmlFor="portal-manage-month">조회 월</Label>
          <Select
            value={data.monthKey}
            onValueChange={handleMonthChange}
            disabled={pending}
          >
            <SelectTrigger id="portal-manage-month" className="max-w-xs">
              <SelectValue placeholder="월 선택" />
            </SelectTrigger>
            <SelectContent>
              {data.availableMonthKeys.map((monthKey) => (
                <SelectItem key={monthKey} value={monthKey}>
                  {formatPortalManageMonthOptionLabel(monthKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {data.period.label} · {ATTENDANCE_KING_DAY_RULE_LABEL}
            {pending ? ' · 불러오는 중…' : null}
          </p>
        </div>

        {data.error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {data.error}
          </p>
        ) : null}

        {!data.tableReady ? (
          <p className="text-sm text-muted-foreground">
            러닝 리그 테이블이 아직 준비되지 않았습니다.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">출석왕</h2>
                <p className="text-xs text-muted-foreground">
                  {attendanceRows.length}명 · 로그 {data.mileageLogs.length}건
                </p>
              </div>
              {attendanceRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  이 달 3km+ 출석 기록이 없습니다.
                </div>
              ) : (
                <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
                  {attendanceRows.map((row) => (
                    <li
                      key={row.memberId}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          <span className="mr-2 tabular-nums text-muted-foreground">
                            {row.rank}위
                          </span>
                          {formatRankingMemberName(row.memberName)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">{row.attendanceCount}회</p>
                        <p>{row.totalKm.toFixed(1)}km</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3 border-t border-border/50 pt-4">
              <h2 className="text-sm font-semibold">행운의 룰렛</h2>
              <PortalRouletteGame
                key={`roulette-${data.monthKey}`}
                slots={slots}
                attendanceRows={attendanceRows}
                memberColorMap={memberColorMap}
                beatRivalMemberId={data.beatRivalMemberId}
              />
            </div>
          </>
        )}
      </section>
    </div>
  )
}
