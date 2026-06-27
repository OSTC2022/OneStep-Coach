'use client'

import { useState } from 'react'
import { Flame, TrendingUp, Zap } from 'lucide-react'
import { formatRankingMemberName } from '@/lib/running-league/mask-member-name'
import {
  getLeagueHotIssueLabel,
  type LeagueMomentumKind,
  type LeagueMomentumMember,
} from '@/lib/running-league/league-momentum'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function hotIssueIcon(kind: LeagueMomentumKind) {
  switch (kind) {
    case 'pb_update':
      return Zap
    case 'mileage_surge':
      return Flame
    default:
      return TrendingUp
  }
}

function hotIssueAccent(kind: LeagueMomentumKind) {
  switch (kind) {
    case 'pb_update':
      return 'text-lime-400'
    case 'mileage_surge':
      return 'text-orange-300'
    case 'mileage_riser':
      return 'text-sky-400'
    default:
      return 'text-emerald-400'
  }
}

function HotIssueCard({
  item,
  highlightMemberId,
  onClick,
}: {
  item: LeagueMomentumMember
  highlightMemberId?: string | null
  onClick: () => void
}) {
  const isMe = highlightMemberId != null && item.memberId === highlightMemberId
  const Icon = hotIssueIcon(item.kind)
  const label = getLeagueHotIssueLabel(item.kind)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-0 w-full flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
        isMe
          ? 'border-lime-400/40 bg-lime-500/12 hover:bg-lime-500/16'
          : 'border-lime-500/15 bg-black/30 hover:border-lime-500/30 hover:bg-black/40',
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', hotIssueAccent(item.kind))} aria-hidden />
        <span className="truncate text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </span>
      </div>
      <span className="truncate text-sm font-semibold text-lime-50">
        {formatRankingMemberName(item.memberName, { isMe })}
        {isMe ? <span className="ml-1.5 text-[10px] font-medium text-lime-300">나</span> : null}
      </span>
      <span className="truncate text-xs font-medium tabular-nums text-lime-200/90">
        {item.headline}
      </span>
      <span className="truncate text-[11px] text-zinc-500">{item.detail}</span>
    </button>
  )
}

function HotIssueDetailDialog({
  item,
  open,
  onOpenChange,
  highlightMemberId,
  onViewDetail,
}: {
  item: LeagueMomentumMember | null
  open: boolean
  onOpenChange: (open: boolean) => void
  highlightMemberId?: string | null
  onViewDetail: (item: LeagueMomentumMember) => void
}) {
  if (!item) return null

  const isMe = highlightMemberId != null && item.memberId === highlightMemberId
  const Icon = hotIssueIcon(item.kind)
  const label = getLeagueHotIssueLabel(item.kind)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="border-lime-500/20 bg-zinc-950 sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Icon className={cn('h-4 w-4', hotIssueAccent(item.kind))} aria-hidden />
            <DialogTitle className="text-base text-lime-100">{label}</DialogTitle>
          </div>
          <DialogDescription className="text-left text-zinc-400">
            이번 달 리그에서 주목할 만한 변화입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border border-lime-500/15 bg-black/30 px-4 py-3">
          <p className="text-lg font-bold text-lime-50">
            {formatRankingMemberName(item.memberName, { isMe })}
            {isMe ? <span className="ml-2 text-sm font-medium text-lime-300">나</span> : null}
          </p>
          <div className="space-y-1">
            <p className="text-sm font-semibold tabular-nums text-lime-200">{item.headline}</p>
            <p className="text-sm text-zinc-400">{item.detail}</p>
          </div>
          {item.pbDistance && item.kind !== 'pb_update' ? (
            <p className="text-xs text-zinc-500">거리: {item.headline}</p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="border-lime-500/25 text-zinc-300"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </Button>
          <Button
            type="button"
            className="bg-lime-500 text-black hover:bg-lime-400"
            onClick={() => {
              onViewDetail(item)
              onOpenChange(false)
            }}
          >
            그래프에서 자세히 보기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MemberLeagueMomentumStrip({
  hotIssues,
  topRiser,
  recentPbUpdates,
  highlightMemberId,
  onMemberSelect,
  onPbUpdateSelect,
  onHotIssueViewDetail,
  rankingViewLabel,
  className,
}: {
  hotIssues?: LeagueMomentumMember[]
  topRiser?: LeagueMomentumMember | null
  recentPbUpdates?: LeagueMomentumMember[]
  highlightMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  onPbUpdateSelect?: (item: LeagueMomentumMember) => void
  onHotIssueViewDetail?: (item: LeagueMomentumMember) => void
  rankingViewLabel?: string
  className?: string
}) {
  const [selectedIssue, setSelectedIssue] = useState<LeagueMomentumMember | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const issues =
    hotIssues && hotIssues.length > 0
      ? hotIssues
      : [
          ...(topRiser ? [topRiser] : []),
          ...(recentPbUpdates ?? []),
        ].slice(0, 4)

  if (issues.length === 0) return null

  function openDetail(item: LeagueMomentumMember) {
    setSelectedIssue(item)
    setDetailOpen(true)
  }

  function handleViewDetail(item: LeagueMomentumMember) {
    if (onHotIssueViewDetail) {
      onHotIssueViewDetail(item)
      return
    }
    if (item.kind === 'pb_update') {
      onPbUpdateSelect?.(item)
      return
    }
    onMemberSelect?.(item.memberId, item.memberName)
  }

  return (
    <>
      <div
        className={cn(
          'rounded-xl border border-lime-500/20 bg-gradient-to-br from-black/50 to-lime-500/[0.06] p-3 sm:p-4',
          className,
        )}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-lime-300/80">
          리그 하이라이트
          {rankingViewLabel ? (
            <span className="ml-1.5 font-normal normal-case text-zinc-500">· {rankingViewLabel}</span>
          ) : null}
        </p>

        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          {issues.map((item) => (
            <HotIssueCard
              key={`${item.kind}-${item.memberId}-${item.headline}`}
              item={item}
              highlightMemberId={highlightMemberId}
              onClick={() => openDetail(item)}
            />
          ))}
        </div>
      </div>

      <HotIssueDetailDialog
        item={selectedIssue}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        highlightMemberId={highlightMemberId}
        onViewDetail={handleViewDetail}
      />
    </>
  )
}
