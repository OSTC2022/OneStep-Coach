'use client'

import { cn } from '@/lib/utils'
import { BeatRivalFireBadge } from '@/components/dashboard/beat-rival-badges'
import { formatRankingMemberName } from '@/lib/running-league/mask-member-name'
import {
  DEFAULT_RANKING_STATUS_MESSAGE_COLOR,
  normalizeRankingStatusMessageColor,
} from '@/lib/running-league/ranking-status-message'

/**
 * 랭킹 행 공통 그리드 — 모든 탭(마일리지·이겨라·출석왕·PB) 동일
 * [변동][메달][이름][상태메시지][기록](+선택 시 chevron)
 * 상태메시지 열에 minmax 최소폭을 둬 PB 외 탭에서도 메시지가 안 사라지게 함
 */
export const RANKING_ROW_GRID_CLASS =
  'grid min-w-0 w-full grid-cols-[auto_auto_minmax(0,7.5rem)_minmax(4.5rem,1fr)_5rem] items-center gap-x-1.5'

export const RANKING_ROW_GRID_SELECTED_CLASS =
  'grid min-w-0 w-full grid-cols-[auto_auto_minmax(0,7.5rem)_minmax(4.5rem,1fr)_5rem_auto] items-center gap-x-1.5'

export const RANKING_PB_ROW_GRID_CLASS =
  'grid min-w-0 w-full grid-cols-[auto_auto_minmax(0,7.5rem)_minmax(4.5rem,1fr)_auto_5rem] items-center gap-x-1.5'

export const RANKING_PB_ROW_GRID_SELECTED_CLASS =
  'grid min-w-0 w-full grid-cols-[auto_auto_minmax(0,7.5rem)_minmax(4.5rem,1fr)_auto_5rem_auto] items-center gap-x-1.5'

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
    <span className={cn('min-w-0 justify-self-start overflow-hidden font-medium', className)}>
      <span className="inline-flex max-w-full items-center gap-1">
        <span className="min-w-0 shrink truncate">{formatRankingMemberName(memberName)}</span>
        {showBeatRival ? <BeatRivalFireBadge className="flex-none" /> : null}
      </span>
    </span>
  )
}

export function RankingStatusMessageSlot({
  message,
  color,
  className,
}: {
  message?: string | null
  color?: string | null
  className?: string
}) {
  const text = message?.trim()
  const resolvedColor = normalizeRankingStatusMessageColor(
    color ?? DEFAULT_RANKING_STATUS_MESSAGE_COLOR,
  )

  return (
    <span
      className={cn(
        'min-w-0 justify-self-stretch truncate text-center text-[10px] font-normal leading-tight',
        className,
      )}
      style={{ color: resolvedColor }}
      title={text || undefined}
      aria-hidden={!text}
    >
      {text || '\u00A0'}
    </span>
  )
}
