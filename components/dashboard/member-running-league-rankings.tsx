'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { MemberMileageLogDialog } from '@/components/dashboard/member-mileage-log-dialog'
import { MemberRunningLeagueRankingsSkeleton } from '@/components/dashboard/member-running-league-rankings-skeleton'
import { MemberRunningPbDialog } from '@/components/dashboard/member-running-pb-panel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  formatMileageKmDisplay,
  type MileageDistanceLeaderboard,
  type MileageDistanceRankRow,
} from '@/lib/running-league/mileage-leaderboard'
import { formatRankingMemberName } from '@/lib/running-league/mask-member-name'
import {
  getMileageGapLabelForRow,
  getPbGapLabelForRow,
} from '@/lib/running-league/competition-snapshot'
import {
  currentMonthDateRange,
  formatCurrentMonthRankingLabel,
  formatNextMonthRankingResetLabel,
} from '@/lib/running-league/month-range'
import { buildLeagueMomentumSnapshot } from '@/lib/running-league/league-momentum'
import { buildMemberLeagueStatusSnapshot, type MemberLeagueStatusSnapshot } from '@/lib/running-league/league-status-summary'
import { formatScoreDisplay, type RunningLeagueRankRow } from '@/lib/running-league/scoring'
import { MemberRankingDetailPanel } from '@/components/dashboard/member-ranking-detail-panel'
import { MemberLeagueMomentumStrip } from '@/components/dashboard/member-league-momentum-strip'
import { MemberLeagueStatusCard } from '@/components/dashboard/member-league-status-card'
import { MemberRankAspirationPanel } from '@/components/dashboard/member-rank-aspiration-panel'
import { formatPbDistanceLabel, getPbDistanceFilterDescription, PB_DISTANCE_LEGEND, PB_RANKING_DISTANCES } from '@/lib/running-league/pb-distance-labels'
import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'
import { buildFilteredPortalRankings } from '@/lib/running-league/ranking-hub'
import { formatMemberRankChangeHint } from '@/lib/running-league/ranking-history'
import {
  RANKING_GENDER_FILTERS,
  canApplyClientGenderFilter,
  countUnclassifiedParticipants,
  filterParticipantsByGender,
  getGenderFilterDescription,
  GENDER_FILTER_UNAVAILABLE_MESSAGE,
  GENDER_UNCLASSIFIED_HINT,
  formatRankingFullViewButtonLabel,
  getGenderFilterScopeLabel,
  type RankingGenderFilter,
} from '@/lib/running-league/ranking-gender'
import {
  getRankingViewDescription,
  RANKING_VIEW_OPTIONS,
  type RankingView,
} from '@/lib/running-league/ranking-view'
import {
  RANKING_EMPTY_MILEAGE,
  RANKING_EMPTY_PB,
  RANKING_LOAD_ERROR_MESSAGE,
} from '@/lib/running-league/ranking-empty-states'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import type {
  PbDistanceLeaderboard,
  PbDistanceRankRow,
} from '@/lib/running-league/pb-leaderboard'
import type {
  RunningLeagueDistanceEvent,
  RunningLeagueMileageLog,
  RunningLeagueParticipant,
  RunningLeagueRecord,
} from '@/lib/types'
import { cn } from '@/lib/utils'

import {
  resolveMemberRankAspiration,
} from '@/lib/running-league/rank-aspiration'
import { RANKING_TOP_DISPLAY_COUNT } from '@/lib/running-league/ranking-portal-guards'

function filterRankedBySearch<R extends { memberId: string; memberName: string }>(
  ranked: R[],
  query: string,
  highlightMemberId?: string | null,
): R[] {
  const q = query.trim().toLowerCase()
  if (!q) return ranked
  return ranked.filter((row) => {
    const isMe = highlightMemberId != null && row.memberId === highlightMemberId
    const label = formatRankingMemberName(row.memberName, { isMe }).toLowerCase()
    return label.includes(q) || row.memberName.toLowerCase().includes(q)
  })
}
const EMPTY_PB_LEADERBOARD: PbDistanceLeaderboard = { ranked: [], unranked: [] }
const FULL_VIEW_PAGE_SIZE = 25
const TOP_DISPLAY_COUNT = RANKING_TOP_DISPLAY_COUNT

function RankingViewTabs({
  value,
  onChange,
  className,
  compact = false,
}: {
  value: RankingView
  onChange: (value: RankingView) => void
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn('min-w-0', compact ? 'space-y-0' : 'space-y-2', className)}>
      <div className={cn(compact ? 'grid grid-cols-2 gap-1.5' : 'flex flex-wrap gap-2')}>
        {RANKING_VIEW_OPTIONS.map((item) => (
          <RankingFilterChip
            key={item.value}
            active={value === item.value}
            onClick={() => onChange(item.value)}
            compact={compact}
            className={compact ? 'w-full justify-center' : undefined}
          >
            {item.label}
          </RankingFilterChip>
        ))}
      </div>
      {!compact ? (
        <p className="text-xs text-zinc-500">{getRankingViewDescription(value)}</p>
      ) : null}
    </div>
  )
}

function GenderFilterTabs({
  value,
  onChange,
  className,
  compact = false,
}: {
  value: RankingGenderFilter
  onChange: (value: RankingGenderFilter) => void
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn('min-w-0', compact ? 'space-y-0' : 'space-y-2', className)}>
      <div className={cn(compact ? 'flex gap-1' : 'flex flex-wrap gap-2')}>
        {RANKING_GENDER_FILTERS.map((item) => (
          <RankingFilterChip
            key={item.value}
            active={value === item.value}
            onClick={() => onChange(item.value)}
            compact={compact}
            className={compact ? 'flex-1 justify-center px-2' : undefined}
          >
            {item.label}
          </RankingFilterChip>
        ))}
      </div>
      {!compact ? (
        <p className="text-xs text-zinc-500">{getGenderFilterDescription(value)}</p>
      ) : null}
    </div>
  )
}

function PbDistanceTabs({
  value,
  onChange,
  className,
  compact = false,
}: {
  value: PbLeaderboardDistance
  onChange: (value: PbLeaderboardDistance) => void
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn('min-w-0', compact ? 'space-y-0' : 'space-y-2', className)}>
      <div
        className={cn(
          compact
            ? 'flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'flex flex-wrap gap-2',
        )}
      >
        {PB_RANKING_DISTANCES.map((distance) => (
          <RankingFilterChip
            key={distance}
            active={value === distance}
            onClick={() => onChange(distance)}
            compact={compact}
            className={cn(compact ? 'shrink-0 text-xs' : 'text-xs sm:text-sm')}
          >
            {formatPbDistanceLabel(distance)}
          </RankingFilterChip>
        ))}
      </div>
      {!compact ? (
        <>
          <p className="text-xs text-zinc-500">{getPbDistanceFilterDescription(value)}</p>
          <p className="text-[11px] text-zinc-600">{PB_DISTANCE_LEGEND}</p>
        </>
      ) : null}
    </div>
  )
}

function RankingFiltersPanel({
  rankingView,
  onRankingViewChange,
  genderFilter,
  onGenderFilterChange,
  pbDistance,
  onPbDistanceChange,
  genderFilterBlocked,
  unclassifiedCount,
  compact = false,
}: {
  rankingView: RankingView
  onRankingViewChange: (value: RankingView) => void
  genderFilter: RankingGenderFilter
  onGenderFilterChange: (value: RankingGenderFilter) => void
  pbDistance: PbLeaderboardDistance
  onPbDistanceChange: (value: PbLeaderboardDistance) => void
  genderFilterBlocked: boolean
  unclassifiedCount: number
  compact?: boolean
}) {
  return (
    <div className={cn(compact ? 'space-y-1.5' : 'space-y-4')}>
      <RankingViewTabs
        value={rankingView}
        onChange={onRankingViewChange}
        compact={compact}
      />
      <div className={cn(compact ? 'space-y-1.5' : 'space-y-4')}>
        <GenderFilterTabs
          value={genderFilter}
          onChange={onGenderFilterChange}
          compact={compact}
        />
        {rankingView === 'pb' ? (
          <PbDistanceTabs
            value={pbDistance}
            onChange={onPbDistanceChange}
            compact={compact}
          />
        ) : compact ? (
          <p className="text-[10px] text-zinc-500">
            {formatCurrentMonthRankingLabel()} · 매월 1일 초기화
          </p>
        ) : null}
      </div>
      {rankingView === 'mileage' && !compact ? <RankingPeriodBanner /> : null}
      <GenderFilterNotice
        genderFilter={genderFilter}
        genderFilterBlocked={genderFilterBlocked}
        unclassifiedCount={unclassifiedCount}
        compact={compact}
      />
    </div>
  )
}

function MobileRunRecordCta({
  canEdit,
  onAddMileage,
  onAddPb,
  variant = 'inline',
}: {
  canEdit: boolean
  onAddMileage: () => void
  onAddPb: () => void
  variant?: 'inline' | 'sticky'
}) {
  if (!canEdit) return null

  if (variant === 'sticky') {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-lime-500/25 bg-zinc-950/95 px-3 py-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:hidden">
        <Button
          type="button"
          className="min-h-12 w-full bg-lime-500 text-base font-bold text-black shadow-[0_0_20px_rgba(163,230,53,0.25)] hover:bg-lime-400"
          onClick={onAddMileage}
        >
          <Plus className="mr-1.5 h-5 w-5" />
          오늘 러닝 기록 추가
        </Button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 lg:hidden">
      <Button
        type="button"
        className="min-h-12 bg-lime-500 text-base font-bold text-black shadow-[0_0_20px_rgba(163,230,53,0.2)] hover:bg-lime-400"
        onClick={onAddMileage}
      >
        <Plus className="mr-1.5 h-5 w-5" />
        오늘 러닝 기록 추가
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-12 shrink-0 border-lime-500/30 bg-black/40 px-3 text-xs font-medium text-lime-200 hover:bg-lime-500/10"
        onClick={onAddPb}
      >
        PB 등록/수정
      </Button>
    </div>
  )
}

function GenderFilterNotice({
  genderFilter,
  genderFilterBlocked,
  unclassifiedCount,
  compact = false,
}: {
  genderFilter: RankingGenderFilter
  genderFilterBlocked: boolean
  unclassifiedCount: number
  compact?: boolean
}) {
  if (genderFilterBlocked) {
    if (compact) {
      return <p className="text-[10px] leading-snug text-amber-200">{GENDER_FILTER_UNAVAILABLE_MESSAGE}</p>
    }
    return (
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
        {GENDER_FILTER_UNAVAILABLE_MESSAGE}
      </div>
    )
  }

  if (genderFilter !== 'all' && unclassifiedCount > 0) {
    if (compact) {
      return (
        <p className="text-[10px] text-zinc-500">성별 미등록 {unclassifiedCount}명</p>
      )
    }
    return (
      <div className="rounded-lg border border-zinc-700/80 bg-black/20 px-3 py-2.5 text-xs leading-relaxed text-zinc-400">
        {GENDER_UNCLASSIFIED_HINT}
        <span className="mt-1 block tabular-nums text-zinc-500">미등록 {unclassifiedCount}명</span>
      </div>
    )
  }

  return null
}

const rankingCardClass =
  'min-w-0 gap-0 overflow-hidden rounded-xl border border-lime-400/35 bg-zinc-950/90 py-0 shadow-[0_0_24px_rgba(163,230,53,0.04)]'
const rankingCardHeaderClass = 'border-b border-lime-500/20 bg-black/40 px-4 py-3.5 sm:px-5'
const rankingCardContentClass = 'min-w-0 px-4 py-4 sm:px-5 sm:py-4'

const RANK_MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function RankingFilterChip({
  active,
  onClick,
  children,
  className,
  compact = false,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border transition-colors',
        compact ? 'min-h-8 px-2.5 py-1 text-xs' : 'min-h-9 px-3.5 py-1.5 text-sm',
        active
          ? 'border-lime-400/55 bg-lime-500/15 font-medium text-lime-100 shadow-[0_0_14px_rgba(163,230,53,0.1)]'
          : 'border-lime-500/20 bg-black/50 text-zinc-400 hover:border-lime-500/35 hover:text-zinc-200',
        className,
      )}
    >
      {children}
    </button>
  )
}

function RankMedalDisplay({ rank }: { rank: number }) {
  const medal = RANK_MEDALS[rank]
  if (medal) {
    return (
      <span
        className="flex w-11 shrink-0 items-center justify-center text-[1.35rem] leading-none"
        aria-label={`${rank}위`}
        title={`${rank}위`}
      >
        {medal}
      </span>
    )
  }
  return (
    <span className="flex w-11 shrink-0 flex-col items-center justify-center leading-none">
      <span className="text-xl font-bold tabular-nums text-zinc-200">{rank}</span>
      <span className="text-[9px] font-semibold text-zinc-500">위</span>
    </span>
  )
}

function topRankRowAccent(rank: number) {
  if (rank === 1) return 'border-amber-400/25 bg-amber-500/[0.06]'
  if (rank === 2) return 'border-zinc-400/20 bg-zinc-500/[0.06]'
  if (rank === 3) return 'border-orange-400/20 bg-orange-500/[0.05]'
  return ''
}

interface MemberRunningLeagueRankingsProps {
  pb5kLeaderboard: PbDistanceLeaderboard
  pb10kLeaderboard: PbDistanceLeaderboard
  pbHalfLeaderboard?: PbDistanceLeaderboard
  pbFullLeaderboard?: PbDistanceLeaderboard
  mileageLeaderboard: MileageDistanceLeaderboard
  scoreLeaderboard?: RunningLeagueRankRow[]
  rankingBundle?: MemberRunningLeagueRankingBundle | null
  participant?: RunningLeagueParticipant | null
  pbRecords?: RunningLeagueRecord[]
  mileageLogs?: RunningLeagueMileageLog[]
  tableReady?: boolean
  readOnly?: boolean
  loading?: boolean
  rankingsError?: string | null
  highlightMemberId?: string | null
  runningLeagueDetailHref?: string
  className?: string
}

type MemberRankSummary =
  | { kind: 'ranked'; rank: number; inTopDisplay: boolean }
  | { kind: 'unranked' }
  | null

type RankedRow = PbDistanceRankRow | MileageDistanceRankRow | RunningLeagueRankRow

function RankingPeriodBanner() {
  return (
    <div className="rounded-lg border border-lime-500/15 bg-lime-500/5 px-3 py-2 text-xs leading-relaxed text-zinc-400">
      <span className="font-medium text-lime-200/90">{formatCurrentMonthRankingLabel()}</span>
      {' · '}
      마일리지 랭킹은 매월 1일({formatNextMonthRankingResetLabel()})에 새로 시작됩니다.
    </div>
  )
}

function SelfGapHint({ label }: { label: string | null }) {
  if (!label || label === '1위') return null
  return <p className="mt-0.5 truncate text-[11px] text-lime-300/80">{label}</p>
}

function getLeaderboardTotal(
  leaderboard: PbDistanceLeaderboard | MileageDistanceLeaderboard,
): number {
  return leaderboard.ranked.length + leaderboard.unranked.length
}

function getMyRankSummary<T extends { memberId: string; rank: number }>(
  leaderboard: { ranked: T[]; unranked: Array<{ memberId: string }> },
  memberId?: string | null,
): MemberRankSummary {
  if (!memberId) return null
  const myRow = leaderboard.ranked.find((row) => row.memberId === memberId)
  if (myRow) {
    return { kind: 'ranked', rank: myRow.rank, inTopDisplay: myRow.rank <= TOP_DISPLAY_COUNT }
  }
  if (leaderboard.unranked.some((row) => row.memberId === memberId)) {
    return { kind: 'unranked' }
  }
  return null
}

function buildDisplayRows<T extends RankedRow>(
  ranked: T[],
  highlightMemberId?: string | null,
  showAllRanks = false,
): T[] {
  if (showAllRanks) return ranked

  const topRows = ranked.slice(0, TOP_DISPLAY_COUNT)
  if (!highlightMemberId) return topRows

  const myRow = ranked.find((row) => row.memberId === highlightMemberId)
  if (!myRow) return topRows
  if (topRows.some((row) => row.memberId === highlightMemberId)) return topRows

  return [...topRows, myRow]
}

function resolveMemberDisplayName(
  memberId: string,
  pbLeaderboard: PbDistanceLeaderboard,
  mileageLeaderboard: MileageDistanceLeaderboard,
): string {
  const fromPb =
    pbLeaderboard.ranked.find((row) => row.memberId === memberId) ??
    pbLeaderboard.unranked.find((row) => row.memberId === memberId)
  if (fromPb) return fromPb.memberName

  const fromMileage =
    mileageLeaderboard.ranked.find((row) => row.memberId === memberId) ??
    mileageLeaderboard.unranked.find((row) => row.memberId === memberId)
  return fromMileage?.memberName ?? '회원'
}

function MyRankSeparator() {
  return (
    <div
      className="flex items-center gap-2 py-1 text-[10px] font-medium uppercase tracking-wider text-lime-400/70"
      aria-hidden
    >
      <span className="h-px flex-1 bg-lime-500/20" />
      <span>내 순위</span>
      <span className="h-px flex-1 bg-lime-500/20" />
    </div>
  )
}

function MyRankBadge() {
  return (
    <span className="shrink-0 rounded-full border border-lime-300/50 bg-lime-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lime-50 shadow-[0_0_12px_rgba(163,230,53,0.35)]">
      내 순위
    </span>
  )
}

function RankChangeHint({ label }: { label: string | null }) {
  if (!label) return null
  const improved = label.startsWith('▲')
  return (
    <span
      className={cn(
        'shrink-0 text-[11px] font-semibold tabular-nums',
        improved ? 'text-emerald-400' : 'text-amber-400/90',
      )}
    >
      {label}
    </span>
  )
}

function RankingsLoadErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-5 text-center">
      <p className="text-sm font-medium text-amber-100">{RANKING_LOAD_ERROR_MESSAGE}</p>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 border-amber-500/30 text-amber-100 hover:bg-amber-500/10"
          onClick={onRetry}
        >
          다시 시도
        </Button>
      ) : null}
    </div>
  )
}

function RankingEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-dashed border-lime-500/20 bg-black/20 px-4 py-5 text-center">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{description}</p>
    </div>
  )
}

function RankingCardAction({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="mt-4 min-h-10 w-full border-lime-500/30 bg-lime-500/5 text-sm text-lime-100 hover:bg-lime-500/10 hover:text-lime-50"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  )
}

function RankingPreview({
  rankingView,
  pbDistance,
  activePbLeaderboard,
  activeMileageLeaderboard,
  rankedCount,
  highlightMemberId,
  selectedMemberId,
  onMemberSelect,
  onViewAll,
  rankingsError,
  rankingBundle,
  genderFilter,
  leagueStatus,
  onRetry,
}: {
  rankingView: RankingView
  pbDistance: PbLeaderboardDistance
  activePbLeaderboard: PbDistanceLeaderboard
  activeMileageLeaderboard: MileageDistanceLeaderboard
  rankedCount: number
  highlightMemberId?: string | null
  selectedMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  onViewAll?: () => void
  rankingsError?: string | null
  rankingBundle?: MemberRunningLeagueRankingBundle | null
  genderFilter: RankingGenderFilter
  leagueStatus?: MemberLeagueStatusSnapshot | null
  onRetry?: () => void
}) {
  const leaderboard = rankingView === 'pb' ? activePbLeaderboard : activeMileageLeaderboard
  const firstRow = leaderboard.ranked[0]
  const distanceLabel = formatPbDistanceLabel(pbDistance)
  const viewLabel =
    rankingView === 'pb' ? `${distanceLabel} PB` : formatCurrentMonthRankingLabel()

  const filteredParticipants = rankingBundle
    ? filterParticipantsByGender(rankingBundle.participants, genderFilter)
    : []

  function resolveChangeHint(memberId: string): string | null {
    if (!rankingBundle || rankingView !== 'pb') return null
    return formatMemberRankChangeHint(
      memberId,
      pbDistance,
      filteredParticipants,
      rankingBundle.pbRecords,
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-lime-400/30 bg-zinc-950/90">
      <div className="flex items-center justify-between gap-2 border-b border-lime-500/15 px-3 py-2">
        <p className="text-sm font-semibold text-lime-100">랭킹 미리보기</p>
        <span className="text-[10px] text-zinc-500">{viewLabel}</span>
      </div>
      <div className="space-y-2 p-2.5">
        {rankingsError ? (
          <RankingsLoadErrorState onRetry={onRetry} />
        ) : firstRow ? (
          <>
            {rankingView === 'pb' ? (
              <PbRankingRow
                row={firstRow}
                isMe={highlightMemberId != null && firstRow.memberId === highlightMemberId}
                distanceLabel={distanceLabel}
                changeHint={resolveChangeHint(firstRow.memberId)}
                onMemberSelect={onMemberSelect}
                isSelected={selectedMemberId === firstRow.memberId}
              />
            ) : (
              <MileageRankingRow
                row={firstRow}
                isMe={highlightMemberId != null && firstRow.memberId === highlightMemberId}
                onMemberSelect={onMemberSelect}
                isSelected={selectedMemberId === firstRow.memberId}
              />
            )}
            {leagueStatus?.isSoloRanked ? (
              <p className="text-center text-xs font-medium text-lime-200/90">현재 리그 1위입니다</p>
            ) : leagueStatus && highlightMemberId ? (
              <p className="text-center text-[11px] text-zinc-400">
                {leagueStatus.rankHeadline}
                {leagueStatus.rankSubline ? ` · ${leagueStatus.rankSubline}` : ''}
              </p>
            ) : null}
          </>
        ) : (
          <RankingEmptyState
            title={rankingView === 'pb' ? RANKING_EMPTY_PB.title : RANKING_EMPTY_MILEAGE.title}
            description={
              rankingView === 'pb' ? RANKING_EMPTY_PB.description : RANKING_EMPTY_MILEAGE.description
            }
          />
        )}
        {rankedCount > 0 && onViewAll ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-10 w-full border-lime-500/30 bg-lime-500/5 text-sm text-lime-100 hover:bg-lime-500/10 hover:text-lime-50"
            onClick={onViewAll}
          >
            {formatRankingFullViewButtonLabel({ genderFilter, rankedCount })}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function MyRankFooter({
  label,
  summary,
  total,
  showSelfRow,
  gapHint,
}: {
  label: string
  summary: MemberRankSummary
  total: number
  showSelfRow: boolean
  gapHint?: string | null
}) {
  if (!summary || total <= 0) return null
  if (summary.kind === 'ranked' && (summary.inTopDisplay || showSelfRow)) return null

  const value =
    summary.kind === 'ranked' ? `${summary.rank}위 / ${total}명` : `기록 없음 / ${total}명`

  return (
    <div className="rounded-lg border border-lime-500/30 bg-lime-500/10 px-3 py-2.5 text-sm">
      <span className="font-medium text-lime-200">
        {label}{' '}
        <span className="tabular-nums text-lime-100">{value}</span>
      </span>
      <SelfGapHint label={gapHint ?? null} />
    </div>
  )
}

function resolveMemberCurrentRank(
  memberId: string,
  rankingView: RankingView,
  pbLeaderboard: PbDistanceLeaderboard,
  mileageLeaderboard: MileageDistanceLeaderboard,
): number | null {
  if (rankingView === 'pb') {
    return pbLeaderboard.ranked.find((row) => row.memberId === memberId)?.rank ?? null
  }
  return mileageLeaderboard.ranked.find((row) => row.memberId === memberId)?.rank ?? null
}

function rankingRowClass(highlighted: boolean, isSelected: boolean, isMe: boolean) {
  if (isSelected) {
    return cn(
      'border-lime-400/55 bg-lime-500/14 ring-2 shadow-[0_0_16px_rgba(163,230,53,0.12)]',
      isMe ? 'ring-lime-400/60' : 'ring-lime-400/40',
    )
  }
  if (highlighted) {
    return 'border-lime-400/45 bg-lime-500/12 ring-1 ring-lime-400/20'
  }
  return 'border-white/5 bg-black/20 hover:bg-black/30 hover:ring-1 hover:ring-lime-500/15'
}

function PbRankingRow({
  row,
  isMe,
  distanceLabel,
  changeHint,
  onMemberSelect,
  isSelected,
  scrollAnchor = false,
}: {
  row: PbDistanceRankRow
  isMe: boolean
  distanceLabel: string
  changeHint?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  isSelected?: boolean
  scrollAnchor?: boolean
}) {
  const highlighted = isMe || Boolean(isSelected)

  return (
    <button
      type="button"
      id={scrollAnchor ? `rank-row-${row.memberId}` : undefined}
      onClick={() => onMemberSelect?.(row.memberId, row.memberName)}
      aria-pressed={isSelected}
      aria-current={isSelected ? 'true' : undefined}
      data-selected-member={isSelected ? 'true' : undefined}
      className={cn(
        'flex min-w-0 w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-200',
        topRankRowAccent(row.rank),
        rankingRowClass(highlighted, Boolean(isSelected), isMe),
      )}
    >
      <RankMedalDisplay rank={row.rank} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-medium',
          highlighted ? 'text-lime-50' : 'text-foreground',
        )}
      >
        {formatRankingMemberName(row.memberName, { isMe })}
      </span>
      <span className="shrink-0 text-xs text-zinc-500">{distanceLabel}</span>
      <span
        className={cn(
          'shrink-0 font-semibold tabular-nums',
          highlighted ? 'text-lime-300' : 'text-lime-400/90',
        )}
      >
        {row.timeText}
      </span>
      <RankChangeHint label={changeHint ?? null} />
      {isMe ? <MyRankBadge /> : null}
      {isSelected ? <ChevronRight className="h-4 w-4 shrink-0 text-lime-400" aria-hidden /> : null}
    </button>
  )
}

function MileageRankingRow({
  row,
  isMe,
  changeHint,
  onMemberSelect,
  isSelected,
  scrollAnchor = false,
}: {
  row: MileageDistanceRankRow
  isMe: boolean
  changeHint?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  isSelected?: boolean
  scrollAnchor?: boolean
}) {
  const highlighted = isMe || Boolean(isSelected)

  return (
    <button
      type="button"
      id={scrollAnchor ? `rank-row-${row.memberId}` : undefined}
      onClick={() => onMemberSelect?.(row.memberId, row.memberName)}
      aria-pressed={isSelected}
      aria-current={isSelected ? 'true' : undefined}
      data-selected-member={isSelected ? 'true' : undefined}
      className={cn(
        'flex min-w-0 w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-200',
        topRankRowAccent(row.rank),
        rankingRowClass(highlighted, Boolean(isSelected), isMe),
      )}
    >
      <RankMedalDisplay rank={row.rank} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-medium',
          highlighted ? 'text-lime-50' : 'text-foreground',
        )}
      >
        {formatRankingMemberName(row.memberName, { isMe })}
      </span>
      <span className="shrink-0 text-xs text-zinc-500">이번 달</span>
      <span
        className={cn(
          'shrink-0 font-semibold tabular-nums',
          highlighted ? 'text-lime-300' : 'text-lime-400/90',
        )}
      >
        {formatMileageKmDisplay(row.mileageKm)}
      </span>
      <RankChangeHint label={changeHint ?? null} />
      {isMe ? <MyRankBadge /> : null}
      {isSelected ? <ChevronRight className="h-4 w-4 shrink-0 text-lime-400" aria-hidden /> : null}
    </button>
  )
}

function PbRankingList({
  leaderboard,
  highlightMemberId,
  onMemberSelect,
  selectedMemberId,
  showAllRanks = false,
  pbDistance,
  rankingBundle = null,
  genderFilter = 'all',
}: {
  leaderboard: PbDistanceLeaderboard
  highlightMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  selectedMemberId?: string | null
  showAllRanks?: boolean
  pbDistance: PbLeaderboardDistance
  rankingBundle?: MemberRunningLeagueRankingBundle | null
  genderFilter?: RankingGenderFilter
}) {
  const { ranked, unranked } = leaderboard
  const total = getLeaderboardTotal(leaderboard)
  const mySummary = getMyRankSummary(leaderboard, highlightMemberId)
  const displayRows = buildDisplayRows(ranked, highlightMemberId, showAllRanks)
  const showSelfRow =
    !showAllRanks &&
    highlightMemberId != null &&
    displayRows.some(
      (row) => row.memberId === highlightMemberId && row.rank > TOP_DISPLAY_COUNT,
    )
  const hasRankingData = ranked.length > 0
  const showUnrankedSection =
    hasRankingData && unranked.some((row) => row.memberId !== highlightMemberId)
  const distanceLabel = formatPbDistanceLabel(pbDistance)

  const filteredParticipants = useMemo(
    () =>
      rankingBundle
        ? filterParticipantsByGender(rankingBundle.participants, genderFilter)
        : [],
    [genderFilter, rankingBundle],
  )

  function resolveChangeHint(memberId: string): string | null {
    if (!rankingBundle) return null
    return formatMemberRankChangeHint(
      memberId,
      pbDistance,
      filteredParticipants,
      rankingBundle.pbRecords,
    )
  }

  const myRow = highlightMemberId
    ? ranked.find((row) => row.memberId === highlightMemberId)
    : undefined
  const myGapLabel = myRow ? getPbGapLabelForRow(myRow, ranked) : null

  if (!hasRankingData) {
    return (
      <div className="space-y-3">
        <RankingEmptyState
          title={RANKING_EMPTY_PB.title}
          description={RANKING_EMPTY_PB.description}
        />
        <MyRankFooter
          label="내 순위"
          summary={mySummary}
          total={total}
          showSelfRow={false}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {displayRows.map((row, index) => {
          const isMe = highlightMemberId != null && row.memberId === highlightMemberId
          const showSeparator =
            showSelfRow && isMe && index === displayRows.length - 1
          return (
            <div key={row.participantId} className={showSeparator ? 'space-y-2' : undefined}>
              {showSeparator ? <MyRankSeparator /> : null}
              <PbRankingRow
                row={row}
                isMe={isMe}
                distanceLabel={distanceLabel}
                changeHint={resolveChangeHint(row.memberId)}
                onMemberSelect={onMemberSelect}
                isSelected={selectedMemberId === row.memberId}
                scrollAnchor={isMe}
              />
            </div>
          )
        })}
      </div>

      {showUnrankedSection ? (
        <div className="space-y-2 border-t border-lime-500/10 pt-3">
          <p className="text-xs font-medium text-zinc-500">기록 없음</p>
          {unranked
            .filter((row) => row.memberId !== highlightMemberId)
            .map((row) => (
              <div
                key={row.participantId}
                className="flex items-center justify-between rounded-lg border border-dashed border-zinc-700/80 bg-black/10 px-3 py-2 text-sm text-zinc-500"
              >
                <p className="truncate font-medium">
                  {formatRankingMemberName(row.memberName, {
                    isMe: highlightMemberId != null && row.memberId === highlightMemberId,
                  })}
                </p>
                <span className="shrink-0 text-xs">기록 없음</span>
              </div>
            ))}
        </div>
      ) : null}

      <MyRankFooter
        label="내 순위"
        summary={mySummary}
        total={total}
        showSelfRow={showSelfRow}
        gapHint={myGapLabel}
      />
    </div>
  )
}

function MileageRankingList({
  leaderboard,
  highlightMemberId,
  onMemberSelect,
  selectedMemberId,
  showAllRanks = false,
}: {
  leaderboard: MileageDistanceLeaderboard
  highlightMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  selectedMemberId?: string | null
  showAllRanks?: boolean
}) {
  const { ranked, unranked } = leaderboard
  const total = getLeaderboardTotal(leaderboard)
  const mySummary = getMyRankSummary(leaderboard, highlightMemberId)
  const displayRows = buildDisplayRows(ranked, highlightMemberId, showAllRanks)
  const showSelfRow =
    !showAllRanks &&
    highlightMemberId != null &&
    displayRows.some(
      (row) => row.memberId === highlightMemberId && row.rank > TOP_DISPLAY_COUNT,
    )
  const hasRankingData = ranked.length > 0
  const showUnrankedSection =
    hasRankingData && unranked.some((row) => row.memberId !== highlightMemberId)

  const myRow = highlightMemberId
    ? ranked.find((row) => row.memberId === highlightMemberId)
    : undefined
  const myGapLabel = myRow ? getMileageGapLabelForRow(myRow, ranked) : null

  if (!hasRankingData) {
    return (
      <div className="space-y-3">
        <RankingEmptyState
          title={RANKING_EMPTY_MILEAGE.title}
          description={RANKING_EMPTY_MILEAGE.description}
        />
        <MyRankFooter
          label="내 마일리지 순위"
          summary={mySummary}
          total={total}
          showSelfRow={showSelfRow}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {displayRows.map((row, index) => {
          const isMe = highlightMemberId != null && row.memberId === highlightMemberId
          const showSeparator =
            showSelfRow && isMe && index === displayRows.length - 1
          return (
            <div key={row.participantId} className={showSeparator ? 'space-y-2' : undefined}>
              {showSeparator ? <MyRankSeparator /> : null}
              <MileageRankingRow
                row={row}
                isMe={isMe}
                onMemberSelect={onMemberSelect}
                isSelected={selectedMemberId === row.memberId}
                scrollAnchor={isMe}
              />
            </div>
          )
        })}
      </div>

      {showUnrankedSection ? (
        <div className="space-y-2 border-t border-lime-500/10 pt-3">
          <p className="text-xs font-medium text-zinc-500">기록 없음</p>
          {unranked
            .filter((row) => row.memberId !== highlightMemberId)
            .map((row) => (
              <div
                key={row.participantId}
                className="flex items-center justify-between rounded-lg border border-dashed border-zinc-700/80 bg-black/10 px-3 py-2 text-sm text-zinc-500"
              >
                <p className="truncate font-medium">
                  {formatRankingMemberName(row.memberName, {
                    isMe: highlightMemberId != null && row.memberId === highlightMemberId,
                  })}
                </p>
                <span className="shrink-0 text-xs tabular-nums">{formatMileageKmDisplay(0)}</span>
              </div>
            ))}
        </div>
      ) : null}

      <MyRankFooter
        label="내 마일리지 순위"
        summary={mySummary}
        total={total}
        showSelfRow={showSelfRow}
        gapHint={myGapLabel}
      />
    </div>
  )
}

function ScoreRankingRow({
  row,
  isMe,
  onMemberSelect,
  isSelected,
}: {
  row: RunningLeagueRankRow
  isMe: boolean
  onMemberSelect?: (memberId: string, memberName: string) => void
  isSelected?: boolean
}) {
  const highlighted = isMe || Boolean(isSelected)

  return (
    <button
      type="button"
      onClick={() => onMemberSelect?.(row.memberId, row.memberName)}
      className={cn(
        'flex min-w-0 w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
        topRankRowAccent(row.rank),
        highlighted
          ? 'border-lime-400/45 bg-lime-500/12 ring-1 ring-lime-400/20'
          : 'border-white/5 bg-black/20 hover:bg-black/30',
      )}
    >
      <RankMedalDisplay rank={row.rank} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-medium',
          highlighted ? 'text-lime-50' : 'text-foreground',
        )}
      >
        {formatRankingMemberName(row.memberName, { isMe })}
      </span>
      <span
        className={cn(
          'shrink-0 font-semibold tabular-nums',
          highlighted ? 'text-lime-300' : 'text-lime-400/90',
        )}
      >
        {formatScoreDisplay(row.totalScore)}점
      </span>
      {isMe ? <MyRankBadge /> : null}
    </button>
  )
}

function ScoreRankingList({
  rows,
  highlightMemberId,
  onMemberSelect,
  selectedMemberId,
}: {
  rows: RunningLeagueRankRow[]
  highlightMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  selectedMemberId?: string | null
}) {
  const total = rows.length
  const myRow = highlightMemberId
    ? rows.find((row) => row.memberId === highlightMemberId)
    : undefined
  const mySummary: MemberRankSummary = !highlightMemberId
    ? null
    : myRow
      ? { kind: 'ranked', rank: myRow.rank, inTopDisplay: myRow.rank <= TOP_DISPLAY_COUNT }
      : null
  const displayRows = buildDisplayRows(rows, highlightMemberId)
  const showSelfRow =
    highlightMemberId != null &&
    displayRows.some(
      (row) => row.memberId === highlightMemberId && row.rank > TOP_DISPLAY_COUNT,
    )

  if (rows.length === 0) {
    return (
      <RankingEmptyState
        title="아직 리그 총점이 집계되지 않았습니다."
        description="출석·목표·기록·마일리지·회복관리가 반영되면 순위가 표시됩니다."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {displayRows.map((row) => {
          const isMe = highlightMemberId != null && row.memberId === highlightMemberId
          return (
            <ScoreRankingRow
              key={row.participantId}
              row={row}
              isMe={isMe}
              onMemberSelect={onMemberSelect}
              isSelected={selectedMemberId === row.memberId}
            />
          )
        })}
      </div>

      <MyRankFooter
        label="내 총점 순위"
        summary={mySummary}
        total={total}
        showSelfRow={showSelfRow}
      />
    </div>
  )
}

function RankingListCard({
  children,
  rankedCount,
  genderFilter = 'all',
  onViewAll,
  footerAction,
  aspirationSlot,
}: {
  children: ReactNode
  rankedCount: number
  genderFilter?: RankingGenderFilter
  onViewAll?: () => void
  footerAction?: ReactNode
  aspirationSlot?: ReactNode
}) {
  return (
    <Card className={cn(rankingCardClass, 'border-lime-400/40')}>
      <CardHeader className={rankingCardHeaderClass}>
        <CardTitle className="text-base text-lime-100">성인 러닝 리그 랭킹</CardTitle>
        <p className="text-sm text-zinc-400">기록과 마일리지로 회원들과 경쟁해보세요.</p>
      </CardHeader>
      <CardContent className={cn(rankingCardContentClass, 'space-y-3')}>
        {children}
        {aspirationSlot}
        {rankedCount > 0 && onViewAll ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-10 w-full border-lime-500/30 bg-lime-500/5 text-sm text-lime-100 hover:bg-lime-500/10 hover:text-lime-50"
            onClick={onViewAll}
          >
            {formatRankingFullViewButtonLabel({ genderFilter, rankedCount })}
          </Button>
        ) : null}
        {footerAction}
      </CardContent>
    </Card>
  )
}

function FullRankingDialog({
  open,
  onOpenChange,
  rankingView,
  onRankingViewChange,
  genderFilter,
  onGenderFilterChange,
  pbDistance,
  onPbDistanceChange,
  activePbLeaderboard,
  activeMileageLeaderboard,
  highlightMemberId,
  selectedMemberId,
  onMemberSelect,
  rankingBundle,
  genderFilterBlocked,
  unclassifiedCount = 0,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rankingView: RankingView
  onRankingViewChange: (value: RankingView) => void
  genderFilter: RankingGenderFilter
  onGenderFilterChange: (value: RankingGenderFilter) => void
  pbDistance: PbLeaderboardDistance
  onPbDistanceChange: (value: PbLeaderboardDistance) => void
  activePbLeaderboard: PbDistanceLeaderboard
  activeMileageLeaderboard: MileageDistanceLeaderboard
  highlightMemberId?: string | null
  selectedMemberId?: string | null
  onMemberSelect?: (memberId: string, memberName: string) => void
  rankingBundle?: MemberRunningLeagueRankingBundle | null
  genderFilterBlocked?: boolean
  unclassifiedCount?: number
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const scrollPendingRef = useRef(false)

  const fullRanked =
    rankingView === 'pb' ? activePbLeaderboard.ranked : activeMileageLeaderboard.ranked
  const searchedRanked = useMemo(
    () => filterRankedBySearch(fullRanked, searchQuery, highlightMemberId),
    [fullRanked, highlightMemberId, searchQuery],
  )
  const totalPages = Math.max(1, Math.ceil(searchedRanked.length / FULL_VIEW_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginatedRanked = useMemo(() => {
    if (searchedRanked.length <= FULL_VIEW_PAGE_SIZE) return searchedRanked
    const start = (safePage - 1) * FULL_VIEW_PAGE_SIZE
    return searchedRanked.slice(start, start + FULL_VIEW_PAGE_SIZE)
  }, [safePage, searchedRanked])

  const paginatedPbLeaderboard = useMemo(
    () => ({ ranked: paginatedRanked, unranked: [] as PbDistanceLeaderboard['unranked'] }),
    [paginatedRanked],
  )
  const paginatedMileageLeaderboard = useMemo(
    () => ({
      ranked: paginatedRanked as MileageDistanceRankRow[],
      unranked: [] as MileageDistanceLeaderboard['unranked'],
    }),
    [paginatedRanked],
  )

  const myRankIndex =
    highlightMemberId != null
      ? searchedRanked.findIndex((row) => row.memberId === highlightMemberId)
      : -1
  const myRank = myRankIndex >= 0 ? searchedRanked[myRankIndex] : null
  const showPagination = searchedRanked.length > FULL_VIEW_PAGE_SIZE

  const rankingLabel =
    rankingView === 'pb'
      ? `${formatPbDistanceLabel(pbDistance)} PB 랭킹`
      : '월 마일리지 랭킹'
  const genderScopeLabel = getGenderFilterScopeLabel(genderFilter)

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setPage(1)
      scrollPendingRef.current = false
    }
  }, [open])

  useEffect(() => {
    setPage(1)
    scrollPendingRef.current = false
  }, [rankingView, genderFilter, pbDistance, searchQuery])

  useEffect(() => {
    if (!scrollPendingRef.current || !highlightMemberId) return
    scrollPendingRef.current = false
    const timer = window.setTimeout(() => {
      document
        .getElementById(`rank-row-${highlightMemberId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    return () => window.clearTimeout(timer)
  }, [safePage, highlightMemberId, paginatedRanked])

  function jumpToMyRank() {
    if (!highlightMemberId || myRankIndex < 0) return
    if (showPagination) {
      scrollPendingRef.current = true
      setPage(Math.floor(myRankIndex / FULL_VIEW_PAGE_SIZE) + 1)
      return
    }
    document
      .getElementById(`rank-row-${highlightMemberId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[min(92dvh,780px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-lime-500/15 px-4 py-4 text-left sm:px-6">
          <DialogTitle className="text-lime-100">랭킹 모아보기</DialogTitle>
          <DialogDescription>
            {rankingLabel}
            {genderFilter !== 'all' ? ` · ${genderScopeLabel}` : ''} · 총 {searchedRanked.length}명
            {searchQuery.trim() && fullRanked.length !== searchedRanked.length
              ? ` (검색 ${searchedRanked.length}/${fullRanked.length})`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-b border-lime-500/10 px-4 py-3 sm:px-6">
          <RankingViewTabs value={rankingView} onChange={onRankingViewChange} />
          <GenderFilterTabs value={genderFilter} onChange={onGenderFilterChange} />
          {rankingView === 'pb' ? (
            <PbDistanceTabs value={pbDistance} onChange={onPbDistanceChange} />
          ) : null}
          <GenderFilterNotice
            genderFilter={genderFilter}
            genderFilterBlocked={Boolean(genderFilterBlocked)}
            unclassifiedCount={unclassifiedCount}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                aria-hidden
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="이름 검색"
                className="h-10 border-lime-500/20 bg-black/30 pl-9 text-sm text-zinc-100 placeholder:text-zinc-500"
                aria-label="랭킹 이름 검색"
              />
            </div>
            {highlightMemberId && myRank ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-lime-500/30 bg-lime-500/10 text-lime-100 hover:bg-lime-500/15"
                onClick={jumpToMyRank}
              >
                내 순위 ({myRank.rank}위)
              </Button>
            ) : null}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-4 py-4 sm:px-6">
          {searchedRanked.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {searchQuery.trim() ? '검색 결과가 없습니다.' : '표시할 랭킹이 없습니다.'}
            </p>
          ) : rankingView === 'pb' ? (
            <PbRankingList
              leaderboard={paginatedPbLeaderboard}
              highlightMemberId={highlightMemberId}
              onMemberSelect={onMemberSelect}
              selectedMemberId={selectedMemberId}
              showAllRanks
              pbDistance={pbDistance}
              rankingBundle={rankingBundle}
              genderFilter={genderFilter}
            />
          ) : (
            <MileageRankingList
              leaderboard={paginatedMileageLeaderboard}
              highlightMemberId={highlightMemberId}
              onMemberSelect={onMemberSelect}
              selectedMemberId={selectedMemberId}
              showAllRanks
            />
          )}
        </ScrollArea>

        {showPagination ? (
          <div className="flex items-center justify-between gap-2 border-t border-lime-500/10 px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-lime-500/25 text-lime-100"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              이전
            </Button>
            <span className="text-xs tabular-nums text-zinc-400">
              {safePage} / {totalPages}페이지 · {searchedRanked.length}명
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-lime-500/25 text-lime-100"
              disabled={safePage >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              다음
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function MemberRunningLeagueRankings({
  pb5kLeaderboard,
  pb10kLeaderboard,
  pbHalfLeaderboard = EMPTY_PB_LEADERBOARD,
  pbFullLeaderboard = EMPTY_PB_LEADERBOARD,
  mileageLeaderboard,
  scoreLeaderboard = [],
  rankingBundle = null,
  participant = null,
  pbRecords = [],
  mileageLogs = [],
  tableReady = true,
  readOnly = false,
  loading = false,
  rankingsError = null,
  highlightMemberId = null,
  runningLeagueDetailHref = '/dashboard/my/running-league',
  className,
}: MemberRunningLeagueRankingsProps) {
  const [genderFilter, setGenderFilter] = useState<RankingGenderFilter>('all')
  const [rankingView, setRankingView] = useState<RankingView>('pb')
  const [pbDistance, setPbDistance] = useState<PbLeaderboardDistance>('5km')
  const [fullRankingOpen, setFullRankingOpen] = useState(false)
  const graphPanelRef = useRef<HTMLDivElement>(null)
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string } | null>(null)
  const [pbDialogOpen, setPbDialogOpen] = useState(false)
  const [mileageDialogOpen, setMileageDialogOpen] = useState(false)
  const router = useRouter()
  const canEdit = tableReady && !readOnly && participant != null

  const filteredRankings = useMemo(() => {
    if (rankingBundle) {
      return buildFilteredPortalRankings(rankingBundle, genderFilter)
    }
    if (!canApplyClientGenderFilter(null, genderFilter)) return null
    return {
      pbByDistance: {
        '5km': pb5kLeaderboard,
        '10km': pb10kLeaderboard,
        half: pbHalfLeaderboard,
        full: pbFullLeaderboard,
      },
      mileageLeaderboard,
      scoreLeaderboard,
    }
  }, [
    genderFilter,
    mileageLeaderboard,
    pb10kLeaderboard,
    pb5kLeaderboard,
    pbFullLeaderboard,
    pbHalfLeaderboard,
    rankingBundle,
    scoreLeaderboard,
  ])

  const activePbLeaderboard =
    filteredRankings?.pbByDistance[pbDistance] ?? EMPTY_PB_LEADERBOARD
  const activeMileageLeaderboard =
    filteredRankings?.mileageLeaderboard ?? { ranked: [], unranked: [] }
  const activeRankedCount =
    rankingView === 'pb'
      ? activePbLeaderboard.ranked.length
      : activeMileageLeaderboard.ranked.length
  const genderFilterBlocked = !canApplyClientGenderFilter(rankingBundle, genderFilter)
  const unclassifiedCount = useMemo(
    () => (rankingBundle ? countUnclassifiedParticipants(rankingBundle.participants) : 0),
    [rankingBundle],
  )

  const panelMember = useMemo(() => {
    if (selectedMember) return selectedMember
    if (!highlightMemberId) return null
    return {
      id: highlightMemberId,
      name: resolveMemberDisplayName(
        highlightMemberId,
        activePbLeaderboard,
        activeMileageLeaderboard,
      ),
    }
  }, [activeMileageLeaderboard, activePbLeaderboard, highlightMemberId, selectedMember])

  const panelMemberRank = panelMember
    ? resolveMemberCurrentRank(
        panelMember.id,
        rankingView,
        activePbLeaderboard,
        activeMileageLeaderboard,
      )
    : null

  const isExplicitSelection =
    selectedMember != null && highlightMemberId != null && selectedMember.id !== highlightMemberId

  const myRankAspiration = useMemo(
    () =>
      highlightMemberId && !rankingsError
        ? resolveMemberRankAspiration({
            memberId: highlightMemberId,
            rankingView,
            pbLeaderboard: activePbLeaderboard,
            mileageLeaderboard: activeMileageLeaderboard,
          })
        : null,
    [
      activeMileageLeaderboard,
      activePbLeaderboard,
      highlightMemberId,
      rankingView,
      rankingsError,
    ],
  )

  const leagueMomentum = useMemo(() => {
    if (!rankingBundle || rankingsError) {
      return { topRiser: null, recentPbUpdates: [] }
    }
    const filteredParticipants = filterParticipantsByGender(
      rankingBundle.participants,
      genderFilter,
    )
    const { start, end } = currentMonthDateRange()
    return buildLeagueMomentumSnapshot({
      rankingView,
      distance: pbDistance,
      participants: filteredParticipants,
      records: rankingBundle.pbRecords,
      mileageLogs: rankingBundle.mileageLogs,
      monthStart: start,
      monthEnd: end,
      recentPbLimit: 2,
    })
  }, [
    genderFilter,
    pbDistance,
    rankingBundle,
    rankingView,
    rankingsError,
  ])

  const filteredParticipantsForStatus = useMemo(
    () =>
      rankingBundle
        ? filterParticipantsByGender(rankingBundle.participants, genderFilter)
        : [],
    [genderFilter, rankingBundle],
  )

  const leagueStatus = useMemo(() => {
    if (!highlightMemberId || rankingsError) return null
    return buildMemberLeagueStatusSnapshot({
      memberId: highlightMemberId,
      rankingView,
      pbDistance,
      participant,
      pbLeaderboard: activePbLeaderboard,
      mileageLeaderboard: activeMileageLeaderboard,
      mileageLogs,
      pbRecords,
      participants: filteredParticipantsForStatus,
    })
  }, [
    activeMileageLeaderboard,
    activePbLeaderboard,
    filteredParticipantsForStatus,
    highlightMemberId,
    mileageLogs,
    participant,
    pbDistance,
    pbRecords,
    rankingView,
    rankingsError,
  ])

  function handleMemberSelect(memberId: string, memberName: string) {
    setSelectedMember({ id: memberId, name: memberName })
    window.requestAnimationFrame(() => {
      graphPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const rankingListBody = rankingsError ? (
    <RankingsLoadErrorState onRetry={() => router.refresh()} />
  ) : rankingView === 'pb' ? (
    <PbRankingList
      leaderboard={activePbLeaderboard}
      highlightMemberId={highlightMemberId}
      onMemberSelect={handleMemberSelect}
      selectedMemberId={panelMember?.id ?? null}
      pbDistance={pbDistance}
      rankingBundle={rankingBundle}
      genderFilter={genderFilter}
    />
  ) : (
    <MileageRankingList
      leaderboard={activeMileageLeaderboard}
      highlightMemberId={highlightMemberId}
      onMemberSelect={handleMemberSelect}
      selectedMemberId={panelMember?.id ?? null}
    />
  )

  const mobileGraphBody = panelMember ? (
    <MemberRankingDetailPanel
      key={panelMember.id}
      embedded
      emphasized
      variant="mobile"
      memberId={panelMember.id}
      memberName={panelMember.name}
      distance={pbDistance}
      rankingView={rankingView}
      genderFilter={genderFilter}
      rankingBundle={rankingBundle}
      highlightMemberId={highlightMemberId}
      currentRank={panelMemberRank}
      totalRanked={activeRankedCount}
      isExplicitSelection={isExplicitSelection}
      onClose={
        isExplicitSelection
          ? () => setSelectedMember(null)
          : undefined
      }
      soloComparisonHint={leagueStatus?.soloRankHint ?? leagueStatus?.comparisonHint}
    />
  ) : (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-lime-500/20 bg-black/20 px-3 py-4 text-center">
      <p className="text-xs text-zinc-400">기록을 추가하면 그래프가 표시됩니다.</p>
    </div>
  )

  const graphPanelBody = panelMember ? (
    <MemberRankingDetailPanel
      key={panelMember.id}
      embedded
      emphasized
      memberId={panelMember.id}
      memberName={panelMember.name}
      distance={pbDistance}
      rankingView={rankingView}
      genderFilter={genderFilter}
      rankingBundle={rankingBundle}
      highlightMemberId={highlightMemberId}
      currentRank={panelMemberRank}
      totalRanked={activeRankedCount}
      isExplicitSelection={isExplicitSelection}
      onClose={
        isExplicitSelection
          ? () => setSelectedMember(null)
          : undefined
      }
      className="h-full min-h-[360px]"
      aspirationInsight={
        panelMember.id === highlightMemberId ? myRankAspiration : null
      }
      soloComparisonHint={leagueStatus?.soloRankHint ?? leagueStatus?.comparisonHint}
    />
  ) : (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-lime-500/20 bg-black/20 px-4 py-6 text-center text-sm text-zinc-500">
      <p>회원을 선택하면 그래프를 볼 수 있습니다.</p>
      <p className="text-xs text-zinc-600">순위 목록에서 이름을 눌러 기록·순위 변화를 확인하세요.</p>
    </div>
  )

  const highlightsBody = (
    <div className="space-y-3">
      {!rankingsError && rankingBundle ? (
        <MemberLeagueMomentumStrip
          topRiser={leagueMomentum.topRiser}
          recentPbUpdates={leagueMomentum.recentPbUpdates}
          highlightMemberId={highlightMemberId}
          onMemberSelect={handleMemberSelect}
          rankingViewLabel={
            rankingView === 'pb'
              ? formatPbDistanceLabel(pbDistance)
              : formatCurrentMonthRankingLabel()
          }
        />
      ) : null}
      <div className="rounded-xl border border-lime-500/15 bg-black/30 p-3 text-sm text-zinc-400 sm:p-4">
        <p className="font-medium text-lime-200/90">성인 러닝 리그 안내</p>
        <p className="mt-1 text-xs leading-relaxed sm:text-sm">
          전체·성별·거리별 랭킹과 기록 변화를 확인할 수 있습니다.
        </p>
        <Link
          href={runningLeagueDetailHref}
          className="mt-2 inline-block text-xs font-medium text-lime-400 underline-offset-4 hover:text-lime-300 hover:underline"
        >
          리그 상세 보기
        </Link>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500 sm:text-xs">
        이름은 개인정보 보호를 위해 마스킹됩니다. 본인 행만 실명으로 표시됩니다.
      </p>
    </div>
  )

  const mobileHighlightsBody = (
    <div className="space-y-2">
      {!rankingsError && rankingBundle ? (
        <MemberLeagueMomentumStrip
          topRiser={leagueMomentum.topRiser}
          recentPbUpdates={leagueMomentum.recentPbUpdates}
          highlightMemberId={highlightMemberId}
          onMemberSelect={handleMemberSelect}
          rankingViewLabel={
            rankingView === 'pb'
              ? formatPbDistanceLabel(pbDistance)
              : formatCurrentMonthRankingLabel()
          }
        />
      ) : null}
      <p className="text-[10px] leading-relaxed text-zinc-500">
        이름은 마스킹됩니다. 본인만 실명 표시.{' '}
        <Link
          href={runningLeagueDetailHref}
          className="font-medium text-lime-400 underline-offset-2 hover:underline"
        >
          리그 상세
        </Link>
      </p>
    </div>
  )

  if (loading) {
    return <MemberRunningLeagueRankingsSkeleton className={className} />
  }

  return (
    <section
      className={cn(
        'flex w-full max-w-full flex-col gap-2.5 overflow-x-hidden sm:gap-4',
        canEdit && 'pb-[4.75rem] lg:pb-0',
        className,
      )}
    >
      {/* Desktop: status + league card */}
      {leagueStatus && highlightMemberId ? (
        <div className="hidden lg:block">
          <MemberLeagueStatusCard snapshot={leagueStatus} />
        </div>
      ) : null}

      {/* Mobile: graph → status → actions → filters → preview → highlights */}
      <div className="flex flex-col gap-2.5 lg:hidden">
        <div ref={graphPanelRef} className="scroll-mt-4">
          {mobileGraphBody}
        </div>

        {leagueStatus && highlightMemberId ? (
          <MemberLeagueStatusCard snapshot={leagueStatus} compact />
        ) : null}

        <MobileRunRecordCta
          canEdit={canEdit && !readOnly}
          onAddMileage={() => setMileageDialogOpen(true)}
          onAddPb={() => setPbDialogOpen(true)}
          variant="inline"
        />

        <div className="rounded-xl border border-lime-400/20 bg-black/35 p-2">
          <RankingFiltersPanel
            rankingView={rankingView}
            onRankingViewChange={setRankingView}
            genderFilter={genderFilter}
            onGenderFilterChange={setGenderFilter}
            pbDistance={pbDistance}
            onPbDistanceChange={setPbDistance}
            genderFilterBlocked={genderFilterBlocked}
            unclassifiedCount={unclassifiedCount}
            compact
          />
        </div>

        <RankingPreview
          rankingView={rankingView}
          pbDistance={pbDistance}
          activePbLeaderboard={activePbLeaderboard}
          activeMileageLeaderboard={activeMileageLeaderboard}
          rankedCount={rankingsError ? 0 : activeRankedCount}
          highlightMemberId={highlightMemberId}
          selectedMemberId={panelMember?.id ?? null}
          onMemberSelect={handleMemberSelect}
          onViewAll={rankingsError ? undefined : () => setFullRankingOpen(true)}
          rankingsError={rankingsError}
          rankingBundle={rankingBundle}
          genderFilter={genderFilter}
          leagueStatus={leagueStatus}
          onRetry={() => router.refresh()}
        />

        {mobileHighlightsBody}
      </div>

      {/* Desktop: filters + 2-column ranking/graph + highlights */}
      <Card className={cn(rankingCardClass, 'hidden border-lime-400/30 lg:block')}>
        <CardContent className={cn(rankingCardContentClass, 'flex flex-col gap-4 pt-5')}>
          <div className="rounded-xl border border-lime-400/25 bg-black/40 p-4">
            <RankingFiltersPanel
              rankingView={rankingView}
              onRankingViewChange={setRankingView}
              genderFilter={genderFilter}
              onGenderFilterChange={setGenderFilter}
              pbDistance={pbDistance}
              onPbDistanceChange={setPbDistance}
              genderFilterBlocked={genderFilterBlocked}
              unclassifiedCount={unclassifiedCount}
            />
          </div>

          <div className="grid grid-cols-2 items-start gap-4">
            <div className="min-w-0">
              <RankingListCard
                rankedCount={rankingsError ? 0 : activeRankedCount}
                genderFilter={genderFilter}
                onViewAll={rankingsError ? undefined : () => setFullRankingOpen(true)}
                aspirationSlot={
                  highlightMemberId && !rankingsError ? (
                    <MemberRankAspirationPanel insight={myRankAspiration} />
                  ) : null
                }
                footerAction={
                  !readOnly ? (
                    rankingView === 'pb' ? (
                      <RankingCardAction onClick={() => setPbDialogOpen(true)} disabled={!canEdit}>
                        PB 등록/수정
                      </RankingCardAction>
                    ) : (
                      <RankingCardAction
                        onClick={() => setMileageDialogOpen(true)}
                        disabled={!canEdit}
                      >
                        러닝 기록 추가
                      </RankingCardAction>
                    )
                  ) : null
                }
              >
                {rankingListBody}
              </RankingListCard>
            </div>

            <div ref={graphPanelRef} className="min-w-0 scroll-mt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-lime-300/80">
                그래프 · 성장 분석
              </p>
              {graphPanelBody}
            </div>
          </div>

          <div className="space-y-4">{highlightsBody}</div>
        </CardContent>
      </Card>

      <MobileRunRecordCta
        canEdit={canEdit && !readOnly}
        onAddMileage={() => setMileageDialogOpen(true)}
        onAddPb={() => setPbDialogOpen(true)}
        variant="sticky"
      />

      <FullRankingDialog
        open={fullRankingOpen}
        onOpenChange={setFullRankingOpen}
        rankingView={rankingView}
        onRankingViewChange={setRankingView}
        genderFilter={genderFilter}
        onGenderFilterChange={setGenderFilter}
        pbDistance={pbDistance}
        onPbDistanceChange={setPbDistance}
        activePbLeaderboard={activePbLeaderboard}
        activeMileageLeaderboard={activeMileageLeaderboard}
        highlightMemberId={highlightMemberId}
        selectedMemberId={panelMember?.id ?? null}
        onMemberSelect={(memberId, memberName) => {
          handleMemberSelect(memberId, memberName)
          setFullRankingOpen(false)
        }}
        rankingBundle={rankingBundle}
        genderFilterBlocked={genderFilterBlocked}
        unclassifiedCount={unclassifiedCount}
      />

      <MemberRunningPbDialog
        participant={participant}
        pbRecords={pbRecords}
        tableReady={tableReady}
        open={pbDialogOpen}
        onOpenChange={setPbDialogOpen}
        readOnly={readOnly}
        initialDistance={pbDistance as RunningLeagueDistanceEvent}
      />
      <MemberMileageLogDialog
        participant={participant}
        mileageLogs={mileageLogs}
        tableReady={tableReady}
        open={mileageDialogOpen}
        onOpenChange={setMileageDialogOpen}
        readOnly={readOnly}
      />
    </section>
  )
}
