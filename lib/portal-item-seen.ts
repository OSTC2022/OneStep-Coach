const PREFIX = 'onestep:portal-seen:'
const LEGACY_COMMENTS = 'onestep:event-comment-seen'
const SEEN_LIMIT = 500

export const PORTAL_ITEMS_SEEN_EVENT = 'onestep-portal-items-seen'
export const PORTAL_FEED_EVENT = 'onestep-portal-feed'

function readSeen(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(PREFIX + userId)
    const ids = new Set<string>()
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === 'string') ids.add(id)
        }
      }
    }
    const legacy = localStorage.getItem(LEGACY_COMMENTS)
    if (legacy) {
      const parsed = JSON.parse(legacy) as unknown
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === 'string') ids.add(id.startsWith('comment:') ? id : `comment:${id}`)
        }
      }
      localStorage.removeItem(LEGACY_COMMENTS)
      writeSeen(userId, ids)
    }
    return ids
  } catch {
    return new Set()
  }
}

function writeSeen(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify([...ids].slice(-SEEN_LIMIT)))
  } catch {
    // ignore
  }
}

export function unseenItemIds(userId: string, ids: string[]): string[] {
  const seen = readSeen(userId)
  return ids.filter((id) => !seen.has(id))
}

export function rememberItemIds(userId: string, ids: string[]) {
  if (!userId || ids.length === 0) return
  const seen = readSeen(userId)
  let changed = false
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    changed = true
  }
  if (!changed) return
  writeSeen(userId, seen)
  window.dispatchEvent(new Event(PORTAL_ITEMS_SEEN_EVENT))
}
