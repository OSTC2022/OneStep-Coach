'use client'

import { useMemo, type ReactNode } from 'react'
import { MemberRankingCharts, type GraphChartTab } from '@/components/dashboard/member-ranking-charts'
import { buildLeagueAggregateRankComparisonChart } from '@/lib/running-league/league-rank-comparison'
import { buildLeagueMileageComparisonChart } from '@/lib/running-league/league-mileage-comparison'
import { buildLeaguePbRecordComparisonChart } from '@/lib/running-league/league-pb-record-comparison'
import { filterPortalPbTrendRecords } from '@/lib/running-league/ranking-hub'
import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { filterParticipantsByGender, type RankingGenderFilter } from '@/lib/running-league/ranking-gender'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import type { RankingView } from '@/lib/running-league/ranking-view'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'

interface PortalAggregateGraphPanelProps {
  rankingView: RankingView
  genderFilter: RankingGenderFilter
  pbDistance: PbLeaderboardDistance
  rankingBundle: MemberRunningLeagueRankingBundle | null
  graphChartTab: GraphChartTab
  onGraphChartTabChange: (tab: GraphChartTab) => void
  beatRivalMemberId?: string | null
  mobileFilterSlot?: ReactNode
  className?: string
}

export function PortalAggregateGraphPanel({
  rankingView,
  genderFilter,
  pbDistance,
  rankingBundle,
  graphChartTab,
  onGraphChartTabChange,
  beatRivalMemberId = null,
  mobileFilterSlot = null,
  className,
}: PortalAggregateGraphPanelProps) {
  const filteredParticipants = useMemo(() => {
    if (!rankingBundle) return []
    return filterParticipantsByGender(rankingBundle.participants, genderFilter)
  }, [genderFilter, rankingBundle])

  const portalPbRecords = useMemo(
    () => (rankingBundle ? filterPortalPbTrendRecords(rankingBundle.pbRecords) : []),
    [rankingBundle],
  )

  const pbRankComparisonChart = useMemo(() => {
    if (!rankingBundle) return null
    return buildLeagueAggregateRankComparisonChart({
      distance: pbDistance,
      participants: filteredParticipants,
      records: portalPbRecords,
    })
  }, [filteredParticipants, pbDistance, portalPbRecords, rankingBundle])

  const mileageComparisonChart = useMemo(() => {
    if (!rankingBundle) return null
    return buildLeagueMileageComparisonChart({
      participants: filteredParticipants,
      logs: rankingBundle.mileageLogs,
      beatRivalMemberId,
    })
  }, [beatRivalMemberId, filteredParticipants, rankingBundle])

  const pbRecordComparisonChart = useMemo(() => {
    if (!rankingBundle) return null
    return buildLeaguePbRecordComparisonChart({
      distance: pbDistance,
      participants: filteredParticipants,
      records: portalPbRecords,
    })
  }, [filteredParticipants, pbDistance, portalPbRecords, rankingBundle])

  return (
    <div className={cn(MEMBER_PORTAL_CARD_CLASS, className)}>
      {mobileFilterSlot}
      <div className="space-y-2 p-2.5">
        <p className="text-center text-[11px] text-zinc-500">
          전체 회원 그래프 · 랭킹에서 이름을 누르면 개인 그래프로 전환됩니다
        </p>
        <MemberRankingCharts
          key={`aggregate-${rankingView}-${pbDistance}-${genderFilter}`}
          points={[]}
          mileagePoints={[]}
          mileageRankPoints={[]}
          comparisonChart={pbRankComparisonChart}
          mileageComparisonChart={mileageComparisonChart}
          pbRecordComparisonChart={pbRecordComparisonChart}
          mode={rankingView}
          aggregateMode
          compact
          activeTab={graphChartTab}
          onActiveTabChange={onGraphChartTabChange}
          beatRivalMemberId={beatRivalMemberId}
        />
      </div>
    </div>
  )
}
