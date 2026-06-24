'use client'

import { useMemo } from 'react'
import { X } from 'lucide-react'
import { MemberRankAspirationPanel } from '@/components/dashboard/member-rank-aspiration-panel'
import { MemberRankingCharts } from '@/components/dashboard/member-ranking-charts'
import { Button } from '@/components/ui/button'
import { formatPbDistanceLabel } from '@/lib/running-league/pb-distance-labels'
import {
  buildLeagueRankComparisonChart,
  formatRankComparisonCaption,
} from '@/lib/running-league/league-rank-comparison'
import { buildMemberMileageHistorySeries } from '@/lib/running-league/mileage-history'
import { buildMemberMileageRankHistorySeries } from '@/lib/running-league/mileage-rank-history'
import { formatRankingMemberName } from '@/lib/running-league/mask-member-name'
import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { buildMemberRankingHistorySeries } from '@/lib/running-league/ranking-history'
import { buildMemberGraphPanelSummary } from '@/lib/running-league/ranking-improvement-summary'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import { filterParticipantsByGender, type RankingGenderFilter } from '@/lib/running-league/ranking-gender'
import { summarizeRecordChangeChart } from '@/lib/running-league/ranking-improvement-summary'
import { cn } from '@/lib/utils'
import type { RankAspirationInsight } from '@/lib/running-league/rank-aspiration'

type RankingDetailView = 'pb' | 'mileage'

interface MemberRankingDetailPanelProps {
  memberId: string
  memberName: string
  distance: PbLeaderboardDistance
  rankingView?: RankingDetailView
  genderFilter: RankingGenderFilter
  rankingBundle: MemberRunningLeagueRankingBundle | null
  highlightMemberId?: string | null
  currentRank?: number | null
  totalRanked?: number
  isExplicitSelection?: boolean
  emphasized?: boolean
  embedded?: boolean
  onClose?: () => void
  className?: string
  aspirationInsight?: RankAspirationInsight | null
  soloComparisonHint?: string | null
}

function MemberGraphSummaryHeader({
  summary,
  isMe,
  isExplicitSelection,
}: {
  summary: ReturnType<typeof buildMemberGraphPanelSummary>
  isMe: boolean
  isExplicitSelection: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-4',
        isMe
          ? 'border-lime-400/40 bg-lime-500/12'
          : 'border-lime-500/25 bg-black/30',
      )}
    >
      <div className="space-y-1.5">
        <p className="text-xl font-bold leading-tight text-lime-50">
          {formatRankingMemberName(summary.displayName, { isMe })}
          {isMe && !isExplicitSelection ? (
            <span className="ml-2 text-sm font-medium text-lime-300/80">나</span>
          ) : null}
        </p>
        {summary.rankLine ? (
          <p className="text-sm font-medium text-zinc-200">{summary.rankLine}</p>
        ) : null}
        {summary.recordLine ? (
          <p className="text-sm tabular-nums text-lime-200/90">{summary.recordLine}</p>
        ) : null}
        {summary.improvementLine ? (
          <p className="text-sm font-semibold text-lime-300">{summary.improvementLine}</p>
        ) : null}
      </div>
      {isMe && !isExplicitSelection ? (
        <p className="mt-3 text-xs text-zinc-500">기본으로 내 그래프가 표시됩니다. 다른 회원을 눌러 비교할 수 있어요.</p>
      ) : null}
    </div>
  )
}

export function MemberRankingDetailPanel({
  memberId,
  memberName,
  distance,
  rankingView = 'pb',
  genderFilter,
  rankingBundle,
  highlightMemberId,
  currentRank = null,
  totalRanked = 0,
  isExplicitSelection = false,
  emphasized = true,
  embedded = false,
  onClose,
  className,
  aspirationInsight = null,
  soloComparisonHint = null,
}: MemberRankingDetailPanelProps) {
  const isMe = highlightMemberId != null && memberId === highlightMemberId

  const historyPoints = useMemo(() => {
    if (!rankingBundle) return []
    const participants = filterParticipantsByGender(rankingBundle.participants, genderFilter)
    return buildMemberRankingHistorySeries({
      memberId,
      distance,
      participants,
      records: rankingBundle.pbRecords,
    })
  }, [distance, genderFilter, memberId, rankingBundle])

  const filteredParticipants = useMemo(() => {
    if (!rankingBundle) return []
    return filterParticipantsByGender(rankingBundle.participants, genderFilter)
  }, [genderFilter, rankingBundle])

  const comparisonChart = useMemo(() => {
    if (!rankingBundle) return null
    return buildLeagueRankComparisonChart({
      selectedMemberId: memberId,
      distance,
      participants: filteredParticipants,
      records: rankingBundle.pbRecords,
      highlightMemberId,
    })
  }, [distance, filteredParticipants, highlightMemberId, memberId, rankingBundle])

  const recordSummary = useMemo(
    () => summarizeRecordChangeChart(historyPoints),
    [historyPoints],
  )

  const rankCaption = useMemo(
    () => formatRankComparisonCaption(historyPoints, formatPbDistanceLabel(distance)),
    [distance, historyPoints],
  )

  const mileagePoints = useMemo(() => {
    if (!rankingBundle) return []
    return buildMemberMileageHistorySeries(memberId, rankingBundle.mileageLogs)
  }, [memberId, rankingBundle])

  const mileageRankPoints = useMemo(() => {
    if (!rankingBundle) return []
    return buildMemberMileageRankHistorySeries({
      memberId,
      participants: filteredParticipants,
      logs: rankingBundle.mileageLogs,
    })
  }, [filteredParticipants, memberId, rankingBundle])

  const graphSummary = useMemo(
    () =>
      buildMemberGraphPanelSummary({
        memberName,
        isMe,
        rankingView,
        distanceLabel: formatPbDistanceLabel(distance),
        currentRank,
        totalRanked,
        historyPoints,
        mileageTotalKm: mileagePoints[mileagePoints.length - 1]?.cumulativeKm ?? null,
      }),
    [
      currentRank,
      distance,
      historyPoints,
      isMe,
      memberName,
      mileagePoints,
      rankingView,
      totalRanked,
    ],
  )

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-xl border transition-all duration-300',
        embedded
          ? cn(
              'bg-zinc-950/90',
              emphasized
                ? 'border-lime-400/45 shadow-[0_0_28px_rgba(163,230,53,0.12)] ring-2 ring-lime-400/20'
                : 'border-lime-500/25',
            )
          : 'border-lime-400/35 bg-zinc-950/80 ring-1 ring-lime-400/15',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-lime-500/15 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-lime-300/80">그래프 · 성장 분석</p>
          {!isMe && isExplicitSelection && onClose ? (
            <p className="mt-0.5 text-[11px] text-zinc-500">다른 회원 보는 중</p>
          ) : null}
        </div>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-zinc-400 hover:text-lime-200"
            onClick={onClose}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            {isMe ? '닫기' : '내 그래프'}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 py-4 sm:px-5">
        <MemberGraphSummaryHeader
          summary={graphSummary}
          isMe={isMe}
          isExplicitSelection={isExplicitSelection}
        />

        {isMe && aspirationInsight ? (
          <MemberRankAspirationPanel insight={aspirationInsight} compact />
        ) : null}

        <MemberRankingCharts
          key={`${memberId}-${rankingView}-${distance}`}
          points={historyPoints}
          mileagePoints={mileagePoints}
          mileageRankPoints={mileageRankPoints}
          comparisonChart={comparisonChart}
          recordSummary={recordSummary}
          rankCaption={rankCaption}
          mode={rankingView}
          emphasized={emphasized}
          soloComparisonHint={soloComparisonHint}
          className="animate-in fade-in-0 duration-300"
        />
      </div>
    </div>
  )
}
