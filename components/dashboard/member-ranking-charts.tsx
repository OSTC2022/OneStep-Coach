'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import type { LeagueRankComparisonChart } from '@/lib/running-league/league-rank-comparison'
import type { LeagueMileageComparisonChart } from '@/lib/running-league/league-mileage-comparison'
import type { LeaguePbRecordComparisonChart } from '@/lib/running-league/league-pb-record-comparison'
import type { MileageHistoryPoint } from '@/lib/running-league/mileage-history'
import type { MileageRankHistoryPoint } from '@/lib/running-league/mileage-rank-history'
import type { RecordChangeChartSummary } from '@/lib/running-league/ranking-improvement-summary'
import type { RankingHistoryPoint } from '@/lib/running-league/ranking-history'
import { RANKING_EMPTY_GRAPH } from '@/lib/running-league/ranking-empty-states'
import {
  BEAT_RIVAL_CHART_COLOR,
  buildMemberChartColorMap,
  getMemberChartColor,
} from '@/lib/running-league/chart-member-colors'
import { formatSecondsToRunningTime } from '@/lib/running-league/records'
import { cn } from '@/lib/utils'

const LIME_EMPHASIS = '#a3e635'
const LIME_BRIGHT = '#d9f99d'
const LIME_MUTED = '#4d7c0f'
const FADED_MEMBER_COLOR = '#3f4f5f'
const FADED_MEMBER_OPACITY = 0.22

function beatRivalLineDot(
  memberId: string,
  beatRivalMemberId?: string | null,
): false | { r: number; fill: string; stroke: string; strokeWidth: number } {
  if (!beatRivalMemberId || memberId !== beatRivalMemberId) return false
  return {
    r: 5,
    fill: BEAT_RIVAL_CHART_COLOR,
    stroke: '#ff4444',
    strokeWidth: 2,
  }
}

function TooltipMemberRow({
  color,
  name,
  value,
  emphasized = false,
  isBeatRival = false,
}: {
  color: string
  name: string
  value: ReactNode
  emphasized?: boolean
  isBeatRival?: boolean
}) {
  return (
    <p
      className={cn(
        'flex items-center gap-2',
        emphasized && 'font-semibold',
        isBeatRival &&
          'rounded-md border border-red-500/90 px-1.5 py-0.5 shadow-[0_0_10px_rgba(239,68,68,0.55)]',
      )}
    >
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full ring-1 ring-white/15',
          isBeatRival && 'ring-2 ring-red-400/80 shadow-[0_0_6px_rgba(239,68,68,0.7)]',
        )}
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-zinc-200">{name}</span>
      <span className="shrink-0 tabular-nums" style={{ color }}>
        {value}
      </span>
    </p>
  )
}

const timeChartConfig = {
  timeSeconds: {
    label: 'PB',
    theme: { light: '#84cc16', dark: '#a3e635' },
  },
  rawTimeSeconds: {
    label: '측정 기록',
    theme: { light: '#a3a3a3', dark: '#52525b' },
  },
}

const rankChartConfig = {
  rank: {
    label: '순위',
    theme: { light: '#84cc16', dark: '#a3e635' },
  },
}

const mileageChartConfig = {
  cumulativeKm: {
    label: '누적 거리',
    theme: { light: '#84cc16', dark: '#a3e635' },
  },
}

function formatMinutesSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function ChartTooltipShell({
  label,
  children,
}: {
  label?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-lime-500/35 bg-zinc-950/95 px-3 py-2 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-sm">
      {label ? <p className="mb-1.5 font-medium text-lime-200">{label}</p> : null}
      <div className="space-y-1 text-zinc-300">{children}</div>
    </div>
  )
}

function RecordChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: RankingHistoryPoint & { chartLabel: string } }>
}) {
  if (!active || !payload?.[0]?.payload) return null
  const data = payload[0].payload
  return (
    <ChartTooltipShell label={data.chartLabel}>
      <p>
        <span className="text-zinc-500">누적 PB </span>
        <span className="font-semibold tabular-nums text-lime-300">{data.timeText}</span>
      </p>
      <p>
        <span className="text-zinc-500">측정 </span>
        <span className="tabular-nums text-zinc-200">{data.rawTimeText}</span>
      </p>
      {data.rank != null ? (
        <p>
          <span className="text-zinc-500">순위 </span>
          <span className="font-medium text-lime-200">{data.rank}위</span>
        </p>
      ) : null}
    </ChartTooltipShell>
  )
}

function RankComparisonTooltip({
  active,
  payload,
  label,
  members,
  memberColorMap,
  isAggregate = false,
  beatRivalMemberId = null,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
  members: LeagueRankComparisonChart['members']
  memberColorMap: Map<string, string>
  isAggregate?: boolean
  beatRivalMemberId?: string | null
}) {
  if (!active || !payload?.length) return null
  const rows = payload
    .filter((item) => item.value != null && item.name?.startsWith('rank_'))
    .map((item) => {
      const memberId = String(item.name).replace('rank_', '')
      const member = members.find((row) => row.memberId === memberId)
      return {
        memberId,
        name: member?.memberName ?? '회원',
        rank: item.value as number,
        isSelected: member?.isSelected ?? false,
      }
    })
    .sort((a, b) => a.rank - b.rank)

  return (
    <ChartTooltipShell label={label}>
      {rows.map((row) => {
        const color = isAggregate
          ? getMemberChartColor(row.memberId, memberColorMap, beatRivalMemberId)
          : row.isSelected
            ? LIME_EMPHASIS
            : '#71717a'
        const isBeatRival =
          beatRivalMemberId != null && row.memberId === beatRivalMemberId
        return (
          <TooltipMemberRow
            key={row.memberId}
            color={color}
            name={row.name}
            value={`${row.rank}위`}
            emphasized={!isAggregate && row.isSelected}
            isBeatRival={isBeatRival}
          />
        )
      })}
    </ChartTooltipShell>
  )
}

function MileageComparisonTooltip({
  active,
  payload,
  label,
  members,
  memberColorMap,
  beatRivalMemberId = null,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
  members: LeagueMileageComparisonChart['members']
  memberColorMap: Map<string, string>
  beatRivalMemberId?: string | null
}) {
  if (!active || !payload?.length) return null
  const rows = payload
    .filter((item) => item.value != null && item.name?.startsWith('km_'))
    .map((item) => {
      const memberId = String(item.name).replace('km_', '')
      const member = members.find((row) => row.memberId === memberId)
      return {
        memberId,
        name: member?.memberName ?? '회원',
        km: item.value as number,
      }
    })
    .sort((a, b) => b.km - a.km)

  return (
    <ChartTooltipShell label={label}>
      {rows.map((row) => {
        const isBeatRival =
          beatRivalMemberId != null && row.memberId === beatRivalMemberId
        return (
          <TooltipMemberRow
            key={row.memberId}
            color={getMemberChartColor(row.memberId, memberColorMap, beatRivalMemberId)}
            name={row.name}
            value={`${row.km.toFixed(1)}km`}
            isBeatRival={isBeatRival}
          />
        )
      })}
    </ChartTooltipShell>
  )
}

function PbRecordComparisonTooltip({
  active,
  payload,
  label,
  members,
  memberColorMap,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number }>
  label?: string
  members: LeaguePbRecordComparisonChart['members']
  memberColorMap: Map<string, string>
}) {
  if (!active || !payload?.length) return null
  const rows = payload
    .filter((item) => item.value != null && item.name?.startsWith('time_'))
    .map((item) => {
      const memberId = String(item.name).replace('time_', '')
      const member = members.find((row) => row.memberId === memberId)
      return {
        memberId,
        name: member?.memberName ?? '회원',
        seconds: item.value as number,
      }
    })
    .sort((a, b) => a.seconds - b.seconds)

  return (
    <ChartTooltipShell label={label}>
      {rows.map((row) => (
        <TooltipMemberRow
          key={row.memberId}
          color={getMemberChartColor(row.memberId, memberColorMap)}
          name={row.name}
          value={formatSecondsToRunningTime(row.seconds)}
        />
      ))}
    </ChartTooltipShell>
  )
}

function MileageChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value?: number; payload?: MileageHistoryPoint & { chartLabel: string } }>
  label?: string
}) {
  if (!active || !payload?.[0]) return null
  const cumulative = Number(payload[0].value ?? 0)
  const daily = payload[0].payload?.dailyKm
  return (
    <ChartTooltipShell label={label}>
      <p>
        <span className="text-zinc-500">누적 </span>
        <span className="font-semibold tabular-nums text-lime-300">{cumulative.toFixed(1)}km</span>
      </p>
      {daily != null ? (
        <p>
          <span className="text-zinc-500">당일 </span>
          <span className="tabular-nums text-zinc-200">+{daily.toFixed(1)}km</span>
        </p>
      ) : null}
    </ChartTooltipShell>
  )
}

function GraphEmptyState({
  className,
  description,
  compact = false,
}: {
  className?: string
  description?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed border-lime-500/25 bg-zinc-950/60 text-center',
        compact ? 'px-3 py-4' : 'px-4 py-6',
        className,
      )}
    >
      <p className={cn('font-medium text-zinc-200', compact ? 'text-xs' : 'text-sm')}>
        {RANKING_EMPTY_GRAPH.title}
      </p>
      <p
        className={cn(
          'mt-1 leading-relaxed text-zinc-500',
          compact ? 'text-[11px] line-clamp-2' : 'text-sm',
        )}
      >
        {description ?? RANKING_EMPTY_GRAPH.description}
      </p>
    </div>
  )
}

import type { RankingView } from '@/lib/running-league/ranking-view'
import { BeatRivalFireTabLabel } from '@/components/dashboard/beat-rival-badges'

type GraphChartTab = 'record' | 'mileage' | 'beat_rival'

export type { GraphChartTab }

export function graphChartTabForRankingView(view: RankingView): GraphChartTab {
  if (view === 'mileage') return 'mileage'
  if (view === 'beat_rival') return 'beat_rival'
  return 'record'
}

export function graphRankingViewForChartTab(tab: GraphChartTab): RankingView | null {
  if (tab === 'mileage') return 'mileage'
  if (tab === 'beat_rival') return 'beat_rival'
  return null
}

const GRAPH_CHART_TABS: Array<{ value: GraphChartTab; label: string; fireLabel?: boolean }> = [
  { value: 'mileage', label: '마일리지' },
  { value: 'beat_rival', label: '이겨라', fireLabel: true },
  { value: 'record', label: '기록' },
]

function GraphChartTabs({
  value,
  onChange,
  className,
  compact = false,
}: {
  value: GraphChartTab
  onChange: (value: GraphChartTab) => void
  className?: string
  compact?: boolean
}) {
  const tabs = GRAPH_CHART_TABS

  if (compact) {
    return (
      <div
        className={cn('grid grid-cols-3 gap-1 rounded-lg border border-lime-500/20 bg-black/40 p-1', className)}
        role="tablist"
        aria-label="그래프 종류"
      >
        {tabs.map((tab) => {
          const isActive = value === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.value)}
              className={cn(
                'min-h-8 rounded-md px-0.5 text-[11px] font-medium leading-tight transition-colors',
                tab.fireLabel && isActive
                  ? 'bg-orange-500/15 ring-1 ring-orange-400/45'
                  : isActive
                    ? 'bg-lime-500/20 text-lime-100'
                    : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {tab.fireLabel ? (
                <BeatRivalFireTabLabel active={isActive} />
              ) : (
                tab.label
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="tablist" aria-label="그래프 종류">
      {tabs.map((tab) => {
        const isActive = value === tab.value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={cn(
              'min-h-9 shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
              tab.fireLabel && isActive
                ? 'border-orange-400/55 bg-orange-500/15 font-medium shadow-[0_0_14px_rgba(249,115,22,0.18)]'
                : isActive
                  ? 'border-lime-400/55 bg-lime-500/15 font-medium text-lime-100 shadow-[0_0_14px_rgba(163,230,53,0.1)]'
                  : 'border-lime-500/20 bg-black/50 text-zinc-400 hover:border-lime-500/35 hover:text-zinc-200',
            )}
          >
            {tab.fireLabel ? (
              <BeatRivalFireTabLabel active={isActive} />
            ) : (
              tab.label
            )}
          </button>
        )
      })}
    </div>
  )
}

function RecordHighlightDot(props: {
  cx?: number
  cy?: number
  index?: number
  dataLength: number
  emphasized: boolean
}) {
  const { cx, cy, index = 0, dataLength, emphasized } = props
  if (cx == null || cy == null) return null
  const isLatest = index === dataLength - 1
  const radius = isLatest && emphasized ? 6 : isLatest ? 5 : emphasized ? 3.5 : 3
  const fill = isLatest ? LIME_BRIGHT : LIME_EMPHASIS
  const stroke = isLatest ? LIME_EMPHASIS : LIME_EMPHASIS
  const strokeWidth = isLatest ? 2 : 0

  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  )
}

interface MemberRankingChartsProps {
  points: RankingHistoryPoint[]
  mileagePoints?: MileageHistoryPoint[]
  mileageRankPoints?: MileageRankHistoryPoint[]
  comparisonChart?: LeagueRankComparisonChart | null
  mileageComparisonChart?: LeagueMileageComparisonChart | null
  pbRecordComparisonChart?: LeaguePbRecordComparisonChart | null
  recordSummary?: RecordChangeChartSummary | null
  rankCaption?: { title: string; trajectory: string | null } | null
  distanceLabel?: string
  mode?: RankingView
  emphasized?: boolean
  soloComparisonHint?: string | null
  aggregateMode?: boolean
  compact?: boolean
  className?: string
  activeTab?: GraphChartTab
  onActiveTabChange?: (tab: GraphChartTab) => void
  beatRivalMemberId?: string | null
}

export function MemberRankingCharts({
  points,
  mileagePoints = [],
  mileageRankPoints = [],
  comparisonChart = null,
  mileageComparisonChart = null,
  pbRecordComparisonChart = null,
  recordSummary = null,
  rankCaption = null,
  mode = 'pb',
  emphasized = false,
  soloComparisonHint = null,
  aggregateMode = false,
  compact = false,
  className,
  activeTab: activeTabProp,
  onActiveTabChange,
  beatRivalMemberId = null,
}: MemberRankingChartsProps) {
  const [internalTab, setInternalTab] = useState<GraphChartTab>(() =>
    graphChartTabForRankingView(mode),
  )
  const activeTab = activeTabProp ?? internalTab
  const setActiveTab = onActiveTabChange ?? setInternalTab

  useEffect(() => {
    if (activeTabProp !== undefined) return
    setInternalTab(graphChartTabForRankingView(mode))
  }, [activeTabProp, mode])
  const timeData = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        chartLabel: point.label,
      })),
    [points],
  )

  const rankData = useMemo(
    () =>
      points
        .filter((point) => point.rank != null)
        .map((point) => ({
          ...point,
          chartLabel: point.label,
          rank: point.rank as number,
        })),
    [points],
  )

  const mileageData = useMemo(
    () =>
      mileagePoints.map((point) => ({
        ...point,
        chartLabel: point.label,
      })),
    [mileagePoints],
  )

  const mileageRankData = useMemo(
    () =>
      mileageRankPoints
        .filter((point) => point.rank != null)
        .map((point) => ({
          ...point,
          chartLabel: point.label,
          rank: point.rank as number,
        })),
    [mileageRankPoints],
  )

  const chartShellClass = cn(
    'min-w-0 transition-shadow duration-300',
    compact
      ? 'rounded-lg bg-transparent p-0'
      : cn(
          'rounded-xl border bg-zinc-950/80 p-3',
          emphasized
            ? 'border-lime-400/40 shadow-[0_0_24px_rgba(163,230,53,0.1)]'
            : 'border-lime-500/20',
        ),
  )

  const chartAxisClass = cn(
    'w-full min-w-0 max-w-full [&_.recharts-cartesian-axis-tick_text]:fill-zinc-500 [&_.recharts-surface]:overflow-visible',
    compact
      ? 'h-[220px] min-h-[220px] max-h-[260px]'
      : 'aspect-[5/2] min-h-[180px]',
  )

  const rankEmptyDescription =
    soloComparisonHint ??
    (aggregateMode
      ? '등록된 기록이 있으면 전체 회원 순위 그래프가 표시됩니다.'
      : mode === 'mileage'
        ? '러닝 기록을 추가하면 마일리지 순위 그래프가 표시됩니다.'
        : 'PB를 등록하면 순위 그래프가 표시됩니다.')

  const hasAnyChartData =
    rankData.length > 0 ||
    mileageRankData.length > 0 ||
    (comparisonChart?.rows?.length ?? 0) > 0 ||
    (mileageComparisonChart?.rows?.length ?? 0) > 0 ||
    (pbRecordComparisonChart?.rows?.length ?? 0) > 0 ||
    timeData.length > 0 ||
    mileageData.length > 0

  if (!hasAnyChartData) {
    return (
      <GraphEmptyState
        className={cn(compact && 'px-3 py-4', className)}
        compact={compact}
        description={
          soloComparisonHint ??
          (aggregateMode
            ? '회원 이름을 누르면 개인 그래프로 전환할 수 있습니다.'
            : '첫 기록이 등록되었습니다. 다른 회원이 기록을 추가하면 비교 그래프가 표시됩니다.')
        }
      />
    )
  }

  const recordPanel =
    pbRecordComparisonChart && pbRecordComparisonChart.rows.length > 0 ? (
      <PbRecordAggregateTrendChart
        chart={pbRecordComparisonChart}
        chartShellClass={chartShellClass}
        chartAxisClass={chartAxisClass}
        compact={compact}
      />
    ) : aggregateMode ? (
      <GraphEmptyState
        compact={compact}
        description="회원 이름을 누르면 개인 PB 기록 그래프를 볼 수 있습니다."
      />
    ) : timeData.length === 0 ? (
      <GraphEmptyState
        compact={compact}
        description="PB 기록을 등록하면 기록 그래프가 표시됩니다."
      />
    ) : (
      <RecordTrendChart
        timeData={timeData}
        recordSummary={recordSummary}
        chartShellClass={chartShellClass}
        chartAxisClass={chartAxisClass}
        emphasized={emphasized}
        compact={compact}
      />
    )

  const mileagePanel =
    mileageComparisonChart && mileageComparisonChart.rows.length > 0 ? (
      <MileageAggregateTrendChart
        chart={mileageComparisonChart}
        chartShellClass={chartShellClass}
        chartAxisClass={chartAxisClass}
        compact={compact}
        beatRivalMemberId={beatRivalMemberId}
      />
    ) : mileageData.length === 0 ? (
      <GraphEmptyState
        compact={compact}
        description="이번 달 러닝 기록을 추가하면 마일리지 그래프가 표시됩니다."
      />
    ) : (
      <MileageRecordTrendChart
        data={mileageData}
        chartShellClass={chartShellClass}
        chartAxisClass={chartAxisClass}
        emphasized={emphasized}
        compact={compact}
      />
    )

  const beatRivalPanel =
    mileageComparisonChart && mileageComparisonChart.rows.length > 0 ? (
      <MileageAggregateTrendChart
        chart={mileageComparisonChart}
        chartShellClass={chartShellClass}
        chartAxisClass={chartAxisClass}
        compact={compact}
        beatRivalMemberId={beatRivalMemberId}
        title="이겨라 · 마일리지"
      />
    ) : (
      mileagePanel
    )

  return (
    <div className={cn('grid min-w-0 grid-cols-1', compact ? 'gap-2' : 'gap-3', className)}>
      <GraphChartTabs value={activeTab} onChange={setActiveTab} compact={compact} />
      {activeTab === 'record' ? recordPanel : null}
      {activeTab === 'mileage' ? mileagePanel : null}
      {activeTab === 'beat_rival' ? beatRivalPanel : null}
    </div>
  )
}

function MileageRankTrendChart({
  data,
  chartShellClass,
  chartAxisClass,
  emphasized,
  compact = false,
}: {
  data: Array<MileageRankHistoryPoint & { chartLabel: string; rank: number }>
  chartShellClass: string
  chartAxisClass: string
  emphasized: boolean
  compact?: boolean
}) {
  return (
    <div className={chartShellClass}>
      {!compact ? (
        <p className="mb-2 text-xs font-medium text-lime-300">이번 달 마일리지 순위</p>
      ) : null}
      <ChartContainer config={rankChartConfig} className={chartAxisClass}>
        <LineChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-lime-500/10" />
          <XAxis
            dataKey="chartLabel"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis tickLine={false} axisLine={false} width={28} reversed allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}위`} />} />
          <Line
            type="monotone"
            dataKey="rank"
            stroke={LIME_EMPHASIS}
            strokeWidth={emphasized ? 3 : 2.5}
            dot={{ r: emphasized ? 4 : 3, fill: LIME_EMPHASIS }}
            activeDot={{ r: 6, fill: LIME_BRIGHT, stroke: LIME_EMPHASIS, strokeWidth: 2 }}
          />
        </LineChart>
      </ChartContainer>
      {!compact ? (
        <p className="mt-1 text-[10px] text-zinc-500">1위가 위쪽 · 러닝 기록 추가 시점마다 순위가 갱신됩니다.</p>
      ) : null}
    </div>
  )
}

function MileageRecordTrendChart({
  data,
  chartShellClass,
  chartAxisClass,
  emphasized,
  compact = false,
}: {
  data: Array<MileageHistoryPoint & { chartLabel: string }>
  chartShellClass: string
  chartAxisClass: string
  emphasized: boolean
  compact?: boolean
}) {
  return (
    <div className={chartShellClass}>
      {!compact ? (
        <p className="mb-2 text-xs font-medium text-lime-300">이번 달 누적 마일리지</p>
      ) : null}
      <ChartContainer config={mileageChartConfig} className={chartAxisClass}>
        <LineChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-lime-500/10" />
          <XAxis
            dataKey="chartLabel"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}km`} />
          <Tooltip content={<MileageChartTooltip />} />
          <Line
            type="monotone"
            dataKey="cumulativeKm"
            stroke={LIME_EMPHASIS}
            strokeWidth={emphasized ? 2.5 : 2}
            dot={{ r: emphasized ? 4 : 3, fill: LIME_EMPHASIS }}
            activeDot={{ r: 6, fill: LIME_BRIGHT, stroke: LIME_EMPHASIS, strokeWidth: 2 }}
          />
        </LineChart>
      </ChartContainer>
      {!compact ? (
        <p className="mt-1 text-[10px] text-zinc-500">위로 갈수록 이번 달 누적 거리가 늘어납니다.</p>
      ) : null}
    </div>
  )
}

function RankTrendChart({
  rankData,
  comparisonChart,
  rankCaption,
  chartShellClass,
  chartAxisClass,
  emphasized,
  compact = false,
  aggregateMode = false,
  beatRivalMemberId = null,
}: {
  rankData: Array<RankingHistoryPoint & { chartLabel: string; rank: number }>
  comparisonChart: LeagueRankComparisonChart | null
  rankCaption: { title: string; trajectory: string | null } | null
  chartShellClass: string
  chartAxisClass: string
  emphasized: boolean
  compact?: boolean
  aggregateMode?: boolean
  beatRivalMemberId?: string | null
}) {
  const comparisonRows = comparisonChart?.rows ?? []
  const comparisonMembers = comparisonChart?.members ?? []
  const selectedMemberId = comparisonChart?.selectedMemberId ?? null
  const isAggregate = aggregateMode || selectedMemberId == null
  const hasComparison = comparisonRows.length > 0 && comparisonMembers.length > 0
  const memberColorMap = useMemo(
    () => buildMemberChartColorMap(comparisonMembers.map((member) => member.memberId)),
    [comparisonMembers],
  )

  if (!hasComparison && rankData.length === 0) {
    return <GraphEmptyState />
  }

  return (
    <div className={chartShellClass}>
      {!compact ? (
        <div className="mb-2 space-y-1">
          <p className="text-xs font-medium text-lime-300">
            {isAggregate ? '전체 회원 순위' : '순위'}
          </p>
          {rankCaption && !isAggregate ? (
            <>
              <p className="text-[11px] text-zinc-500">{rankCaption.title}</p>
              {rankCaption.trajectory ? (
                <p className="text-xs font-medium text-lime-200/90">{rankCaption.trajectory}</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {hasComparison ? (
        <ChartContainer config={rankChartConfig} className={chartAxisClass}>
          <LineChart data={comparisonRows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-lime-500/10" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis tickLine={false} axisLine={false} width={28} reversed allowDecimals={false} />
            <Tooltip
              content={
                <RankComparisonTooltip
                  members={comparisonMembers}
                  memberColorMap={memberColorMap}
                  isAggregate={isAggregate}
                  beatRivalMemberId={beatRivalMemberId}
                />
              }
            />
            {isAggregate
              ? comparisonMembers.map((member) => {
                  const isBeatRival =
                    beatRivalMemberId != null && member.memberId === beatRivalMemberId
                  return (
                    <Line
                      key={member.memberId}
                      type="monotone"
                      dataKey={`rank_${member.memberId}`}
                      name={`rank_${member.memberId}`}
                      stroke={getMemberChartColor(
                        member.memberId,
                        memberColorMap,
                        beatRivalMemberId,
                      )}
                      strokeWidth={isBeatRival ? 2.5 : 2}
                      dot={beatRivalLineDot(member.memberId, beatRivalMemberId)}
                      activeDot={
                        isBeatRival
                          ? {
                              r: 7,
                              fill: BEAT_RIVAL_CHART_COLOR,
                              stroke: '#ff4444',
                              strokeWidth: 2.5,
                            }
                          : { r: 5, fill: getMemberChartColor(member.memberId, memberColorMap) }
                      }
                      connectNulls
                      isAnimationActive={false}
                    />
                  )
                })
              : (
                <>
                  {comparisonMembers
                    .filter((member) => !member.isSelected)
                    .map((member) => (
                      <Line
                        key={member.memberId}
                        type="monotone"
                        dataKey={`rank_${member.memberId}`}
                        name={`rank_${member.memberId}`}
                        stroke={FADED_MEMBER_COLOR}
                        strokeOpacity={FADED_MEMBER_OPACITY}
                        strokeWidth={1}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                      />
                    ))}
                  {selectedMemberId ? (
                    <Line
                      type="monotone"
                      dataKey={`rank_${selectedMemberId}`}
                      name={`rank_${selectedMemberId}`}
                      stroke={LIME_EMPHASIS}
                      strokeWidth={emphasized ? 3.5 : 3}
                      dot={{
                        r: emphasized ? 5 : 4,
                        fill: LIME_EMPHASIS,
                        stroke: LIME_BRIGHT,
                        strokeWidth: 1,
                      }}
                      activeDot={{ r: 7, fill: LIME_BRIGHT, stroke: LIME_EMPHASIS, strokeWidth: 2 }}
                      connectNulls
                    />
                  ) : null}
                </>
              )}
          </LineChart>
        </ChartContainer>
      ) : (
        <ChartContainer config={rankChartConfig} className={chartAxisClass}>
          <LineChart data={rankData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-lime-500/10" />
            <XAxis
              dataKey="chartLabel"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis tickLine={false} axisLine={false} width={28} reversed allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}위`} />} />
            <Line
              type="monotone"
              dataKey="rank"
              stroke={LIME_EMPHASIS}
              strokeWidth={emphasized ? 3 : 2.5}
              dot={{ r: emphasized ? 4 : 3, fill: LIME_EMPHASIS }}
              activeDot={{ r: 6, fill: LIME_BRIGHT, stroke: LIME_EMPHASIS, strokeWidth: 2 }}
            />
          </LineChart>
        </ChartContainer>
      )}
      {!compact ? (
        <p className="mt-1 text-[10px] text-zinc-500">
          {isAggregate
            ? '1위가 위쪽 · 회원별 색상으로 표시됩니다.'
            : '1위가 위쪽 · 선택 회원은 라임색으로 강조됩니다.'}
        </p>
      ) : null}
    </div>
  )
}

function PbRecordAggregateTrendChart({
  chart,
  chartShellClass,
  chartAxisClass,
  compact = false,
}: {
  chart: LeaguePbRecordComparisonChart
  chartShellClass: string
  chartAxisClass: string
  compact?: boolean
}) {
  const memberColorMap = useMemo(
    () => buildMemberChartColorMap(chart.members.map((member) => member.memberId)),
    [chart.members],
  )

  return (
    <div className={chartShellClass}>
      {!compact ? (
        <p className={cn('mb-2 text-xs font-medium text-lime-300')}>
          전체 회원 PB 기록 추이
        </p>
      ) : null}
      <ChartContainer config={timeChartConfig} className={chartAxisClass}>
        <LineChart data={chart.rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-lime-500/10" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            reversed
            tickFormatter={(value) => formatMinutesSeconds(Number(value))}
          />
          <Tooltip
            content={
              <PbRecordComparisonTooltip members={chart.members} memberColorMap={memberColorMap} />
            }
          />
          {chart.members.map((member) => (
            <Line
              key={member.memberId}
              type="stepAfter"
              dataKey={`time_${member.memberId}`}
              name={`time_${member.memberId}`}
              stroke={getMemberChartColor(member.memberId, memberColorMap)}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
      {!compact ? (
        <p className="mt-1 text-[10px] text-zinc-500">
          아래로 갈수록 더 빠른 PB · 회원별 색상으로 표시됩니다.
        </p>
      ) : null}
    </div>
  )
}

function MileageAggregateTrendChart({
  chart,
  chartShellClass,
  chartAxisClass,
  compact = false,
  beatRivalMemberId = null,
  title = '전체 회원 누적 마일리지',
}: {
  chart: LeagueMileageComparisonChart
  chartShellClass: string
  chartAxisClass: string
  compact?: boolean
  beatRivalMemberId?: string | null
  title?: string
}) {
  const memberColorMap = useMemo(
    () => buildMemberChartColorMap(chart.members.map((member) => member.memberId)),
    [chart.members],
  )

  return (
    <div className={chartShellClass}>
      {!compact ? (
        <p className="mb-2 text-xs font-medium text-lime-300">{title}</p>
      ) : null}
      <ChartContainer config={mileageChartConfig} className={chartAxisClass}>
        <LineChart data={chart.rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-lime-500/10" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}km`} />
          <Tooltip
            content={
              <MileageComparisonTooltip
                members={chart.members}
                memberColorMap={memberColorMap}
                beatRivalMemberId={beatRivalMemberId}
              />
            }
          />
          {chart.members.map((member) => {
            const isBeatRival =
              beatRivalMemberId != null && member.memberId === beatRivalMemberId
            return (
              <Line
                key={member.memberId}
                type="monotone"
                dataKey={`km_${member.memberId}`}
                name={`km_${member.memberId}`}
                stroke={getMemberChartColor(member.memberId, memberColorMap, beatRivalMemberId)}
                strokeWidth={isBeatRival ? 2.5 : 2}
                dot={beatRivalLineDot(member.memberId, beatRivalMemberId)}
                activeDot={
                  isBeatRival
                    ? {
                        r: 7,
                        fill: BEAT_RIVAL_CHART_COLOR,
                        stroke: '#ff4444',
                        strokeWidth: 2.5,
                      }
                    : { r: 5, fill: getMemberChartColor(member.memberId, memberColorMap) }
                }
                connectNulls
                isAnimationActive={false}
              />
            )
          })}
        </LineChart>
      </ChartContainer>
      {!compact ? (
        <p className="mt-1 text-[10px] text-zinc-500">위로 갈수록 이번 달 누적 거리가 늘어납니다.</p>
      ) : null}
    </div>
  )
}

function RecordTrendChart({
  timeData,
  recordSummary,
  chartShellClass,
  chartAxisClass,
  emphasized,
  compact = false,
}: {
  timeData: Array<RankingHistoryPoint & { chartLabel: string }>
  recordSummary: RecordChangeChartSummary | null
  chartShellClass: string
  chartAxisClass: string
  emphasized: boolean
  compact?: boolean
}) {
  if (timeData.length === 0) {
    return <GraphEmptyState />
  }

  return (
    <div className={chartShellClass}>
      {!compact ? (
        <div className="mb-2 space-y-1">
          <p className="text-xs font-medium text-lime-300">기록</p>
          {recordSummary?.timeTrajectory ? (
            <p className="text-xs font-medium text-lime-100/90">{recordSummary.timeTrajectory}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-0.5">
            {recordSummary?.vsMonthStart ? (
              <span className="rounded-full border border-lime-500/25 bg-lime-500/10 px-2.5 py-0.5 text-[11px] font-medium text-lime-200">
                {recordSummary.vsMonthStart}
              </span>
            ) : null}
            {recordSummary?.vsSeasonStart ? (
              <span className="rounded-full border border-lime-500/15 bg-black/40 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">
                {recordSummary.vsSeasonStart}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <ChartContainer config={timeChartConfig} className={chartAxisClass}>
        <LineChart data={timeData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-lime-500/10" />
          <XAxis
            dataKey="chartLabel"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            reversed
            tickFormatter={(value) => formatMinutesSeconds(Number(value))}
          />
          <Tooltip content={<RecordChartTooltip />} />
          <Line
            type="monotone"
            dataKey="rawTimeSeconds"
            stroke={LIME_MUTED}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeOpacity={0.5}
            dot={{ r: 2.5, fill: '#52525b' }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="stepAfter"
            dataKey="timeSeconds"
            stroke={LIME_EMPHASIS}
            strokeWidth={emphasized ? 2.5 : 2}
            dot={(props) => (
              <RecordHighlightDot
                {...props}
                dataLength={timeData.length}
                emphasized={emphasized}
              />
            )}
            activeDot={{ r: 7, fill: LIME_BRIGHT, stroke: LIME_EMPHASIS, strokeWidth: 2 }}
          />
        </LineChart>
      </ChartContainer>
      <p className="mt-1 text-[10px] text-zinc-500">
        라임 실선=누적 PB · 점선=개별 측정 · 아래로 갈수록 더 빠른 기록
      </p>
    </div>
  )
}
