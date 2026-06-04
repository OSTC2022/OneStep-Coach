import { filterAndSortKoreanNames } from '@/lib/korean-search'
import { formatMemberCalendarLabel } from '@/lib/member-utils'

const STORAGE_KEY = 'one-step-coach:member-search-recent'
const DEFAULT_MAX = 10

export type MemberRecentSearchEntry = {
  id?: string
  name: string
}

export type MemberFocusPick = {
  id: string
  name: string
  sport?: string | null
  age?: number | null
  birth_date?: string | null
}

export type RecentSearchRow = {
  key: string
  entry: MemberRecentSearchEntry
  member?: MemberFocusPick
  label: string
}

function readRaw(): MemberRecentSearchEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is MemberRecentSearchEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as MemberRecentSearchEntry).name === 'string' &&
        (item as MemberRecentSearchEntry).name.trim().length > 0 &&
        ((item as MemberRecentSearchEntry).id === undefined ||
          typeof (item as MemberRecentSearchEntry).id === 'string'),
    )
  } catch {
    return []
  }
}

function writeRaw(entries: MemberRecentSearchEntry[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // ignore quota / private mode
  }
}

function dedupeKey(entry: MemberRecentSearchEntry) {
  return entry.id ? `id:${entry.id}` : `q:${entry.name.trim()}`
}

/** 클릭·선택 시 맨 위로 올리고 목록에서 제거하지 않음 (LRU) */
function bumpEntry(
  entry: MemberRecentSearchEntry,
  max: number,
): MemberRecentSearchEntry[] {
  const normalized: MemberRecentSearchEntry = {
    ...(entry.id ? { id: entry.id } : {}),
    name: entry.name.trim(),
  }
  if (!normalized.name) return readRaw().slice(0, max)

  const key = dedupeKey(normalized)
  const rest = readRaw().filter((item) => {
    if (dedupeKey(item) === key) return false
    if (normalized.id && item.id === normalized.id) return false
    if (normalized.id && !item.id && item.name.trim() === normalized.name) {
      return false
    }
    if (!normalized.id && item.id && item.name.trim() === normalized.name) {
      return false
    }
    return true
  })

  const next = [normalized, ...rest].slice(0, max)
  writeRaw(next)
  return next
}

export function getMemberRecentSearches(
  max = DEFAULT_MAX,
): MemberRecentSearchEntry[] {
  return readRaw().slice(0, max)
}

export function hasMemberRecentSearches(): boolean {
  return readRaw().length > 0
}

export function touchMemberRecent(
  entry: MemberRecentSearchEntry,
  max = DEFAULT_MAX,
) {
  return bumpEntry(entry, max)
}

export function addMemberRecentSearch(
  entry: MemberRecentSearchEntry,
  max = DEFAULT_MAX,
) {
  return bumpEntry(
    entry.id ? { id: entry.id, name: entry.name } : entry,
    max,
  )
}

export function addMemberRecentQuery(query: string, max = DEFAULT_MAX) {
  const trimmed = query.trim()
  if (trimmed.length < 1) return getMemberRecentSearches(max)
  return bumpEntry({ name: trimmed }, max)
}

function resolveMember(
  entry: MemberRecentSearchEntry,
  allMembers: MemberFocusPick[],
): MemberFocusPick | undefined {
  if (entry.id) {
    const byId = allMembers.find((m) => m.id === entry.id)
    if (byId) return byId
  }
  const exact = allMembers.find((m) => m.name === entry.name.trim())
  if (exact) return exact
  return filterAndSortKoreanNames(allMembers, entry.name, 1)[0]
}

/** 저장된 최근 검색만 표시 (클릭해도 항목 유지, 순서만 변경) */
export function buildRecentSearchRows(
  allMembers: MemberFocusPick[],
  max = DEFAULT_MAX,
): RecentSearchRow[] {
  return getMemberRecentSearches(max).map((entry, index) => {
    const member = resolveMember(entry, allMembers)
    const label = member
      ? formatMemberCalendarLabel(member)
      : entry.name.trim()
    return {
      key: entry.id ?? `q-${entry.name}-${index}`,
      entry: member
        ? { id: member.id, name: member.name }
        : { name: entry.name.trim() },
      member,
      label,
    }
  })
}

/** 최근 기록이 없을 때만 쓰는 기본 회원 목록 */
export function buildDefaultMemberPickerRows(
  available: MemberFocusPick[],
  max = DEFAULT_MAX,
): RecentSearchRow[] {
  return available.slice(0, max).map((member) => ({
    key: member.id,
    entry: { id: member.id, name: member.name },
    member,
    label: formatMemberCalendarLabel(member),
  }))
}
