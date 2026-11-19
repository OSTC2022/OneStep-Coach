const STORAGE_KEY = 'onestep:event-comment-seen'
const SEEN_LIMIT = 500

export const EVENT_COMMENTS_SEEN_EVENT = 'onestep-event-comments-seen'

function readSeen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

function writeSeen(ids: Set<string>) {
  try {
    const list = [...ids].slice(-SEEN_LIMIT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

export function unseenCommentIds(ids: string[]): string[] {
  const seen = readSeen() ?? new Set<string>()
  return ids.filter((id) => !seen.has(id))
}

export function rememberCommentIds(ids: string[]) {
  const seen = readSeen() ?? new Set<string>()
  for (const id of ids) seen.add(id)
  writeSeen(seen)
  window.dispatchEvent(new Event(EVENT_COMMENTS_SEEN_EVENT))
}
