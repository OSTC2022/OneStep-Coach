import { filterAndSortKoreanNames } from '@/lib/korean-search'

export type MemoQuickAddParseResult = {
  memberQuery: string
  startTime: string | null
  endTime: string | null
}

function padTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function addHour(start: string, hours = 1): string {
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + hours * 60
  const nextH = Math.floor(total / 60) % 24
  const nextM = total % 60
  return padTime(nextH, nextM)
}

function extractTimeFromMemo(text: string): {
  startTime: string
  endTime: string
  remainder: string
} | null {
  const colonMatch = text.match(/(?:^|\s)(\d{1,2})\s*:\s*(\d{2})(?:\s|$)/)
  if (colonMatch) {
    const hour = Number(colonMatch[1])
    const minute = Number(colonMatch[2])
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const startTime = padTime(hour, minute)
      const remainder = text.replace(colonMatch[0], ' ').replace(/\s+/g, ' ').trim()
      return { startTime, endTime: addHour(startTime), remainder }
    }
  }

  const siBunMatch = text.match(/(?:^|\s)(\d{1,2})\s*시\s*(\d{1,2})\s*분(?:\s|$)/)
  if (siBunMatch) {
    const hour = Number(siBunMatch[1])
    const minute = Number(siBunMatch[2])
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const startTime = padTime(hour, minute)
      const remainder = text.replace(siBunMatch[0], ' ').replace(/\s+/g, ' ').trim()
      return { startTime, endTime: addHour(startTime), remainder }
    }
  }

  const siMatch = text.match(/(?:^|\s)(\d{1,2})\s*시(?:\s|$)/)
  if (siMatch) {
    const hour = Number(siMatch[1])
    if (hour >= 0 && hour <= 23) {
      const startTime = padTime(hour, 0)
      const remainder = text.replace(siMatch[0], ' ').replace(/\s+/g, ' ').trim()
      return { startTime, endTime: addHour(startTime), remainder }
    }
  }

  return null
}

export function parseMemoQuickAdd(text: string): MemoQuickAddParseResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { memberQuery: '', startTime: null, endTime: null }
  }

  const time = extractTimeFromMemo(trimmed)
  if (time) {
    return {
      memberQuery: time.remainder.trim(),
      startTime: time.startTime,
      endTime: time.endTime,
    }
  }

  return {
    memberQuery: trimmed,
    startTime: null,
    endTime: null,
  }
}

/** "이교직(39축구)" → "이교직" */
export function stripMemberDisplayMeta(query: string): string {
  const trimmed = query.trim()
  const idx = trimmed.indexOf('(')
  return (idx >= 0 ? trimmed.slice(0, idx) : trimmed).trim()
}

export function getMemoMemberSuggestions<T extends { id: string; name: string }>(
  members: T[],
  query: string,
  limit = 8,
): T[] {
  const q = stripMemberDisplayMeta(query)
  if (!q) return []
  return filterAndSortKoreanNames(members, q, limit)
}

export function resolveMemoMember<T extends { id: string; name: string }>(
  members: T[],
  query: string,
  selected?: T | null,
): T | null {
  if (selected) return selected
  const q = stripMemberDisplayMeta(query)
  if (!q) return null
  const exact = members.find((m) => m.name === q)
  if (exact) return exact
  const suggestions = getMemoMemberSuggestions(members, q, 1)
  if (suggestions.length === 1 && suggestions[0].name === q) {
    return suggestions[0]
  }
  return null
}
