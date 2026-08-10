'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Trophy } from 'lucide-react'
import type { AttendanceRankEntry } from '@/lib/actions/adult-general-portal'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RankMedalDisplay } from '@/components/dashboard/rank-medal'
import { cn } from '@/lib/utils'

function RankBadge({ rank }: { rank: number }) {
  if (rank >= 1 && rank <= 3) {
    return <RankMedalDisplay rank={rank} size="sm" />
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums text-muted-foreground">
      {rank}
    </span>
  )
}

export function AdultGeneralAttendanceRankingDialog({
  open,
  onOpenChange,
  entries,
  periodLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: AttendanceRankEntry[]
  periodLabel: string
}) {
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!open) setSearchQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (row) =>
        row.name.toLowerCase().includes(q) || (row.isCurrent && q === '나'),
    )
  }, [entries, searchQuery])

  const current = entries.find((row) => row.isCurrent) ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="flex max-h-[min(92dvh,780px)] flex-col gap-0 overflow-hidden border-primary/25 p-0 sm:max-w-xl"
      >
        <DialogHeader className="border-b border-primary/15 px-4 py-3 text-left sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-base text-primary">
            <Trophy className="h-4 w-4" />
            출석률 랭킹전
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {periodLabel} · 성인회원(일반) · 총 {entries.length}명
            {searchQuery.trim() && entries.length !== filtered.length
              ? ` (검색 ${filtered.length}/${entries.length})`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 border-b border-primary/10 px-4 py-2.5 sm:px-6">
          {current ? (
            <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5">
              <p className="text-[11px] font-medium text-primary">내 순위</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {current.rank}위 · 출석률 {current.rate}%
              </p>
              <p className="text-xs text-muted-foreground">
                출석 {current.presentCount}회 / 수업 {current.totalScheduled}회
              </p>
            </div>
          ) : null}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="이름 검색"
              className="h-10 border-primary/20 bg-background/80 pl-9 text-sm"
              aria-label="랭킹 이름 검색"
            />
          </div>
          {current ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 sm:w-auto"
              onClick={() => {
                document
                  .getElementById(`adult-general-rank-${current.memberId}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
            >
              내 순위 ({current.rank}위)로 이동
            </Button>
          ) : null}
        </div>

        <ScrollArea className="min-h-0 flex-1 px-4 py-4 sm:px-6">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {searchQuery.trim()
                ? '검색 결과가 없습니다.'
                : '최근 출석 데이터가 충분하지 않습니다. 수업에 참여하면 랭킹에 반영됩니다.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((row) => (
                <li
                  key={row.memberId}
                  id={`adult-general-rank-${row.memberId}`}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm',
                    row.isCurrent
                      ? 'border-primary/40 bg-primary/15'
                      : 'border-border/60 bg-card/40',
                  )}
                >
                  <RankBadge rank={row.rank} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {row.isCurrent ? `${row.name} (나)` : row.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      출석 {row.presentCount}회 / {row.totalScheduled}회
                    </p>
                  </div>
                  <span className="shrink-0 text-base font-semibold tabular-nums text-primary">
                    {row.rate}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
