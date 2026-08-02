const STORAGE_KEY = 'one-step-coach:settings-menu-order'

export type SettingsMenuTabDef = {
  id: string
  href: string
  label: string
}

export const SETTINGS_MENU_TAB_IDS = [
  '/dashboard/settings',
  '/dashboard/settings/adult-running-portal',
  '/dashboard/settings/running-schedule',
  '/dashboard/settings/marathon-schedule',
  '/dashboard/settings/center-board',
  '/dashboard/settings/adult-center-board',
  '/dashboard/settings/running-league',
  '/dashboard/settings/backup',
  '/dashboard/settings/center-contact',
  '/dashboard/settings/google-calendar',
] as const

export type SettingsMenuTabId = (typeof SETTINGS_MENU_TAB_IDS)[number]

export function getDefaultSettingsMenuOrder(): string[] {
  return [...SETTINGS_MENU_TAB_IDS]
}

function insertMissingAtDefaultPositions(
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

export function normalizeSettingsMenuOrder(
  order: string[] | null | undefined,
): string[] {
  const defaultOrder = getDefaultSettingsMenuOrder()
  const allowedSet = new Set(defaultOrder)
  const seen = new Set<string>()
  const saved: string[] = []

  for (const id of order ?? []) {
    if (!allowedSet.has(id) || seen.has(id)) continue
    seen.add(id)
    saved.push(id)
  }

  if (saved.length === 0) return defaultOrder
  return insertMissingAtDefaultPositions(saved, defaultOrder)
}

export function readSettingsMenuOrder(): string[] {
  if (typeof window === 'undefined') {
    return getDefaultSettingsMenuOrder()
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultSettingsMenuOrder()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return getDefaultSettingsMenuOrder()
    return normalizeSettingsMenuOrder(parsed.map(String))
  } catch {
    return getDefaultSettingsMenuOrder()
  }
}

export function writeSettingsMenuOrder(order: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeSettingsMenuOrder(order)),
    )
  } catch {
    // ignore quota / private mode
  }
}

export function orderSettingsMenuTabs<T extends { id: string }>(
  tabs: readonly T[],
  order: string[],
): T[] {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]))
  return normalizeSettingsMenuOrder(order)
    .map((id) => byId.get(id))
    .filter((tab): tab is T => Boolean(tab))
}
