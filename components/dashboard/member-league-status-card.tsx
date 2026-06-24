'use client'

import type { ReactNode } from 'react'
import { Target, TrendingUp, Zap } from 'lucide-react'
import type { MemberLeagueStatusSnapshot } from '@/lib/running-league/league-status-summary'
import { cn } from '@/lib/utils'

export function MemberLeagueStatusCard({
  snapshot,
  showMyRankBadge = true,
  compact = false,
  className,
}: {
  snapshot: MemberLeagueStatusSnapshot
  showMyRankBadge?: boolean
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-lime-400/40 bg-gradient-to-br from-zinc-950 via-black to-lime-500/[0.08] shadow-[0_0_24px_rgba(163,230,53,0.06)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-lime-500/15 px-3 py-1.5 sm:px-4 sm:py-2.5">
        <p className="text-[11px] font-semibold text-lime-100 sm:text-sm">내 현재 리그 상태</p>
        {showMyRankBadge ? (
          <span className="rounded-full border border-lime-300/50 bg-lime-400/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-lime-50 shadow-[0_0_12px_rgba(163,230,53,0.28)] sm:text-[10px]">
            내 순위
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-1.5 p-2 sm:gap-3 sm:p-4 lg:grid-cols-4 lg:gap-3 lg:p-5">
        <StatusStatBlock
          icon={<TrendingUp className="h-3.5 w-3.5 text-lime-400" />}
          label="현재 순위"
          value={snapshot.rankHeadline}
          mobileValue={snapshot.currentRank != null ? `${snapshot.currentRank}위` : '—'}
          hint={snapshot.rankSubline}
          valueClassName="text-lime-300"
          emphasize
          compact={compact}
        />
        <StatusStatBlock
          icon={<Zap className="h-3.5 w-3.5 text-emerald-400" />}
          label="이번 달 마일리지"
          value={snapshot.monthlyMileageLabel}
          hint={
            snapshot.remainingToGoalLabel ??
            (snapshot.monthlyMileageKm > 0 ? '이번 달 누적' : '기록 추가')
          }
          valueClassName="text-lime-200"
          emphasize
          compact={compact}
        />
        <StatusStatBlock
          icon={<Target className="h-3.5 w-3.5 text-lime-400" />}
          label="목표 달성률"
          value={snapshot.goalLabel}
          hint={snapshot.goalSubline}
          valueClassName="text-lime-200"
          emphasize
          compact={compact}
        />
        <StatusStatBlock
          label="최근 PB"
          value={snapshot.recentPbHeadline}
          mobileValue={snapshot.recentPbShortValue}
          hint={snapshot.recentPbSubline}
          valueClassName="text-lime-100"
          compact={compact}
        />
      </div>

      {!compact && (snapshot.soloRankHint || snapshot.comparisonHint) ? (
        <div className="border-t border-lime-500/10 px-3 py-2 text-[11px] leading-relaxed text-zinc-400 sm:px-4 sm:py-2.5 sm:text-xs">
          {snapshot.isSoloRanked ? (
            <p className="font-medium text-lime-200/80">현재 리그 1위입니다</p>
          ) : null}
          {snapshot.soloRankHint ? <p className={snapshot.isSoloRanked ? 'mt-0.5' : undefined}>{snapshot.soloRankHint}</p> : null}
          {snapshot.comparisonHint && !snapshot.isSoloRanked ? <p>{snapshot.comparisonHint}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function StatusStatBlock({
  icon,
  label,
  value,
  mobileValue,
  hint,
  valueClassName,
  emphasize = false,
  compact = false,
}: {
  icon?: ReactNode
  label: string
  value: string
  mobileValue?: string
  hint: string
  valueClassName?: string
  emphasize?: boolean
  compact?: boolean
}) {
  return (
    <div className="min-w-0 rounded-lg border border-lime-500/15 bg-black/35 px-2 py-1.5 sm:rounded-xl sm:px-3.5 sm:py-3">
      <div className="mb-0.5 flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide text-zinc-500 sm:mb-1.5 sm:text-[11px]">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn(
          'font-bold leading-none tabular-nums',
          emphasize
            ? compact
              ? 'text-xl sm:text-3xl lg:text-4xl'
              : 'text-2xl sm:text-3xl lg:text-4xl'
            : 'text-base sm:text-lg',
          valueClassName,
        )}
      >
        <span className="sm:hidden">{mobileValue ?? value}</span>
        <span className="hidden sm:inline">{value}</span>
      </p>
      {!compact ? (
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-zinc-500 sm:mt-1.5 sm:line-clamp-none sm:text-xs">
          {hint}
        </p>
      ) : (
        <p className="mt-0.5 truncate text-[9px] text-zinc-600">{hint}</p>
      )}
    </div>
  )
}
