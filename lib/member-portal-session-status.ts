import { groupSessionPackagesForDisplay } from '@/lib/session-package-grouping'
import type { MemberPortalSessionStatus } from '@/lib/member-portal-types'
import {
  formatMonthlyPlanRemainingPeriod,
  formatPackagePlanLabel,
  getDaysUntilExpiry,
  isPackageUsableForLesson,
  isPeriodBasedSessionPackage,
  resolvePackagePeriodExpiryDate,
} from '@/lib/session-package-utils'
import type { Member, SessionPackage } from '@/lib/types'

function buildPeriodSessionStatus(pkg: SessionPackage): MemberPortalSessionStatus {
  const expiresAt = resolvePackagePeriodExpiryDate(pkg)
  const isUsable = isPackageUsableForLesson({
    ...pkg,
    expires_at: expiresAt ?? pkg.expires_at,
  })

  return {
    kind: 'monthly',
    isUsable,
    remainingPeriodLabel: formatMonthlyPlanRemainingPeriod(expiresAt),
    expiresAt,
    planLabel: formatPackagePlanLabel(pkg.total_sessions, pkg.note),
    daysUntilExpiry: getDaysUntilExpiry(expiresAt),
  }
}

function pickPreferredPackage(
  packages: SessionPackage[],
): SessionPackage | undefined {
  if (packages.length === 0) return undefined
  return (
    packages.find((pkg) =>
      isPackageUsableForLesson({
        ...pkg,
        expires_at: resolvePackagePeriodExpiryDate(pkg) ?? pkg.expires_at,
      }),
    ) ??
    [...packages].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  )
}

/**
 * 회원 포털 수업권 상태.
 * 날짜·기간으로 등록된 수업권은 남은 기간(일수), 순수 횟수권만 회차 표시.
 */
export function buildMemberPortalSessionStatus(
  member: Member,
  packages: SessionPackage[],
): MemberPortalSessionStatus {
  const activePackages = packages.filter((pkg) => pkg.is_active !== false)
  const scoped = activePackages.length > 0 ? activePackages : packages

  const periodPackages = scoped.filter((pkg) => isPeriodBasedSessionPackage(pkg))
  const periodPkg = pickPreferredPackage(periodPackages)
  if (periodPkg) {
    return buildPeriodSessionStatus(periodPkg)
  }

  // 그룹 기준으로도 한 번 더 (동일 기간권 중복 등록)
  const grouped = groupSessionPackagesForDisplay(scoped)
  const periodGroup = grouped.find((group) =>
    isPeriodBasedSessionPackage(group.primary),
  )
  if (periodGroup) {
    return buildPeriodSessionStatus(periodGroup.primary)
  }

  const remaining = member.remaining_sessions ?? 0

  return {
    kind: 'count',
    isUsable: remaining > 0,
    remainingSessions: remaining,
  }
}
