'use client'

import { CalendarDays, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RankingPeriod } from '@/lib/running-league/ranking-period'

export function RankingPeriodHeader({
  period,
  monthKey,
  autoMonth,
  caption,
  onMonthKeyChange,
  onResetMonth,
  className,
  showPeriodPicker = true,
  distanceLabel,
  distanceAccentClass,
  gapLabel,
  gapAccentClass,
}: {
  period: RankingPeriod
  monthKey: string
  autoMonth: boolean
  caption?: string | null
  onMonthKeyChange: (monthKey: string) => void
  onResetMonth: () => void
  className?: string
  showPeriodPicker?: boolean
  distanceLabel?: string | null
  distanceAccentClass?: string
  gapLabel?: string | null
  gapAccentClass?: string
}) {
  const captionText = caption?.trim()

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-2', className)}>
      <span className="shrink-0 text-sm font-semibold text-lime-100">랭킹</span>

      {gapLabel ? (
        <span className={cn('shrink-0 text-sm font-bold tabular-nums', gapAccentClass)}>
          {gapLabel}
        </span>
      ) : null}

      {showPeriodPicker ? (
        <>
          <label className="relative flex min-w-0 shrink-0 items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
            <span className="truncate text-sm font-medium text-zinc-400">{period.label}</span>
            <input
              type="month"
              value={monthKey}
              onChange={(event) => {
                if (event.target.value) onMonthKeyChange(event.target.value)
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="랭킹 기준 월 선택"
            />
          </label>

          {!autoMonth ? (
            <button
              type="button"
              onClick={onResetMonth}
              className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              title="월별 자동(당월)으로 되돌리기"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              자동
            </button>
          ) : null}
        </>
      ) : distanceLabel && !gapLabel ? (
        <span className={cn('shrink-0 text-sm font-semibold', distanceAccentClass)}>
          {distanceLabel}
        </span>
      ) : null}

      {captionText ? (
        <span className="ml-auto hidden min-w-0 truncate text-right text-xs font-medium text-lime-200/80 sm:block">
          {captionText}
        </span>
      ) : null}
    </div>
  )
}

export function RankingPeriodCaptionMobile({ caption }: { caption?: string | null }) {
  const captionText = caption?.trim()
  if (!captionText) return null
  return (
    <p className="truncate border-b border-lime-500/10 px-3 py-1.5 text-right text-[11px] font-medium text-lime-200/75 sm:hidden">
      {captionText}
    </p>
  )
}
