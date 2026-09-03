'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { ATTENDANCE_KING_DAY_RULE_LABEL } from '@/lib/running-league/attendance-king'
import type { LeagueRankComparisonChart } from '@/lib/running-league/league-rank-comparison'
import type { LeagueMileageComparisonChart } from '@/lib/running-league/league-mileage-comparison'
import type { LeaguePbRecordComparisonChart } from '@/lib/running-league/league-pb-record-comparison'
import type { AttendanceHistoryPoint } from '@/lib/running-league/attendance-history'
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

/** 출석 등 정수 회수 차트 — Y축을 1회 단위로 맞춤 */
function resolveCountChartYMax(values: ReadonlyArray<number>): number {
  const max = values.reduce((peak, value) => Math.max(peak, value), 0)
  return Math.max(1, Math.ceil(max))
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
      <span className="whitespace-nowrap text-zinc-200">{name}</span>
      <span className="ml-auto shrink-0 pl-2 tabular-nums" style={{ color }}>
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

const COMPARISON_TOOLTIP_MAX_WIDTH = 360
const COMPARISON_TOOLTIP_PADDING = 8
const COMPARISON_TOOLTIP_GAP = 10
const COMPARISON_TOOLTIP_CURSOR = {
  stroke: 'rgba(161, 161, 170, 0.55)',
  strokeWidth: 1,
}

function isMobileChartViewport() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 767px)').matches
}

function resolveComparisonTooltipPosition(
  coordinate?: Partial<{ x: number; y: number }>,
  viewBox?: Partial<{ width: number; x: number }>,
) {
  const chartWidth = viewBox?.width ?? 0
  const anchorX = coordinate?.x ?? COMPARISON_TOOLTIP_PADDING
  const y = COMPARISON_TOOLTIP_PADDING
  const pad = COMPARISON_TOOLTIP_PADDING
  const gap = COMPARISON_TOOLTIP_GAP
  const tooltipWidth = Math.min(
    COMPARISON_TOOLTIP_MAX_WIDTH,
    Math.max(200, chartWidth - pad * 2),
  )

  const overflowRight = anchorX + gap + tooltipWidth > chartWidth - pad
  const mobile = isMobileChartViewport()
  const preferLeft = mobile
    ? anchorX >= chartWidth * 0.38 || overflowRight
    : overflowRight

  const x = preferLeft
    ? Math.max(pad, anchorX - tooltipWidth - gap)
    : Math.min(chartWidth - tooltipWidth - pad, Math.max(pad, anchorX + gap))

  return { x, y }
}

function ComparisonTooltipPositionSync({
  coordinate,
  viewBox,
  onUpdate,
}: {
  coordinate?: Partial<{ x: number; y: number }>
  viewBox?: Partial<{ width: number; x: number }>
  onUpdate: (
    coordinate?: Partial<{ x: number; y: number }>,
    viewBox?: Partial<{ width: number; x: number }>,
  ) => void
}) {
  useLayoutEffect(() => {
    onUpdate(coordinate, viewBox)
  }, [coordinate?.x, coordinate?.y, onUpdate, viewBox?.width])

  return null
}

type ComparisonTooltipRenderProps = {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
  coordinate?: Partial<{ x: number; y: number }>
  viewBox?: Partial<{ width: number; x: number }>
}

function createComparisonTooltipRenderer(
  updateTooltipPosition: (
    coordinate?: Partial<{ x: number; y: number }>,
    viewBox?: Partial<{ width: number; x: number }>,
  ) => void,
  render: (props: ComparisonTooltipRenderProps) => ReactNode,
) {
  return function ComparisonTooltipRenderer(props: ComparisonTooltipRenderProps) {
    return (
      <>
        <ComparisonTooltipPositionSync
          coordinate={props.coordinate}
          viewBox={props.viewBox}
          onUpdate={updateTooltipPosition}
        />
        {render(props)}
      </>
    )
  }
}

function useComparisonChartTooltip() {
  const [listDragging, setListDragging] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({
    x: COMPARISON_TOOLTIP_PADDING,
    y: COMPARISON_TOOLTIP_PADDING,
  })

  const updateTooltipPosition = useCallback(
    (
      coordinate?: Partial<{ x: number; y: number }>,
      viewBox?: Partial<{ width: number; x: number }>,
    ) => {
      const next = resolveComparisonTooltipPosition(coordinate, viewBox)
      setTooltipPosition((prev) =>
        prev.x === next.x && prev.y === next.y ? prev : next,
      )
    },
    [],
  )

  return {
    listDragging,
    setListDragging,
    updateTooltipPosition,
    tooltipCursor: listDragging ? false : COMPARISON_TOOLTIP_CURSOR,
    tooltipPosition,
    tooltipWrapperStyle: {
      pointerEvents: 'auto' as const,
      outline: 'none' as const,
      zIndex: 5,
    },
  }
}

function ScrollableTooltipMemberList({
  children,
  onDragChange,
}: {
  children: ReactNode
  onDragChange?: (dragging: boolean) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ y: number; scrollTop: number } | null>(null)

  function endDrag(pointerId: number) {
    const el = scrollRef.current
    dragRef.current = null
    onDragChange?.(false)
    if (el?.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId)
    }
  }

  return (
    <div
      ref={scrollRef}
      className="max-h-[min(10.5rem,42vh)] overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onPointerDown={(event) => {
        const el = scrollRef.current
        if (!el || el.scrollHeight <= el.clientHeight + 1) return
        event.stopPropagation()
        dragRef.current = { y: event.clientY, scrollTop: el.scrollTop }
        el.setPointerCapture(event.pointerId)
        onDragChange?.(true)
      }}
      onPointerMove={(event) => {
        const el = scrollRef.current
        const drag = dragRef.current
        if (!el || !drag) return
        event.preventDefault()
        el.scrollTop = drag.scrollTop - (event.clientY - drag.y)
      }}
      onPointerUp={(event) => endDrag(event.pointerId)}
      onPointerCancel={(event) => endDrag(event.pointerId)}
    >
      <div className="space-y-1 text-zinc-300">{children}</div>
    </div>
  )
}

function ChartTooltipShell({
  label,
  children,
  scrollable = false,
  onListDragChange,
}: {
  label?: string
  children: ReactNode
  scrollable?: boolean
  onListDragChange?: (dragging: boolean) => void
}) {
  return (
    <div className="w-max min-w-[10.5rem] max-w-[calc(100%-0.5rem)] rounded-lg border border-lime-500/35 bg-zinc-950/95 px-3 py-2 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-sm">
      {label ? <p className="mb-1.5 font-medium text-lime-200">{label}</p> : null}
      {scrollable ? (
        <ScrollableTooltipMemberList onDragChange={onListDragChange}>
          {children}
        </ScrollableTooltipMemberList>
      ) : (
        <div className="space-y-1 text-zinc-300">{children}</div>
      )}
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
  onListDragChange,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
  members: LeagueRankComparisonChart['members']
  memberColorMap: Map<string, string>
  isAggregate?: boolean
  beatRivalMemberId?: string | null
  onListDragChange?: (dragging: boolean) => void
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
    <ChartTooltipShell
      label={label}
      scrollable={rows.length >= 3}
      onListDragChange={onListDragChange}
    >
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
  valueUnit = 'km',
  onListDragChange,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
  members: LeagueMileageComparisonChart['members']
  memberColorMap: Map<string, string>
  beatRivalMemberId?: string | null
  valueUnit?: 'km' | '회'
  onListDragChange?: (dragging: boolean) => void
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
        value: item.value as number,
      }
    })
    .sort((a, b) => b.value - a.value)

  return (
    <ChartTooltipShell
      label={label}
      scrollable={rows.length >= 3}
      onListDragChange={onListDragChange}
    >
      {rows.map((row) => {
        const isBeatRival =
          beatRivalMemberId != null && row.memberId === beatRivalMemberId
        const formattedValue =
          valueUnit === '회'
            ? `${Math.round(row.value)}회`
            : `${row.value.toFixed(1)}km`
        return (
          <TooltipMemberRow
            key={row.memberId}
            color={getMemberChartColor(row.memberId, memberColorMap, beatRivalMemberId)}
            name={row.name}
            value={formattedValue}
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
  onListDragChange,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number }>
  label?: string
  members: LeaguePbRecordComparisonChart['members']
  memberColorMap: Map<string, string>
  onListDragChange?: (dragging: boolean) => void
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
    <ChartTooltipShell
      label={label}
      scrollable={rows.length >= 3}
      onListDragChange={onListDragChange}
    >
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

type GraphChartTab = 'record' | 'mileage' | 'beat_rival' | 'attendance'

export type { GraphChartTab }

export function graphChartTabForRankingView(view: RankingView): GraphChartTab {
  if (view === 'mileage') return 'mileage'
  if (view === 'attendance') return 'attendance'
  if (view === 'beat_rival') return 'beat_rival'
  return 'record'
}

export function graphRankingViewForChartTab(tab: GraphChartTab): RankingView | null {
  if (tab === 'mileage') return 'mileage'
  if (tab === 'beat_rival') return 'beat_rival'
  if (tab === 'attendance') return 'attendance'
  if (tab === 'record') return 'pb'
  return null
}

const GRAPH_CHART_TABS: Array<{ value: GraphChartTab; label: string; fireLabel?: boolean }> = [
  { value: 'mileage', label: '마일리지' },
  { value: 'beat_rival', label: '이겨라', fireLabel: true },
  { value: 'attendance', label: '출석왕' },
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
        className={cn('grid grid-cols-4 gap-1 rounded-lg border border-lime-500/20 bg-black/40 p-1', className)}
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
  attendancePoints?: AttendanceHistoryPoint[]
  mileageRankPoints?: MileageRankHistoryPoint[]
  comparisonChart?: LeagueRankComparisonChart | null
  mileageComparisonChart?: LeagueMileageComparisonChart | null
  beatRivalMileageComparisonChart?: LeagueMileageComparisonChart | null
  attendanceComparisonChart?: LeagueMileageComparisonChart | null
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
  /** 선택 시 해당 회원 라인만 표시 (색상은 전체 회원 팔레트 유지) */
  focusMemberId?: string | null
}

export function MemberRankingCharts({
  points,
  mileagePoints = [],
  attendancePoints = [],
  mileageRankPoints = [],
  comparisonChart = null,
  mileageComparisonChart = null,
  beatRivalMileageComparisonChart = null,
  attendanceComparisonChart = null,
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
  focusMemberId = null,
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

  const attendanceData = useMemo(
    () =>
      attendancePoints.map((point) => ({
        ...point,
        chartLabel: point.label,
      })),
    [attendancePoints],
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
    (attendanceComparisonChart?.rows?.length ?? 0) > 0 ||
    (pbRecordComparisonChart?.rows?.length ?? 0) > 0 ||
    timeData.length > 0 ||
    mileageData.length > 0 ||
    attendanceData.length > 0

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
        focusMemberId={focusMemberId}
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

  const focusedMileageTitle = focusMemberId ? '누적 마일리지' : undefined
  const mileagePanel =
    mileageComparisonChart && mileageComparisonChart.rows.length > 0 ? (
      <MileageAggregateTrendChart
        chart={mileageComparisonChart}
        chartShellClass={chartShellClass}
        chartAxisClass={chartAxisClass}
        compact={compact}
        focusMemberId={focusMemberId}
        title={focusedMileageTitle}
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

  const beatRivalChart = focusMemberId
    ? mileageComparisonChart
    : (beatRivalMileageComparisonChart ?? mileageComparisonChart)
  const beatRivalPanel =
    beatRivalChart && beatRivalChart.rows.length > 0 ? (
      <MileageAggregateTrendChart
        chart={beatRivalChart}
        chartShellClass={chartShellClass}
        chartAxisClass={chartAxisClass}
        compact={compact}
        beatRivalMemberId={focusMemberId ? null : beatRivalMemberId}
        focusMemberId={focusMemberId}
        title="이겨라 · 마일리지"
      />
    ) : (
      <GraphEmptyState
        compact={compact}
        description="이번 기간 러닝 기록이 쌓이면 이겨라 그래프가 표시됩니다."
      />
    )

  const attendancePanel =
    attendanceComparisonChart && attendanceComparisonChart.rows.length > 0 ? (
      <MileageAggregateTrendChart
        chart={attendanceComparisonChart}
        chartShellClass={chartShellClass}
        chartAxisClass={chartAxisClass}
        compact={compact}
        focusMemberId={focusMemberId}
        title={focusMemberId ? '출석 횟수' : '전체 회원 출석 횟수'}
        valueUnit="회"
        footerHint={`${ATTENDANCE_KING_DAY_RULE_LABEL} · 위로 갈수록 출석이 늘어납니다.`}
      />
    ) : attendanceData.length > 0 ? (
      <AttendanceRecordTrendChart
        data={attendanceData}
        chartShellClass={chartShellClass}
        chartAxisClass={chartAxisClass}
        emphasized={emphasized}
        compact={compact}
      />
    ) : (
      <GraphEmptyState
        compact={compact}
        description="3km 이상 러닝 기록이 쌓이면 출석왕 그래프가 표시됩니다."
      />
    )

  return (
    <div className={cn('grid min-w-0 grid-cols-1', compact ? 'gap-2' : 'gap-3', className)}>
      <GraphChartTabs value={activeTab} onChange={setActiveTab} compact={compact} />
      {activeTab === 'record' ? recordPanel : null}
      {activeTab === 'mileage' ? mileagePanel : null}
      {activeTab === 'beat_rival' ? beatRivalPanel : null}
      {activeTab === 'attendance' ? attendancePanel : null}
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

function AttendanceRecordTrendChart({
  data,
  chartShellClass,
  chartAxisClass,
  emphasized,
  compact = false,
}: {
  data: Array<AttendanceHistoryPoint & { chartLabel: string }>
  chartShellClass: string
  chartAxisClass: string
  emphasized: boolean
  compact?: boolean
}) {
  const attendanceYMax = useMemo(
    () => resolveCountChartYMax(data.map((point) => point.cumulativeCount)),
    [data],
  )

  return (
    <div className={chartShellClass}>
      {!compact ? (
        <p className="mb-2 text-xs font-medium text-lime-300">이번 달 출석 누적</p>
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
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
            domain={[0, attendanceYMax]}
            tickFormatter={(v) => `${v}회`}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => [`${value}회`, '출석']}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="cumulativeCount"
            stroke={LIME_EMPHASIS}
            strokeWidth={emphasized ? 2.5 : 2}
            dot={{ r: emphasized ? 4 : 3, fill: LIME_EMPHASIS }}
            activeDot={{ r: 6, fill: LIME_BRIGHT, stroke: LIME_EMPHASIS, strokeWidth: 2 }}
          />
        </LineChart>
      </ChartContainer>
      {!compact ? (
        <p className="mt-1 text-[10px] text-zinc-500">{ATTENDANCE_KING_DAY_RULE_LABEL}</p>
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
  const {
    setListDragging,
    updateTooltipPosition,
    tooltipCursor,
    tooltipPosition,
    tooltipWrapperStyle,
  } = useComparisonChartTooltip()

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
              allowEscapeViewBox={{ x: true, y: true }}
              reverseDirection={{ x: true, y: false }}
              cursor={tooltipCursor}
              position={tooltipPosition}
              wrapperStyle={tooltipWrapperStyle}
              animationDuration={0}
              content={createComparisonTooltipRenderer(updateTooltipPosition, (props) => (
                <RankComparisonTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label}
                  members={comparisonMembers}
                  memberColorMap={memberColorMap}
                  isAggregate={isAggregate}
                  beatRivalMemberId={beatRivalMemberId}
                  onListDragChange={setListDragging}
                />
              ))}
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
                          : {
                        r: 5,
                        fill: getMemberChartColor(
                          member.memberId,
                          memberColorMap,
                          beatRivalMemberId,
                        ),
                      }
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
  focusMemberId = null,
}: {
  chart: LeaguePbRecordComparisonChart
  chartShellClass: string
  chartAxisClass: string
  compact?: boolean
  focusMemberId?: string | null
}) {
  const memberColorMap = useMemo(
    () => buildMemberChartColorMap(chart.members.map((member) => member.memberId)),
    [chart.members],
  )
  const visibleMembers = useMemo(
    () =>
      focusMemberId
        ? chart.members.filter((member) => member.memberId === focusMemberId)
        : chart.members,
    [chart.members, focusMemberId],
  )
  const {
    setListDragging,
    updateTooltipPosition,
    tooltipCursor,
    tooltipPosition,
    tooltipWrapperStyle,
  } = useComparisonChartTooltip()

  return (
    <div className={chartShellClass}>
      {!compact ? (
        <p className={cn('mb-2 text-xs font-medium text-lime-300')}>
          {focusMemberId ? 'PB 기록 추이' : '전체 회원 PB 기록 추이'}
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
            allowEscapeViewBox={{ x: true, y: true }}
            reverseDirection={{ x: true, y: false }}
            cursor={tooltipCursor}
            position={tooltipPosition}
            wrapperStyle={tooltipWrapperStyle}
            animationDuration={0}
            content={createComparisonTooltipRenderer(updateTooltipPosition, (props) => (
              <PbRecordComparisonTooltip
                active={props.active}
                payload={props.payload}
                label={props.label}
                members={visibleMembers}
                memberColorMap={memberColorMap}
                onListDragChange={setListDragging}
              />
            ))}
          />
          {visibleMembers.map((member) => (
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
  focusMemberId = null,
  title = '전체 회원 누적 마일리지',
  valueUnit = 'km',
  footerHint,
}: {
  chart: LeagueMileageComparisonChart
  chartShellClass: string
  chartAxisClass: string
  compact?: boolean
  beatRivalMemberId?: string | null
  focusMemberId?: string | null
  title?: string
  valueUnit?: 'km' | '회'
  footerHint?: string
}) {
  const memberColorMap = useMemo(
    () =>
      buildMemberChartColorMap(
        chart.members.map((member) => member.memberId),
        { beatRivalMemberId },
      ),
    [beatRivalMemberId, chart.members],
  )
  const visibleMembers = useMemo(
    () =>
      focusMemberId
        ? chart.members.filter((member) => member.memberId === focusMemberId)
        : chart.members,
    [chart.members, focusMemberId],
  )
  const attendanceYMax = useMemo(() => {
    if (valueUnit !== '회') return null
    const values: number[] = []
    for (const row of chart.rows) {
      for (const member of visibleMembers) {
        const value = row[`km_${member.memberId}`]
        if (typeof value === 'number' && Number.isFinite(value)) {
          values.push(value)
        }
      }
    }
    return resolveCountChartYMax(values)
  }, [chart.rows, valueUnit, visibleMembers])
  const {
    setListDragging,
    updateTooltipPosition,
    tooltipCursor,
    tooltipPosition,
    tooltipWrapperStyle,
  } = useComparisonChartTooltip()

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
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={valueUnit === '회' ? false : undefined}
            domain={attendanceYMax != null ? [0, attendanceYMax] : undefined}
            tickFormatter={(v) => (valueUnit === '회' ? `${v}회` : `${v}km`)}
          />
          <Tooltip
            allowEscapeViewBox={{ x: true, y: true }}
            reverseDirection={{ x: true, y: false }}
            cursor={tooltipCursor}
            position={tooltipPosition}
            wrapperStyle={tooltipWrapperStyle}
            animationDuration={0}
            content={createComparisonTooltipRenderer(updateTooltipPosition, (props) => (
              <MileageComparisonTooltip
                active={props.active}
                payload={props.payload}
                label={props.label}
                members={visibleMembers}
                memberColorMap={memberColorMap}
                beatRivalMemberId={beatRivalMemberId}
                valueUnit={valueUnit}
                onListDragChange={setListDragging}
              />
            ))}
          />
          {visibleMembers.map((member) => {
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
                    : {
                        r: 5,
                        fill: getMemberChartColor(
                          member.memberId,
                          memberColorMap,
                          beatRivalMemberId,
                        ),
                      }
                }
                connectNulls
                isAnimationActive={false}
              />
            )
          })}
        </LineChart>
      </ChartContainer>
      {!compact ? (
        <p className="mt-1 text-[10px] text-zinc-500">
          {footerHint ?? '위로 갈수록 이번 달 누적 거리가 늘어납니다.'}
        </p>
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
