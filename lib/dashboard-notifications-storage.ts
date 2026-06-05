const STORAGE_PREFIX = 'osc-read-notifications-v1'

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`
}

export function getReadNotificationIds(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

export function markNotificationsRead(userId: string, ids: string[]) {
  if (typeof window === 'undefined' || ids.length === 0) return
  const current = getReadNotificationIds(userId)
  for (const id of ids) current.add(id)
  localStorage.setItem(storageKey(userId), JSON.stringify([...current]))
}

export function markNotificationRead(userId: string, id: string) {
  markNotificationsRead(userId, [id])
}
