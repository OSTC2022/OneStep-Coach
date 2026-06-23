'use client'

import { TrendingUp, Zap } from 'lucide-react'
import { formatRankingMemberName } from '@/lib/running-league/mask-member-name'
import type { LeagueMomentumMember } from '@/lib/running-league/league-momentum'
import { cn } from '@/lib/utils'

function MomentumMemberButton({
  item,
  highlightMemberId,
  onMemberSelect,
  className,
}: {
  item: LeagueMomentumMember
  highlightMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  className?: string
}) {
  const isMe = highlightMemberId != null && item.memberId === highlightMemberId

  return (
    <button
      type="button"
      onClick={() => onMemberSelect?.(item.memberId, item.memberName)}
      className={cn(
        'flex min-w-0 w-full flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
        isMe
          ? 'border-lime-400/40 bg-lime-500/12 hover:bg-lime-500/16'
          : 'border-lime-500/15 bg-black/30 hover:border-lime-500/30 hover:bg-black/40',
        className,
      )}
    >
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

export function MemberLeagueMomentumStrip({
  topRiser,
  recentPbUpdates,
  highlightMemberId,
  onMemberSelect,
  rankingViewLabel,
  className,
}: {
  topRiser: LeagueMomentumMember | null
  recentPbUpdates: LeagueMomentumMember[]
  highlightMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  rankingViewLabel?: string
  className?: string
}) {
  if (!topRiser && recentPbUpdates.length === 0) return null

  return (
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

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {topRiser ? (
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
              이번 달 가장 많이 오른 회원
            </div>
            <MomentumMemberButton
              item={topRiser}
              highlightMemberId={highlightMemberId}
              onMemberSelect={onMemberSelect}
            />
          </div>
        ) : null}

        {recentPbUpdates.length > 0 ? (
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
              <Zap className="h-3.5 w-3.5 text-lime-400" aria-hidden />
              최근 PB 갱신
            </div>
            <div className="space-y-2">
              {recentPbUpdates.map((item) => (
                <MomentumMemberButton
                  key={item.memberId}
                  item={item}
                  highlightMemberId={highlightMemberId}
                  onMemberSelect={onMemberSelect}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
