export type DashboardQuickLinkId =
  | 'lesson-status'
  | 'calendar'
  | 'members'
  | 'attendance'
  | 'lessons'

export const DASHBOARD_QUICK_LINK_IDS: DashboardQuickLinkId[] = [
  'lesson-status',
  'calendar',
  'members',
  'attendance',
  'lessons',
]

const STORAGE_PREFIX = 'one-step-coach:dashboard-quick-links'

function storageKey(role: 'admin' | 'instructor') {
  return `${STORAGE_PREFIX}:${role}`
}

function isQuickLinkId(value: string): value is DashboardQuickLinkId {
  return (DASHBOARD_QUICK_LINK_IDS as string[]).includes(value)
}

export function normalizeQuickLinkOrder(
  order: string[] | null | undefined,
): DashboardQuickLinkId[] {
  const seen = new Set<DashboardQuickLinkId>()
  const next: DashboardQuickLinkId[] = []

  for (const id of order ?? []) {
    if (!isQuickLinkId(id) || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }

  for (const id of DASHBOARD_QUICK_LINK_IDS) {
    if (!seen.has(id)) next.push(id)
  }

  return next
}

export function readDashboardQuickLinkOrder(
  role: 'admin' | 'instructor',
): DashboardQuickLinkId[] {
  if (typeof window === 'undefined') {
    return [...DASHBOARD_QUICK_LINK_IDS]
  }

  try {
    const raw = window.localStorage.getItem(storageKey(role))
    if (!raw) return [...DASHBOARD_QUICK_LINK_IDS]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DASHBOARD_QUICK_LINK_IDS]
    return normalizeQuickLinkOrder(parsed.map(String))
  } catch {
    return [...DASHBOARD_QUICK_LINK_IDS]
  }
}

export function writeDashboardQuickLinkOrder(
  role: 'admin' | 'instructor',
  order: DashboardQuickLinkId[],
) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      storageKey(role),
      JSON.stringify(normalizeQuickLinkOrder(order)),
    )
  } catch {
    // ignore quota / private mode
  }
}
