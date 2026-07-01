'use client'

import { cn } from '@/lib/utils'
import { BeatRivalFireBadge } from '@/components/dashboard/beat-rival-badges'
import { formatRankingMemberName } from '@/lib/running-league/mask-member-name'

/** 이름 · 상태메시지(가운데 유동열) · km */
export const RANKING_ROW_GRID_CLASS =
  'grid min-w-0 w-full grid-cols-[auto_auto_max-content_minmax(0,1fr)_5rem] items-center gap-x-1.5'

export const RANKING_ROW_GRID_SELECTED_CLASS =
  'grid min-w-0 w-full grid-cols-[auto_auto_max-content_minmax(0,1fr)_5rem_auto] items-center gap-x-1.5'

export const RANKING_PB_ROW_GRID_CLASS =
  'grid min-w-0 w-full grid-cols-[auto_auto_max-content_minmax(0,1fr)_auto_5rem] items-center gap-x-1.5'

export const RANKING_PB_ROW_GRID_SELECTED_CLASS =
  'grid min-w-0 w-full grid-cols-[auto_auto_max-content_minmax(0,1fr)_auto_5rem_auto] items-center gap-x-1.5'

export function resolveRankingRowGridClass(options: {
  showDistanceLabel?: boolean
  isSelected?: boolean
}) {
  if (options.showDistanceLabel) {
    return options.isSelected ? RANKING_PB_ROW_GRID_SELECTED_CLASS : RANKING_PB_ROW_GRID_CLASS
  }
  return options.isSelected ? RANKING_ROW_GRID_SELECTED_CLASS : RANKING_ROW_GRID_CLASS
}

export function RankingMemberNameBlock({
  memberName,
  beatRivalMemberId,
  rowMemberId,
  showBeatRivalLabel = false,
  className,
}: {
  memberName: string
  beatRivalMemberId?: string | null
  rowMemberId: string
  showBeatRivalLabel?: boolean
  className?: string
}) {
  const showBeatRival = showBeatRivalLabel && beatRivalMemberId === rowMemberId

  return (
    <span className={cn('max-w-[10.5rem] min-w-0 justify-self-start overflow-hidden font-medium', className)}>
      <span className="inline-flex max-w-full items-center gap-1">
        <span className="min-w-0 shrink truncate">{formatRankingMemberName(memberName)}</span>
        {showBeatRival ? <BeatRivalFireBadge className="flex-none" /> : null}
      </span>
    </span>
  )
}

import {
  DEFAULT_RANKING_STATUS_MESSAGE_COLOR,
  normalizeRankingStatusMessageColor,
} from '@/lib/running-league/ranking-status-message'

export function RankingStatusMessageSlot({
  message,
  color,
}: {
  message?: string | null
  color?: string | null
}) {
  const text = message?.trim()
  const resolvedColor = normalizeRankingStatusMessageColor(
    color ?? DEFAULT_RANKING_STATUS_MESSAGE_COLOR,
  )

  return (
    <span className="grid w-full min-w-0 grid-cols-[1.4fr_auto_2fr] items-center overflow-hidden">
      <span aria-hidden />
      <span
        className="max-w-[8.5rem] truncate text-center text-[10px] font-normal leading-tight"
        style={{ color: resolvedColor }}
        title={text || undefined}
        aria-hidden={!text}
      >
        {text || ''}
      </span>
      <span aria-hidden />
    </span>
  )
}
