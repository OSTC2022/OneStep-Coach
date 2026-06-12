import type { UserRole } from '@/lib/types'

export type SidebarMenuRole = UserRole

export type SidebarMenuItemDef = {
  id: string
  title: string
  url: string
  roles: SidebarMenuRole[]
}

export const SIDEBAR_MENU_ITEMS: SidebarMenuItemDef[] = [
  {
    id: '/dashboard/my',
    title: '마이페이지',
    url: '/dashboard/my',
    roles: ['member', 'guardian'],
  },
  {
    id: '/dashboard',
    title: '대시보드',
    url: '/dashboard',
    roles: ['admin', 'instructor'],
  },
  {
    id: '/dashboard/lesson-status',
    title: '수업현황',
    url: '/dashboard/lesson-status',
    roles: ['admin', 'instructor'],
  },
  {
    id: '/dashboard/members',
    title: '회원 관리',
    url: '/dashboard/members',
    roles: ['admin', 'instructor'],
  },
  {
    id: '/dashboard/members/new',
    title: '회원 추가',
    url: '/dashboard/members/new',
    roles: ['admin'],
  },
  {
    id: '/dashboard/sessions',
    title: '세션/결제',
    url: '/dashboard/sessions',
    roles: ['admin'],
  },
  {
    id: '/dashboard/lessons',
    title: '수업 등록',
    url: '/dashboard/lessons',
    roles: ['admin', 'instructor'],
  },
  {
    id: '/dashboard/calendar',
    title: '캘린더',
    url: '/dashboard/calendar',
    roles: ['admin', 'instructor'],
  },
  {
    id: '/dashboard/attendance',
    title: '출석 체크',
    url: '/dashboard/attendance',
    roles: ['admin', 'instructor'],
  },
  {
    id: '/dashboard/instructors',
    title: '강사 관리',
    url: '/dashboard/instructors',
    roles: ['admin'],
  },
  {
    id: '/dashboard/reports',
    title: '리포트',
    url: '/dashboard/reports',
    roles: ['admin'],
  },
  {
    id: '/dashboard/settings/center-contact',
    title: '센터 연락',
    url: '/dashboard/settings/center-contact',
    roles: ['admin'],
  },
  {
    id: '/dashboard/settings',
    title: '설정',
    url: '/dashboard/settings',
    roles: ['admin'],
  },
]

const STORAGE_PREFIX = 'one-step-coach:sidebar-menu-order'

function storageKey(role: SidebarMenuRole) {
  return `${STORAGE_PREFIX}:${role}`
}

export function getDefaultSidebarMenuOrder(role: SidebarMenuRole): string[] {
  return SIDEBAR_MENU_ITEMS.filter((item) => item.roles.includes(role)).map(
    (item) => item.id,
  )
}

export function normalizeSidebarMenuOrder(
  role: SidebarMenuRole,
  order: string[] | null | undefined,
): string[] {
  const allowed = getDefaultSidebarMenuOrder(role)
  const allowedSet = new Set(allowed)
  const seen = new Set<string>()
  const next: string[] = []

  for (const id of order ?? []) {
    if (!allowedSet.has(id) || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }

  for (const id of allowed) {
    if (!seen.has(id)) next.push(id)
  }

  return next
}

export function readSidebarMenuOrder(role: SidebarMenuRole): string[] {
  if (typeof window === 'undefined') {
    return getDefaultSidebarMenuOrder(role)
  }

  try {
    const raw = window.localStorage.getItem(storageKey(role))
    if (!raw) return getDefaultSidebarMenuOrder(role)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return getDefaultSidebarMenuOrder(role)
    return normalizeSidebarMenuOrder(role, parsed.map(String))
  } catch {
    return getDefaultSidebarMenuOrder(role)
  }
}

export function writeSidebarMenuOrder(role: SidebarMenuRole, order: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      storageKey(role),
      JSON.stringify(normalizeSidebarMenuOrder(role, order)),
    )
  } catch {
    // ignore quota / private mode
  }
}

export function orderSidebarMenuItems(
  role: SidebarMenuRole,
  order: string[],
): SidebarMenuItemDef[] {
  const byId = new Map(
    SIDEBAR_MENU_ITEMS.filter((item) => item.roles.includes(role)).map(
      (item) => [item.id, item],
    ),
  )

  return normalizeSidebarMenuOrder(role, order)
    .map((id) => byId.get(id))
    .filter((item): item is SidebarMenuItemDef => Boolean(item))
}
