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
    roles: ['member', 'guardian', 'adult_member'],
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
    id: '/dashboard/calendar',
    title: '캘린더',
    url: '/dashboard/calendar',
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
    id: '/dashboard/settings/adult-running-portal',
    title: '성인 러닝 포털',
    url: '/dashboard/settings/adult-running-portal',
    roles: ['admin'],
  },
  {
    id: '/dashboard/settings/running-schedule',
    title: '러닝 스케줄',
    url: '/dashboard/settings/running-schedule',
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
const HIDDEN_STORAGE_PREFIX = 'one-step-coach:sidebar-menu-hidden'

function storageKey(role: SidebarMenuRole) {
  return `${STORAGE_PREFIX}:${role}`
}

function hiddenStorageKey(role: SidebarMenuRole) {
  return `${HIDDEN_STORAGE_PREFIX}:${role}`
}

export function getDefaultSidebarMenuOrder(role: SidebarMenuRole): string[] {
  return SIDEBAR_MENU_ITEMS.filter((item) => item.roles.includes(role)).map(
    (item) => item.id,
  )
}

/** 기본으로 숨길 메뉴 (저장값 없을 때·초기화 시 적용) */
export function getDefaultSidebarMenuHidden(role: SidebarMenuRole): string[] {
  if (role === 'admin' || role === 'instructor') {
    return ['/dashboard/attendance']
  }
  return []
}

const RUNNING_SCHEDULE_MENU_ID = '/dashboard/settings/running-schedule'
const SETTINGS_MENU_ID = '/dashboard/settings'

function pinRunningScheduleAboveSettings(order: string[]): string[] {
  const scheduleIndex = order.indexOf(RUNNING_SCHEDULE_MENU_ID)
  const settingsIndex = order.indexOf(SETTINGS_MENU_ID)
  if (scheduleIndex < 0 || settingsIndex < 0) return order
  if (scheduleIndex === settingsIndex - 1) return order

  const next = order.filter((id) => id !== RUNNING_SCHEDULE_MENU_ID)
  const nextSettingsIndex = next.indexOf(SETTINGS_MENU_ID)
  if (nextSettingsIndex < 0) return order
  next.splice(nextSettingsIndex, 0, RUNNING_SCHEDULE_MENU_ID)
  return next
}

function insertMissingMenuItemsAtDefaultPositions(
  savedOrder: string[],
  defaultOrder: string[],
): string[] {
  const savedSet = new Set(savedOrder)
  const result = [...savedOrder]

  for (const id of defaultOrder) {
    if (savedSet.has(id)) continue

    const defaultIndex = defaultOrder.indexOf(id)
    let insertAt = result.length

    for (let index = defaultIndex - 1; index >= 0; index -= 1) {
      const anchorId = defaultOrder[index]
      const anchorIndex = result.indexOf(anchorId)
      if (anchorIndex >= 0) {
        insertAt = anchorIndex + 1
        break
      }
    }

    result.splice(insertAt, 0, id)
    savedSet.add(id)
  }

  return result
}

export function normalizeSidebarMenuOrder(
  role: SidebarMenuRole,
  order: string[] | null | undefined,
): string[] {
  const defaultOrder = getDefaultSidebarMenuOrder(role)
  const allowedSet = new Set(defaultOrder)
  const seen = new Set<string>()
  const saved: string[] = []

  for (const id of order ?? []) {
    if (!allowedSet.has(id) || seen.has(id)) continue
    seen.add(id)
    saved.push(id)
  }

  const next =
    saved.length === 0
      ? defaultOrder
      : insertMissingMenuItemsAtDefaultPositions(saved, defaultOrder)

  return pinRunningScheduleAboveSettings(next)
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

export function normalizeSidebarMenuHidden(
  role: SidebarMenuRole,
  hidden: string[] | null | undefined,
): string[] {
  const allowed = new Set(getDefaultSidebarMenuOrder(role))
  const seen = new Set<string>()
  const next: string[] = []

  for (const id of hidden ?? []) {
    if (!allowed.has(id) || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }

  return next
}

export function readSidebarMenuHidden(role: SidebarMenuRole): string[] {
  if (typeof window === 'undefined') {
    return getDefaultSidebarMenuHidden(role)
  }

  try {
    const raw = window.localStorage.getItem(hiddenStorageKey(role))
    if (!raw) return getDefaultSidebarMenuHidden(role)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return getDefaultSidebarMenuHidden(role)
    return normalizeSidebarMenuHidden(role, parsed.map(String))
  } catch {
    return getDefaultSidebarMenuHidden(role)
  }
}

export function writeSidebarMenuHidden(role: SidebarMenuRole, hidden: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      hiddenStorageKey(role),
      JSON.stringify(normalizeSidebarMenuHidden(role, hidden)),
    )
  } catch {
    // ignore quota / private mode
  }
}

export function orderSidebarMenuItems(
  role: SidebarMenuRole,
  order: string[],
  hidden?: string[] | null,
): SidebarMenuItemDef[] {
  const hiddenSet = new Set(normalizeSidebarMenuHidden(role, hidden))
  const byId = new Map(
    SIDEBAR_MENU_ITEMS.filter((item) => item.roles.includes(role)).map(
      (item) => [item.id, item],
    ),
  )

  return normalizeSidebarMenuOrder(role, order)
    .filter((id) => !hiddenSet.has(id))
    .map((id) => byId.get(id))
    .filter((item): item is SidebarMenuItemDef => Boolean(item))
}
