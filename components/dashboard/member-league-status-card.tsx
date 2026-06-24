'use client'

import type { ReactNode } from 'react'
import { Target, TrendingUp, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MemberLeagueStatusSnapshot } from '@/lib/running-league/league-status-summary'
import { cn } from '@/lib/utils'

export function MemberLeagueStatusCard({
  snapshot,
  showMyRankBadge = true,
  onAddPb,
  onAddMileage,
  canEdit = false,
  rankingView = 'pb',
  className,
}: {
  snapshot: MemberLeagueStatusSnapshot
  showMyRankBadge?: boolean
  onAddPb?: () => void
  onAddMileage?: () => void
  canEdit?: boolean
  rankingView?: 'pb' | 'mileage'
  className?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-lime-400/40 bg-gradient-to-br from-zinc-950 via-black to-lime-500/[0.08] shadow-[0_0_32px_rgba(163,230,53,0.08)]',
        className,
      )}
    >
      <div className="border-b border-lime-500/15 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-lime-100">내 현재 리그 상태</p>
            {showMyRankBadge ? (
              <span className="rounded-full border border-lime-300/50 bg-lime-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lime-50 shadow-[0_0_14px_rgba(163,230,53,0.3)]">
                내 순위
              </span>
            ) : null}
          </div>
          {canEdit ? (
            <div className="hidden flex-wrap gap-2 sm:flex">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-lime-500/30 bg-lime-500/10 text-lime-100 hover:bg-lime-500/15"
                onClick={onAddPb}
              >
                PB 등록/수정
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-lime-500/30 bg-lime-500/10 text-lime-100 hover:bg-lime-500/15"
                onClick={onAddMileage}
              >
                러닝 기록 추가
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
        <StatusStatBlock
          orderClassName="order-1"
          icon={<TrendingUp className="h-4 w-4 text-lime-400" />}
          label="현재 순위"
          value={snapshot.rankHeadline}
          hint={snapshot.rankSubline}
          valueClassName="text-4xl sm:text-5xl text-lime-300"
        />
        <StatusStatBlock
          orderClassName="order-2"
          icon={<Zap className="h-4 w-4 text-emerald-400" />}
          label="이번 달 마일리지"
          value={snapshot.monthlyMileageLabel}
          hint={
            snapshot.remainingToGoalLabel ??
            (snapshot.monthlyMileageKm > 0 ? '이번 달 누적 거리' : '러닝 기록을 추가해보세요')
          }
          valueClassName="text-3xl sm:text-4xl text-lime-200"
        />
        <StatusStatBlock
          orderClassName="order-3"
          icon={<Target className="h-4 w-4 text-lime-400" />}
          label="목표 달성률"
          value={snapshot.goalLabel}
          hint={snapshot.goalSubline}
          valueClassName="text-3xl sm:text-4xl text-lime-200"
        />
        <StatusStatBlock
          orderClassName="order-4 lg:order-4"
          label="최근 PB"
          value={snapshot.recentPbHeadline}
          hint={
            snapshot.personalPbLabel
              ? `${snapshot.pbDistanceLabel} ${snapshot.personalPbLabel} · ${snapshot.recentPbSubline}`
              : snapshot.recentPbSubline
          }
          valueClassName="text-lg sm:text-xl text-lime-100"
          compactValue
        />
      </div>

      {snapshot.soloRankHint || snapshot.comparisonHint ? (
        <div className="border-t border-lime-500/10 px-4 py-3 text-xs leading-relaxed text-zinc-400 sm:px-5">
          {snapshot.soloRankHint ? <p>{snapshot.soloRankHint}</p> : null}
          {snapshot.comparisonHint ? <p className={snapshot.soloRankHint ? 'mt-1' : undefined}>{snapshot.comparisonHint}</p> : null}
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex flex-col gap-2 border-t border-lime-500/10 p-4 sm:hidden">
          <Button
            type="button"
            className="min-h-11 w-full bg-lime-500 text-black hover:bg-lime-400"
            onClick={rankingView === 'pb' ? onAddPb : onAddMileage}
          >
            {rankingView === 'pb' ? 'PB 등록/수정' : '러닝 기록 추가'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full border-lime-500/30 text-lime-100"
            onClick={rankingView === 'pb' ? onAddMileage : onAddPb}
          >
            {rankingView === 'pb' ? '러닝 기록 추가' : 'PB 등록/수정'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function StatusStatBlock({
  orderClassName,
  icon,
  label,
  value,
  hint,
  valueClassName,
  compactValue = false,
}: {
  orderClassName?: string
  icon?: ReactNode
  label: string
  value: string
  hint: string
  valueClassName?: string
  compactValue?: boolean
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-xl border border-lime-500/15 bg-black/35 px-3.5 py-3.5 sm:px-4',
        orderClassName,
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          'font-bold leading-tight tabular-nums',
          compactValue ? 'text-base sm:text-lg' : 'text-3xl',
          valueClassName,
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{hint}</p>
    </div>
  )
}
