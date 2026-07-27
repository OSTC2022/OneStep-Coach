import {
  formatHeightDeltaInParens,
  formatHeightDeltaShort,
  heightDeltaTextClass,
} from '@/lib/member-weight-delta'
import { formatBodyMetric } from '@/lib/member-utils'
import { cn } from '@/lib/utils'

export function HeightWithDeltaText({
  heightCm,
  deltaCm,
  className,
  heightClassName,
  showCmSuffix = false,
  wrapDeltaInParens = true,
}: {
  heightCm: number
  deltaCm?: number | null
  className?: string
  heightClassName?: string
  showCmSuffix?: boolean
  wrapDeltaInParens?: boolean
}) {
  const heightLabel = formatBodyMetric(heightCm) ?? String(heightCm)
  const deltaLabel = wrapDeltaInParens
    ? formatHeightDeltaInParens(deltaCm ?? null)
    : formatHeightDeltaShort(deltaCm ?? null)

  return (
    <span className={cn('tabular-nums', className)}>
      <span className={heightClassName}>
        {heightLabel}
        {showCmSuffix ? 'cm' : ''}
      </span>
      {deltaLabel ? (
        <span className={cn('ml-1', heightDeltaTextClass(deltaCm ?? null))}>
          {deltaLabel}
        </span>
      ) : null}
    </span>
  )
}
