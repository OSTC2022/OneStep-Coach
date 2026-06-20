'use client'

import type { CenterBoardKind } from '@/lib/types'

const STORAGE_PREFIX = 'center-board-last-seen'

type BoardReadMap = Partial<Record<CenterBoardKind, string>>

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`
}

function readMap(userId: string): BoardReadMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as BoardReadMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(userId: string, map: BoardReadMap) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

export function getBoardLastSeenAt(
  userId: string,
  kind: CenterBoardKind,
): string | null {
  return readMap(userId)[kind] ?? null
}

export function markBoardSeenNow(userId: string, kind: CenterBoardKind) {
  const map = readMap(userId)
  map[kind] = new Date().toISOString()
  writeMap(userId, map)
}

export function countUnreadBoardPosts(
  userId: string,
  kind: CenterBoardKind,
  posts: Array<{ updated_at: string }>,
): number {
  const lastSeen = getBoardLastSeenAt(userId, kind)
  if (!lastSeen) return posts.length
  const seenMs = Date.parse(lastSeen)
  if (!Number.isFinite(seenMs)) return posts.length
  return posts.filter((post) => Date.parse(post.updated_at) > seenMs).length
}
