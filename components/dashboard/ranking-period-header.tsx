'use client'

import { CalendarDays } from 'lucide-react'
import { BeatRivalFireBadge } from '@/components/dashboard/beat-rival-badges'
import type { BeatRivalMileageGap } from '@/lib/running-league/beat-rival-gap'
import { formatRankingMemberName } from '@/lib/running-league/mask-member-name'
import { cn } from '@/lib/utils'
import type { RankingPeriod } from '@/lib/running-league/ranking-period'
import {
  resolvePortalTextPresentation,
  type PortalTextStyleConfig,
} from '@/lib/running-league/adult-running-portal-styles'

export function RankingPeriodHeader({
  period,
  caption,
  className,
  showPeriodLabel = true,
  distanceLabel,
  distanceAccentClass,
  gapLabel,
  gapAccentClass,
  beatRivalName,
  beatRivalGap,
  beatRivalGapLabel,
  captionStyle,
}: {
  period: RankingPeriod
  caption?: string | null
  className?: string
  showPeriodLabel?: boolean
  distanceLabel?: string | null
  distanceAccentClass?: string
  gapLabel?: string | null
  gapAccentClass?: string
  beatRivalName?: string | null
  beatRivalGap?: BeatRivalMileageGap | null
  beatRivalGapLabel?: string | null
  captionStyle?: PortalTextStyleConfig | null
}) {
  const captionText = caption?.trim()
  const captionPresentation = resolvePortalTextPresentation(captionStyle, {
    className: 'text-xs font-medium text-lime-200/80',
  })
  const rivalName = beatRivalName?.trim()
  const rivalGapLabel = beatRivalGapLabel?.trim() || beatRivalGap?.gapText || null

  return (
    <div className={cn('flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <span className="shrink-0 text-sm font-semibold text-lime-100">랭킹</span>

      {rivalName ? (
        <span className="inline-flex max-w-[9rem] shrink-0 items-center gap-1 rounded-full border border-orange-500/35 bg-orange-500/10 px-2 py-0.5 sm:max-w-[11rem]">
          <span className="truncate text-[11px] font-semibold text-orange-100">
            {formatRankingMemberName(rivalName)}
          </span>
          <BeatRivalFireBadge className="text-[9px]" />
        </span>
      ) : null}

      {rivalName && rivalGapLabel ? (
        <span
          className={cn(
            'shrink-0 text-sm font-bold tabular-nums transition-colors duration-300',
            beatRivalGap?.accentClass,
          )}
          title="이겨라 대상과의 이번 달 마일리지 격차"
        >
          {rivalGapLabel}
        </span>
      ) : null}

      {gapLabel ? (
        <span className={cn('shrink-0 text-[11px] font-medium sm:text-xs', gapAccentClass)}>
          {gapLabel}
        </span>
      ) : null}

      {distanceLabel && !gapLabel ? (
        <span className={cn('shrink-0 text-sm font-semibold', distanceAccentClass)}>
          {distanceLabel}
        </span>
      ) : null}

      {showPeriodLabel ? (
        <span className="flex min-w-0 shrink-0 items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
          <span className="truncate text-sm font-medium text-zinc-400">{period.label}</span>
        </span>
      ) : null}

      {captionText ? (
        <span
          className={cn(
            'hidden min-w-0 basis-full truncate sm:ml-auto sm:block sm:basis-auto',
            captionStyle?.textAlign === 'left'
              ? 'mr-auto text-left'
              : captionStyle?.textAlign === 'center'
                ? 'mx-auto text-center'
                : 'sm:text-right',
            captionPresentation.className,
          )}
          style={captionPresentation.style}
        >
          {captionText}
        </span>
      ) : null}
    </div>
  )
}

export function RankingPeriodCaptionMobile({
  caption,
  captionStyle,
}: {
  caption?: string | null
  captionStyle?: PortalTextStyleConfig | null
}) {
  const captionText = caption?.trim()
  if (!captionText) return null
  const captionPresentation = resolvePortalTextPresentation(captionStyle, {
    className: 'text-[11px] font-medium text-lime-200/75',
  })
  return (
    <p
      className={cn(
        'truncate border-b border-lime-500/10 px-3 py-1.5 sm:hidden',
        captionPresentation.className,
        captionStyle?.textAlign === 'left'
          ? 'text-left'
          : captionStyle?.textAlign === 'center'
            ? 'text-center'
            : 'text-right',
      )}
      style={captionPresentation.style}
    >
      {captionText}
    </p>
  )
}
