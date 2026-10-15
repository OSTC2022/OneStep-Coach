import { filterSortMembersForPicker } from '@/lib/korean-search'

/** 일정 문장 앞·뒤의 강사 지정 숫자. 1 이교직, 2 장지용 */
export type MemoInstructorQuickCode = '1' | '2'

const INSTRUCTOR_QUICK_CODE_NAMES: Record<MemoInstructorQuickCode, string> = {
  '1': '이교직',
  '2': '장지용',
}

export type MemoQuickAddParseResult = {
  memberQuery: string
  startTime: string | null
  endTime: string | null
  instructorCode: MemoInstructorQuickCode | null
}

export function instructorNameForQuickCode(
  code: MemoInstructorQuickCode | null | undefined,
): string | null {
  if (!code) return null
  return INSTRUCTOR_QUICK_CODE_NAMES[code] ?? null
}

export function resolveInstructorByQuickCode<T extends { id: string; name: string }>(
  instructors: T[],
  code: MemoInstructorQuickCode | null | undefined,
): T | null {
  const name = instructorNameForQuickCode(code)
  if (!name) return null
  const exact = instructors.find((instructor) => instructor.name.trim() === name)
  if (exact) return exact
  return (
    instructors.find((instructor) => instructor.name.replace(/\s+/g, '').includes(name)) ?? null
  )
}

/**
 * 맨 앞 또는 맨 뒤의 1·2만 강사 코드로 본다.
 * 이름·시간과는 한 칸 이상 띄어야 하며, 18:00 같은 시각 숫자는 건드리지 않는다.
 */
function extractInstructorQuickCode(text: string): {
  code: MemoInstructorQuickCode | null
  remainder: string
} {
  let remainder = text.trim()
  let code: MemoInstructorQuickCode | null = null

  const prefix = remainder.match(/^([12])\s+([\s\S]+)$/)
  if (prefix) {
    code = prefix[1] as MemoInstructorQuickCode
    remainder = prefix[2].trim()
  }

  const suffix = remainder.match(/^([\s\S]+?)\s+([12])$/)
  if (suffix) {
    if (!code) code = suffix[2] as MemoInstructorQuickCode
    remainder = suffix[1].trim()
  }

  return { code, remainder }
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
    return { memberQuery: '', startTime: null, endTime: null, instructorCode: null }
  }

  const time = extractTimeFromMemo(trimmed)
  const instructor = extractInstructorQuickCode(time ? time.remainder : trimmed)
  return {
    memberQuery: instructor.remainder.trim(),
    startTime: time?.startTime ?? null,
    endTime: time?.endTime ?? null,
    instructorCode: instructor.code,
  }
}

/** "이교직(39축구)" → "이교직" */
export function stripMemberDisplayMeta(query: string): string {
  const trimmed = query.trim()
  const idx = trimmed.indexOf('(')
  return (idx >= 0 ? trimmed.slice(0, idx) : trimmed).trim()
}

export function getMemoMemberSuggestions<T extends { id: string; name: string; sport?: string | null }>(
  members: T[],
  query: string,
  limit = 15,
): T[] {
  const q = stripMemberDisplayMeta(query)
  if (!q) return []
  return filterSortMembersForPicker(members, q, { limit })
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
  const suggestions = getMemoMemberSuggestions(members, q, 2)
  // 후보가 하나면 Enter만으로도 바로 연결
  if (suggestions.length === 1) return suggestions[0]
  return null
}
