'use client'

import { useMemo, type ReactNode } from 'react'
import { MemberRankingCharts, type GraphChartTab } from '@/components/dashboard/member-ranking-charts'
import { buildLeagueAggregateRankComparisonChart } from '@/lib/running-league/league-rank-comparison'
import {
  buildLeagueAggregateMileageRankComparisonChart,
  buildLeagueMileageComparisonChart,
} from '@/lib/running-league/league-mileage-comparison'
import { buildLeaguePbRecordComparisonChart } from '@/lib/running-league/league-pb-record-comparison'
import { filterPortalPbTrendRecords } from '@/lib/running-league/ranking-hub'
import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { filterParticipantsByGender, type RankingGenderFilter } from '@/lib/running-league/ranking-gender'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'

type RankingView = 'pb' | 'mileage'

interface PortalAggregateGraphPanelProps {
  rankingView: RankingView
  genderFilter: RankingGenderFilter
  pbDistance: PbLeaderboardDistance
  rankingBundle: MemberRunningLeagueRankingBundle | null
  graphChartTab: GraphChartTab
  onGraphChartTabChange: (tab: GraphChartTab) => void
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

  const comparisonChart = useMemo(() => {
    if (!rankingBundle) return null
    if (rankingView === 'pb') {
      return buildLeagueAggregateRankComparisonChart({
        distance: pbDistance,
        participants: filteredParticipants,
        records: portalPbRecords,
      })
    }
    return buildLeagueAggregateMileageRankComparisonChart({
      participants: filteredParticipants,
      logs: rankingBundle.mileageLogs,
    })
  }, [filteredParticipants, pbDistance, portalPbRecords, rankingBundle, rankingView])

  const mileageComparisonChart = useMemo(() => {
    if (!rankingBundle || rankingView !== 'mileage') return null
    return buildLeagueMileageComparisonChart({
      participants: filteredParticipants,
      logs: rankingBundle.mileageLogs,
    })
  }, [filteredParticipants, rankingBundle, rankingView])

  const pbRecordComparisonChart = useMemo(() => {
    if (!rankingBundle || rankingView !== 'pb') return null
    return buildLeaguePbRecordComparisonChart({
      distance: pbDistance,
      participants: filteredParticipants,
      records: portalPbRecords,
    })
  }, [filteredParticipants, pbDistance, portalPbRecords, rankingBundle, rankingView])

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
          comparisonChart={comparisonChart}
          mileageComparisonChart={mileageComparisonChart}
          pbRecordComparisonChart={pbRecordComparisonChart}
          mode={rankingView}
          aggregateMode
          compact
          activeTab={graphChartTab}
          onActiveTabChange={onGraphChartTabChange}
        />
      </div>
    </div>
  )
}
