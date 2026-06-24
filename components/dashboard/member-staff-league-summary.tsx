'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import { MemberLeagueStatusCard } from '@/components/dashboard/member-league-status-card'
import { MemberMileageLogDialog } from '@/components/dashboard/member-mileage-log-dialog'
import { MemberRunningPbDialog } from '@/components/dashboard/member-running-pb-panel'
import { Button } from '@/components/ui/button'
import type { MemberRunningLeagueHome } from '@/lib/actions/running-league'
import { buildFilteredPortalRankings } from '@/lib/running-league/ranking-hub'
import { buildMemberLeagueStatusSnapshot } from '@/lib/running-league/league-status-summary'

export function MemberStaffLeagueSummary({
  memberId,
  runningLeagueHome,
  canManage = false,
  runningPortalHref,
}: {
  memberId: string
  runningLeagueHome: MemberRunningLeagueHome | null
  canManage?: boolean
  runningPortalHref: string
}) {
  const [pbDialogOpen, setPbDialogOpen] = useState(false)
  const [mileageDialogOpen, setMileageDialogOpen] = useState(false)

  const filtered = useMemo(() => {
    if (!runningLeagueHome?.rankingBundle) return null
    return buildFilteredPortalRankings(runningLeagueHome.rankingBundle, 'all')
  }, [runningLeagueHome?.rankingBundle])

  const snapshot = useMemo(() => {
    if (!runningLeagueHome?.rankingBundle || !runningLeagueHome.participant) return null
    return buildMemberLeagueStatusSnapshot({
      memberId,
      rankingView: 'pb',
      pbDistance: '5km',
      participant: runningLeagueHome.participant,
      pbLeaderboard: filtered?.pbByDistance['5km'] ?? { ranked: [], unranked: [] },
      mileageLeaderboard: filtered?.mileageLeaderboard ?? { ranked: [], unranked: [] },
      mileageLogs: runningLeagueHome.mileageLogs,
      pbRecords: runningLeagueHome.pbRecords,
      participants: runningLeagueHome.rankingBundle.participants,
    })
  }, [filtered, memberId, runningLeagueHome])

  if (!runningLeagueHome?.league || !snapshot) return null

  const canEdit =
    canManage &&
    runningLeagueHome.tableReady &&
    runningLeagueHome.participant != null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-lime-200/90">러닝 리그 요약</p>
        <Button asChild variant="outline" size="sm" className="border-lime-500/30 text-lime-100">
          <Link href={runningPortalHref}>
            러닝 포털 전체 보기
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <MemberLeagueStatusCard snapshot={snapshot} showMyRankBadge={false} />

      {canEdit ? (
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            className="min-h-12 w-full bg-lime-500 text-base font-bold text-black hover:bg-lime-400"
            onClick={() => setMileageDialogOpen(true)}
          >
            <Plus className="mr-1.5 h-5 w-5" />
            오늘 러닝 기록 추가
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-zinc-400 hover:text-lime-200"
            onClick={() => setPbDialogOpen(true)}
          >
            PB 등록/수정
          </Button>
        </div>
      ) : null}

      <MemberRunningPbDialog
        participant={runningLeagueHome.participant}
        pbRecords={runningLeagueHome.pbRecords}
        tableReady={runningLeagueHome.tableReady}
        open={pbDialogOpen}
        onOpenChange={setPbDialogOpen}
        readOnly={!canEdit}
      />
      <MemberMileageLogDialog
        participant={runningLeagueHome.participant}
        mileageLogs={runningLeagueHome.mileageLogs}
        tableReady={runningLeagueHome.tableReady}
        open={mileageDialogOpen}
        onOpenChange={setMileageDialogOpen}
        readOnly={!canEdit}
      />
    </div>
  )
}
