import {
  isMonthlyRecurringPlan,
  isPackageUsableForLesson,
  parseMonthlyPlanMonthsFromNote,
} from '@/lib/session-package-utils'

export type SessionPackageGroupRow<T> = {
  primary: T
  duplicateCount: number
  groupIds: string[]
  latestPurchaseTotalSessions: number
  cumulativeTotalSessions: number
  cumulativeRemainingSessions: number
}

type GroupablePackage = {
  id: string
  member_id: string
  total_sessions: number
  remaining_sessions: number
  note?: string | null
  is_active: boolean
  expires_at?: string | null
  paid_at?: string | null
  created_at: string
}

export function getSessionPackagePlanKey(pkg: {
  total_sessions: number
  note?: string | null
}): string {
  if (isMonthlyRecurringPlan(pkg.note)) return 'monthly-recurring'
  const months = parseMonthlyPlanMonthsFromNote(pkg.note)
  if (months != null) return `monthly-${months}`
  return `count-${pkg.total_sessions}`
}

export function getSessionPackageGroupKey(pkg: {
  member_id: string
  total_sessions: number
  note?: string | null
}): string {
  return `${pkg.member_id}|${getSessionPackagePlanKey(pkg)}`
}

function pickPrimaryPackage<T extends GroupablePackage>(group: T[]): T {
  return [...group].sort((a, b) => {
    const aUsable = isPackageUsableForLesson(a) ? 0 : 1
    const bUsable = isPackageUsableForLesson(b) ? 0 : 1
    if (aUsable !== bUsable) return aUsable - bUsable
    return a.created_at.localeCompare(b.created_at)
  })[0]
}

function pickLatestPurchasedPackage<T extends GroupablePackage>(group: T[]): T {
  return [...group].sort((a, b) => {
    const aDate = a.paid_at || a.created_at
    const bDate = b.paid_at || b.created_at
    return bDate.localeCompare(aDate)
  })[0]
}

function sumGroupTotalSessions<T extends GroupablePackage>(group: T[]): number {
  return group.reduce((sum, pkg) => sum + pkg.total_sessions, 0)
}

/** 같은 회원·같은 회차권 중복 등록 — 잔여 있는 수업권 기준으로 1행 표시 */
export function groupSessionPackagesForDisplay<T extends GroupablePackage>(
  packages: T[],
): SessionPackageGroupRow<T>[] {
  if (packages.length === 0) return []

  const orderIndex = new Map(packages.map((pkg, index) => [pkg.id, index]))
  const groups = new Map<string, T[]>()

  for (const pkg of packages) {
    const key = getSessionPackageGroupKey(pkg)
    const bucket = groups.get(key) ?? []
    bucket.push(pkg)
    groups.set(key, bucket)
  }

  return Array.from(groups.values())
    .map((group) => {
      const latest = pickLatestPurchasedPackage(group)
      return {
        primary: pickPrimaryPackage(group),
        duplicateCount: group.length,
        groupIds: group.map((item) => item.id),
        latestPurchaseTotalSessions: latest.total_sessions,
        cumulativeTotalSessions: sumGroupTotalSessions(group),
        cumulativeRemainingSessions: group.reduce(
          (sum, pkg) => sum + pkg.remaining_sessions,
          0,
        ),
      }
    })
    .sort(
      (a, b) =>
        (orderIndex.get(a.primary.id) ?? 0) - (orderIndex.get(b.primary.id) ?? 0),
    )
}

export function flattenGroupedSessionPackages<T>(
  groups: SessionPackageGroupRow<T>[],
): T[] {
  return groups.map((group) => group.primary)
}
