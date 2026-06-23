'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatScoreDisplay } from '@/lib/running-league/scoring'
import type { RunningLeagueRankRow } from '@/lib/running-league/scoring'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface RunningLeagueLeaderboardProps {
  rows: RunningLeagueRankRow[]
  title?: string
  emptyMessage?: string
  highlightMemberId?: string | null
  /** 회원 화면: 접이식, 이름·총점만 */
  compact?: boolean
  className?: string
  id?: string
}

export function RunningLeagueLeaderboard({
  rows,
  title = '순위표',
  emptyMessage = '참가자가 없습니다.',
  highlightMemberId = null,
  compact = false,
  className,
  id = 'running-league-leaderboard',
}: RunningLeagueLeaderboardProps) {
  const [open, setOpen] = useState(!compact)

  if (rows.length === 0) {
    return (
      <Card className={className} id={id}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    )
  }

  const list = (
    <div className="space-y-2">
      {rows.map((row) => {
        const isMe = highlightMemberId != null && row.memberId === highlightMemberId
        return (
          <div
            key={row.participantId}
            className={cn(
              'flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm',
              isMe && 'border-primary/40 bg-primary/5',
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  isMe ? 'bg-primary/10 text-primary' : 'bg-muted',
                )}
              >
                {row.rank}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {row.memberName}
                  {isMe ? <span className="ml-1 text-xs text-primary">나</span> : null}
                </p>
                {!compact && row.goalLevel ? (
                  <p className="truncate text-[11px] text-muted-foreground">{row.goalLevel}</p>
                ) : null}
              </div>
            </div>
            <span className="shrink-0 font-semibold text-primary">
              {formatScoreDisplay(row.totalScore)}
            </span>
          </div>
        )
      })}
    </div>
  )

  if (compact) {
    return (
      <Card className={className} id={id}>
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          onClick={() => setOpen((value) => !value)}
        >
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">
              참가자의 이름과 총점만 표시됩니다.
              <span className="mt-0.5 block">
                통증·컨디션 정보는 공개되지 않습니다.
              </span>
            </p>
          </div>
          <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
        </button>
        {open ? <CardContent className="space-y-2 border-t pt-3">{list}</CardContent> : null}
      </Card>
    )
  }

  return (
    <Card className={className} id={id}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{list}</CardContent>
    </Card>
  )
}
