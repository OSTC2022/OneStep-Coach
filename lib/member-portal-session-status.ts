import { groupSessionPackagesForDisplay } from '@/lib/session-package-grouping'
import type { MemberPortalSessionStatus } from '@/lib/member-portal-types'
import {
  formatMonthlyPlanRemainingPeriod,
  formatPackagePlanLabel,
  getDaysUntilExpiry,
  isMonthlyPlanPackage,
  isPackageUsableForLesson,
} from '@/lib/session-package-utils'
import type { Member, SessionPackage } from '@/lib/types'

export function buildMemberPortalSessionStatus(
  member: Member,
  packages: SessionPackage[],
): MemberPortalSessionStatus {
  const grouped = groupSessionPackagesForDisplay(packages)
  const monthlyGroups = grouped.filter((group) =>
    isMonthlyPlanPackage(group.primary.note),
  )
  const monthlyGroup =
    monthlyGroups.find((group) => isPackageUsableForLesson(group.primary)) ??
    [...monthlyGroups].sort((a, b) =>
      b.primary.created_at.localeCompare(a.primary.created_at),
    )[0]

  if (monthlyGroup) {
    const pkg = monthlyGroup.primary
    const isUsable = isPackageUsableForLesson(pkg)

    return {
      kind: 'monthly',
      isUsable,
      remainingPeriodLabel: formatMonthlyPlanRemainingPeriod(pkg.expires_at),
      expiresAt: pkg.expires_at,
      planLabel: formatPackagePlanLabel(pkg.total_sessions, pkg.note),
      daysUntilExpiry: getDaysUntilExpiry(pkg.expires_at),
    }
  }

  const remaining = member.remaining_sessions ?? 0

  return {
    kind: 'count',
    isUsable: remaining > 0,
    remainingSessions: remaining,
  }
}
