import { Badge } from '@/components/ui/badge'
import { isNewMemberBadgeActive } from '@/lib/member-new-signup-badge'
import { cn } from '@/lib/utils'

export function MemberNewSignupBadge({
  badgeUntil,
  className,
}: {
  badgeUntil?: string | null
  className?: string
}) {
  if (!isNewMemberBadgeActive(badgeUntil)) return null

  return (
    <Badge
      variant="secondary"
      className={cn(
        'shrink-0 border-amber-500/35 bg-amber-500/15 px-1.5 py-0 text-[10px] font-semibold text-amber-200',
        className,
      )}
    >
      신규
    </Badge>
  )
}

export function MemberNameWithStaffBadges({
  name,
  badgeUntil,
  showStaffBadges = false,
  className,
  nameClassName,
}: {
  name: string
  badgeUntil?: string | null
  showStaffBadges?: boolean
  className?: string
  nameClassName?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center gap-1.5', className)}>
      <span className={cn('min-w-0 truncate', nameClassName)}>{name}</span>
      {showStaffBadges ? <MemberNewSignupBadge badgeUntil={badgeUntil} /> : null}
    </span>
  )
}
