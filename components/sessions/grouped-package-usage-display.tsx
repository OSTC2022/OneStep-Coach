import { cn } from '@/lib/utils'
import {
  formatPackageRemainingDisplay,
  isMonthlyPlanPackage,
  isSessionPackageExpired,
  isSessionPackageOverage,
} from '@/lib/session-package-utils'

type GroupedPackageUsageDisplayProps = {
  remainingSessions: number
  latestPurchaseTotalSessions: number
  cumulativeTotalSessions: number
  note?: string | null
  isActive?: boolean
  expiresAt?: string | null
  paidAt?: string | null
  pausedAt?: string | null
  className?: string
}

export function GroupedPackageUsageDisplay({
  remainingSessions,
  latestPurchaseTotalSessions,
  cumulativeTotalSessions,
  note,
  isActive = true,
  expiresAt,
  paidAt,
  pausedAt,
  className,
}: GroupedPackageUsageDisplayProps) {
  const expired =
    isSessionPackageExpired({
      is_active: isActive,
      remaining_sessions: remainingSessions,
      note,
      expires_at: expiresAt,
      paused_at: pausedAt,
    }) || isSessionPackageOverage(remainingSessions, note)

  if (isMonthlyPlanPackage(note)) {
    return (
      <span
        className={cn(
          'font-bold tabular-nums',
          pausedAt?.trim()
            ? 'text-amber-400'
            : expired
              ? 'text-destructive'
              : 'text-primary',
          className,
        )}
      >
        {formatPackageRemainingDisplay(
          remainingSessions,
          note,
          expiresAt,
          paidAt,
          pausedAt,
        )}
      </span>
    )
  }

  if (expired) {
    return (
      <span className={cn('font-bold tabular-nums text-destructive', className)}>
        {remainingSessions}회 / {latestPurchaseTotalSessions}회 /{' '}
        {cumulativeTotalSessions}회
      </span>
    )
  }

  return (
    <span className={cn('font-bold tabular-nums', className)}>
      <span className="text-primary">{remainingSessions}회</span>
      <span className="text-muted-foreground"> / </span>
      <span className="text-foreground">{latestPurchaseTotalSessions}회</span>
      <span className="text-muted-foreground"> / </span>
      <span className="text-muted-foreground">{cumulativeTotalSessions}회</span>
    </span>
  )
}
