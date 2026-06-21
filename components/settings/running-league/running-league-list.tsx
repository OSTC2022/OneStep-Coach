'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronRight, Plus, Trophy } from 'lucide-react'
import type { RunningLeague, RunningLeagueStatus } from '@/lib/types'
import {
  RUNNING_LEAGUE_STATUS_LABELS,
  statusBadgeClass,
  targetGroupLabel,
} from '@/lib/running-league/constants'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type StatusFilter = RunningLeagueStatus | 'all'

const FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'draft', label: '예정' },
  { value: 'active', label: '진행중' },
  { value: 'closed', label: '종료' },
]

interface RunningLeagueListProps {
  leagues: RunningLeague[]
  tableReady: boolean
}

function formatDate(value: string): string {
  try {
    return format(parseISO(value), 'yyyy.MM.dd', { locale: ko })
  } catch {
    return value
  }
}

export function RunningLeagueList({ leagues, tableReady }: RunningLeagueListProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const filteredLeagues = useMemo(() => {
    if (statusFilter === 'all') return leagues
    return leagues.filter((league) => league.status === statusFilter)
  }, [leagues, statusFilter])

  if (!tableReady) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          러닝 리그 DB가 준비되지 않았습니다. Supabase에서{' '}
          <code className="rounded bg-muted px-1">add-running-league-tables.sql</code>과{' '}
          <code className="rounded bg-muted px-1">expand-running-league-schema.sql</code>을 실행해주세요.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={statusFilter === option.value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/dashboard/settings/running-league/new">
            <Plus className="mr-1 h-4 w-4" />
            새 챌린지 생성
          </Link>
        </Button>
      </div>

      {filteredLeagues.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Trophy className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">표시할 챌린지가 없습니다.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                새 챌린지를 생성해 성인 러닝 리그를 시작하세요.
              </p>
            </div>
            <Button asChild size="sm">
              <Link href="/dashboard/settings/running-league/new">챌린지 만들기</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredLeagues.map((league) => (
            <Link key={league.id} href={`/dashboard/settings/running-league/${league.id}`}>
              <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/20">
                <CardHeader className="space-y-3 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="line-clamp-2 text-base leading-snug">
                      {league.title}
                    </CardTitle>
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        statusBadgeClass(league.status),
                      )}
                    >
                      {RUNNING_LEAGUE_STATUS_LABELS[league.status]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(league.starts_at)} ~ {formatDate(league.ends_at)}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="line-clamp-2 text-sm text-muted-foreground">{league.description}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>대상: {targetGroupLabel(league.target_group)}</span>
                    <span className="inline-flex items-center text-primary">
                      상세 보기
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
