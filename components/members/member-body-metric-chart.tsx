'use client'

import { useId, useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart'
import {
  formatWeightDeltaLabel,
  weightDeltaTextClass,
} from '@/lib/member-weight-delta'
import { cn } from '@/lib/utils'

export type MetricChartPoint = {
  date: string
  label: string
  value: number
}

type ChartRow = MetricChartPoint & {
  deltaFromPrevious: number | null
}

interface MemberBodyMetricChartProps {
  points: MetricChartPoint[]
  metricKey?: string
  metricLabel?: string
  unit?: string
  formatValue?: (value: number) => string
  /** 호버 지점의 직전(시간순 이전) 값 대비 변화량 표시 */
  showPreviousDelta?: boolean
  className?: string
}

const chartConfig = {
  metric: {
    label: '지표',
    theme: {
      light: '#84cc16',
      dark: '#AAFF00',
    },
  },
}

const CHART_SURFACE =
  '[&_.recharts-cartesian-axis-tick_text]:fill-foreground/90 [&_.recharts-cartesian-axis-tick_text]:text-[11px] [&_.recharts-cartesian-axis-tick_text]:font-medium [&_.recharts-cartesian-grid_line]:stroke-border/70'

function defaultFormat(value: number, unit: string) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return unit ? `-${unit}` : '-'
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1)
  return unit ? `${text}${unit}` : text
}

export function MemberBodyMetricChart({
  points,
  metricKey = 'metric',
  metricLabel = '지표',
  unit = '',
  formatValue,
  showPreviousDelta = false,
  className,
}: MemberBodyMetricChartProps) {
  const gradientId = useId().replace(/:/g, '')
  const formatMetric = (raw: number | string) => {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n)) return '-'
    return formatValue ? formatValue(n) : defaultFormat(n, unit)
  }

  const sortedPoints = useMemo((): ChartRow[] => {
    const sorted = [...points]
      .map((point) => ({
        ...point,
        value: Number(point.value),
      }))
      .filter((point) => Number.isFinite(point.value))
      .sort((a, b) => a.date.localeCompare(b.date))

    return sorted.map((point, index) => {
      const previous = index > 0 ? sorted[index - 1] : null
      const deltaFromPrevious =
        previous != null
          ? Number((point.value - previous.value).toFixed(1))
          : null
      return { ...point, deltaFromPrevious }
    })
  }, [points])

  const yDomain = useMemo(() => {
    const values = sortedPoints.map((point) => point.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const padding = Math.max(unit === 'kg' ? 2 : 0.5, (max - min) * 0.2 || 1)
    return [Math.max(0, min - padding), max + padding] as [number, number]
  }, [sortedPoints, unit])

  const yAxisWidth = useMemo(() => {
    const [min, max] = yDomain
    const longest = formatMetric(max).length
    const shortest = formatMetric(min).length
    const chars = Math.max(longest, shortest)
    return Math.max(48, chars * 7 + 12)
  }, [yDomain])

  const config = {
    [metricKey]: {
      ...chartConfig.metric,
      label: metricLabel,
    },
  }

  return (
    <ChartContainer
      config={config}
      className={cn(CHART_SURFACE, className ?? 'h-[220px] w-full')}
    >
      <ComposedChart
        data={sortedPoints}
        margin={{ top: 16, right: 16, left: 0, bottom: 4 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={`var(--color-${metricKey})`}
              stopOpacity={0.4}
            />
            <stop
              offset="100%"
              stopColor={`var(--color-${metricKey})`}
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={24}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={yDomain}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={yAxisWidth}
          tick={{ fontSize: 11, fill: 'currentColor' }}
          tickFormatter={(value: number) => formatMetric(value)}
        />
        <ChartTooltip
          cursor={{
            stroke: `var(--color-${metricKey})`,
            strokeWidth: 1.5,
            strokeOpacity: 0.5,
          }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const item =
              payload.find((row) => row.name === metricLabel) ?? payload[0]
            const row = item?.payload as ChartRow | undefined
            if (!row || !Number.isFinite(row.value)) return null

            const delta = showPreviousDelta ? row.deltaFromPrevious : null
            const deltaLabel =
              unit === 'kg'
                ? formatWeightDeltaLabel(delta)
                : delta == null
                  ? null
                  : delta === 0
                    ? `0${unit}`
                    : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}${unit}`

            return (
              <div className="grid min-w-[7rem] gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">{metricLabel}</span>
                  <span className="font-semibold tabular-nums text-primary">
                    {formatMetric(row.value)}
                  </span>
                </div>
                {showPreviousDelta ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-muted-foreground">직전</span>
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        unit === 'kg'
                          ? weightDeltaTextClass(delta)
                          : delta == null || delta === 0
                            ? 'text-muted-foreground'
                            : delta > 0
                              ? 'text-blue-500'
                              : 'text-red-500',
                      )}
                    >
                      {deltaLabel ?? '-'}
                    </span>
                  </div>
                ) : null}
              </div>
            )
          }}
        />
        <Area
          type="linear"
          dataKey="value"
          fill={`url(#${gradientId})`}
          stroke="none"
          isAnimationActive={false}
          legendType="none"
          activeDot={false}
        />
        <Line
          type="linear"
          dataKey="value"
          name={metricLabel}
          stroke={`var(--color-${metricKey})`}
          strokeWidth={3}
          connectNulls
          dot={{
            r: 6,
            fill: `var(--color-${metricKey})`,
            stroke: 'var(--background)',
            strokeWidth: 3,
          }}
          activeDot={{
            r: 8,
            fill: `var(--color-${metricKey})`,
            stroke: 'var(--background)',
            strokeWidth: 3,
          }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
