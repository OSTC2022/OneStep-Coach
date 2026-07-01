import {
  formatWeightDeltaInParens,
  formatWeightDeltaShort,
  weightDeltaTextClass,
} from '@/lib/member-weight-delta'
import { formatBodyMetric } from '@/lib/member-utils'
import { cn } from '@/lib/utils'

export function WeightWithDeltaText({
  weightKg,
  deltaKg,
  className,
  weightClassName,
  showKgSuffix = false,
  wrapDeltaInParens = true,
}: {
  weightKg: number
  deltaKg?: number | null
  className?: string
  weightClassName?: string
  showKgSuffix?: boolean
  wrapDeltaInParens?: boolean
}) {
  const weightLabel = formatBodyMetric(weightKg) ?? String(weightKg)
  const deltaLabel = wrapDeltaInParens
    ? formatWeightDeltaInParens(deltaKg ?? null)
    : formatWeightDeltaShort(deltaKg ?? null)

  return (
    <span className={cn('tabular-nums', className)}>
      <span className={weightClassName}>
        {weightLabel}
        {showKgSuffix ? 'kg' : ''}
      </span>
      {deltaLabel ? (
        <span className={cn('ml-1', weightDeltaTextClass(deltaKg ?? null))}>
          {deltaLabel}
        </span>
      ) : null}
    </span>
  )
}
