'use client'

import { MemberBodyMetricChart } from '@/components/members/member-body-metric-chart'
import { formatBodyMetric } from '@/lib/member-utils'

type ChartPoint = {
  date: string
  label: string
  weight: number
}

interface MemberBodyWeightChartProps {
  points: ChartPoint[]
  className?: string
}

export function MemberBodyWeightChart({ points, className }: MemberBodyWeightChartProps) {
  return (
    <MemberBodyMetricChart
      points={points.map((point) => ({
        date: point.date,
        label: point.label,
        value: point.weight,
      }))}
      metricKey="weight"
      metricLabel="체중"
      unit="kg"
      formatValue={(value) => `${formatBodyMetric(value)}kg`}
      className={className}
    />
  )
}
