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
  ChartTooltipContent,
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'

type ChartPoint = {
  date: string
  label: string
  weight: number
}

interface MemberBodyWeightChartProps {
  points: ChartPoint[]
  className?: string
}

const chartConfig = {
  weight: {
    label: '체중',
    theme: {
      light: '#84cc16',
      dark: '#AAFF00',
    },
  },
}

const CHART_SURFACE =
  '[&_.recharts-cartesian-axis-tick_text]:fill-foreground/90 [&_.recharts-cartesian-axis-tick_text]:text-[11px] [&_.recharts-cartesian-axis-tick_text]:font-medium [&_.recharts-cartesian-grid_line]:stroke-border/70'

export function MemberBodyWeightChart({
  points,
  className,
}: MemberBodyWeightChartProps) {
  const gradientId = useId().replace(/:/g, '')

  const sortedPoints = useMemo(
    () => [...points].sort((a, b) => a.date.localeCompare(b.date)),
    [points],
  )

  const yDomain = useMemo(() => {
    const weights = sortedPoints.map((point) => point.weight)
    const min = Math.min(...weights)
    const max = Math.max(...weights)
    const padding = Math.max(2, (max - min) * 0.2 || 2)
    return [Math.max(0, min - padding), max + padding]
  }, [sortedPoints])

  return (
    <ChartContainer
      config={chartConfig}
      className={cn(CHART_SURFACE, className ?? 'h-[220px] w-full')}
    >
      <ComposedChart
        data={sortedPoints}
        margin={{ top: 16, right: 16, left: 4, bottom: 4 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-weight)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-weight)" stopOpacity={0.02} />
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
          tickMargin={10}
          width={44}
          tickFormatter={(value: number) => `${value}kg`}
        />
        <ChartTooltip
          cursor={{
            stroke: 'var(--color-weight)',
            strokeWidth: 1.5,
            strokeOpacity: 0.5,
          }}
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as ChartPoint | undefined
                return row ? `${row.label}` : '체중'
              }}
              formatter={(value) => (
                <span className="text-sm font-bold tabular-nums text-primary">
                  {value} kg
                </span>
              )}
            />
          }
        />
        <Area
          type="linear"
          dataKey="weight"
          fill={`url(#${gradientId})`}
          stroke="none"
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="weight"
          stroke="var(--color-weight)"
          strokeWidth={3}
          connectNulls
          dot={{
            r: 6,
            fill: 'var(--color-weight)',
            stroke: 'var(--background)',
            strokeWidth: 3,
          }}
          activeDot={{
            r: 8,
            fill: 'var(--color-weight)',
            stroke: 'var(--background)',
            strokeWidth: 3,
          }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
