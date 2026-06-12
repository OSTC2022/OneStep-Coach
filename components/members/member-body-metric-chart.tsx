'use client'

import { useId, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
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
  ChartTooltipContent,
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'

export type MetricChartPoint = {
  date: string
  label: string
  value: number
}

interface MemberBodyMetricChartProps {
  points: MetricChartPoint[]
  metricKey?: string
  metricLabel?: string
  unit?: string
  formatValue?: (value: number) => string
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
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return unit ? `${text}${unit}` : text
}

export function MemberBodyMetricChart({
  points,
  metricKey = 'metric',
  metricLabel = '지표',
  unit = '',
  formatValue,
  className,
}: MemberBodyMetricChartProps) {
  const gradientId = useId().replace(/:/g, '')
  const format = formatValue ?? ((value: number) => defaultFormat(value, unit))

  const sortedPoints = useMemo(
    () => [...points].sort((a, b) => a.date.localeCompare(b.date)),
    [points],
  )

  const yDomain = useMemo(() => {
    const values = sortedPoints.map((point) => point.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const padding = Math.max(unit === 'kg' ? 2 : 0.5, (max - min) * 0.2 || 1)
    return [Math.max(0, min - padding), max + padding] as [number, number]
  }, [sortedPoints, unit])

  const yAxisWidth = useMemo(() => {
    const [min, max] = yDomain
    const longest = format(max).length
    const shortest = format(min).length
    const chars = Math.max(longest, shortest)
    return Math.max(48, chars * 7 + 12)
  }, [yDomain, format])

  const config = {
    [metricKey]: chartConfig.metric,
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
            <stop offset="0%" stopColor={`var(--color-${metricKey})`} stopOpacity={0.4} />
            <stop offset="100%" stopColor={`var(--color-${metricKey})`} stopOpacity={0.02} />
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
          tickFormatter={(value: number) => format(value)}
        />
        <ChartTooltip
          cursor={{
            stroke: `var(--color-${metricKey})`,
            strokeWidth: 1.5,
            strokeOpacity: 0.5,
          }}
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as MetricChartPoint | undefined
                if (!row) return metricLabel
                return format(parseISO(row.date), 'yyyy.M.d (EEE)', { locale: ko })
              }}
              formatter={(value) => (
                <span className="text-sm font-bold tabular-nums text-primary">
                  {format(Number(value))}
                </span>
              )}
            />
          }
        />
        <Area
          type="linear"
          dataKey="value"
          fill={`url(#${gradientId})`}
          stroke="none"
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="value"
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
