'use client'

import type { RankAspirationInsight } from '@/lib/running-league/rank-aspiration'
import { cn } from '@/lib/utils'

export function MemberRankAspirationPanel({
  insight,
  className,
  compact = false,
}: {
  insight: RankAspirationInsight | null
  className?: string
  compact?: boolean
}) {
  if (!insight) return null
  if (!insight.nextRankLine && !insight.topTargetLine) return null

  return (
    <div
      className={cn(
        'rounded-xl border border-lime-400/30 bg-gradient-to-br from-lime-500/12 to-black/30',
        compact ? 'px-3 py-2.5' : 'px-3.5 py-3',
        className,
      )}
    >
      <p
        className={cn(
          'font-semibold tabular-nums text-lime-100',
          compact ? 'text-sm' : 'text-base',
        )}
      >
        {insight.headline}
      </p>
      <div className={cn('space-y-1', compact ? 'mt-1' : 'mt-1.5')}>
        {insight.nextRankLine ? (
          <p className="text-xs leading-relaxed text-lime-200/95 sm:text-sm">
            {insight.nextRankLine}
          </p>
        ) : null}
        {insight.topTargetLine ? (
          <p className="text-xs leading-relaxed text-zinc-400 sm:text-sm">{insight.topTargetLine}</p>
        ) : null}
      </div>
    </div>
  )
}
