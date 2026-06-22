const CHO = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const

const JAMO_ONLY = /^[ㄱ-ㅎㅏ-ㅣ]+$/
const HANGUL_SYLLABLE = /[가-힣]/

/** 자모(ㅈ)만 입력 — 완성형(장)이 있으면 false */
export function isChosungOnlyQuery(query: string): boolean {
  const q = query.trim()
  if (!q) return false
  if (HANGUL_SYLLABLE.test(q)) return false
  return JAMO_ONLY.test(q)
}

export function getChosung(text: string): string {
  let result = ''
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code >= 0xac00 && code <= 0xd7a3) {
      result += CHO[Math.floor((code - 0xac00) / 588)]
      continue
    }
    result += char
  }
  return result
}

function findSequentialChosungStart(chosung: string, query: string): number {
  for (let start = 0; start < chosung.length; start++) {
    let qi = 0
    for (let ci = start; ci < chosung.length && qi < query.length; ci++) {
      if (chosung[ci] === query[qi]) qi++
    }
    if (qi === query.length) return start
  }
  return chosung.length
}

export function matchKoreanNameSearch(name: string, query: string): boolean {
  return scoreKoreanNameSearch(name, query) < Number.POSITIVE_INFINITY
}

export function scoreKoreanNameSearch(name: string, query: string): number {
  const q = query.trim()
  if (!q) return 0

  const lowerName = name.toLowerCase()
  const lowerQ = q.toLowerCase()

  if (lowerName === lowerQ) return 0
  if (lowerName.startsWith(lowerQ)) return 1 + lowerName.length

  const textIndex = lowerName.indexOf(lowerQ)
  if (textIndex >= 0) return 40 + textIndex

  // 완성형 한글(장) 등은 글자 그대로만 매칭 — 초성(ㅈ) 폴백 없음
  if (!isChosungOnlyQuery(q)) {
    return Number.POSITIVE_INFINITY
  }

  const chosung = getChosung(name)

  if (chosung.startsWith(q)) {
    return 100 + chosung.length - q.length
  }

  const start = findSequentialChosungStart(chosung, q)
  if (start < chosung.length) {
    return 160 + start * 8 + chosung.length
  }

  return Number.POSITIVE_INFINITY
}

export function filterAndSortKoreanNames<T extends { name: string }>(
  items: T[],
  query: string,
  limit = 15,
): T[] {
  const q = query.trim()
  if (!q) return items.slice(0, limit)

  return items
    .map((item) => ({ item, score: scoreKoreanNameSearch(item.name, q) }))
    .filter(({ score }) => score < Number.POSITIVE_INFINITY)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      return a.item.name.localeCompare(b.item.name, 'ko')
    })
    .slice(0, limit)
    .map(({ item }) => item)
}

export function scoreMemberSearch(
  member: { name: string; sport?: string | null },
  query: string,
): number {
  const nameScore = scoreKoreanNameSearch(member.name, query)
  const sport = member.sport?.trim()
  const sportScore = sport ? scoreKoreanNameSearch(sport, query) + 5 : Number.POSITIVE_INFINITY
  return Math.min(nameScore, sportScore)
}

export function matchMemberSearch(
  member: { name: string; sport?: string | null },
  query: string,
): boolean {
  return scoreMemberSearch(member, query) < Number.POSITIVE_INFINITY
}

function preferredNameTier(name: string, preferredName: string): number {
  if (name === preferredName) return 0
  if (name.startsWith(preferredName)) return 1
  return 2
}

export function sortMembersByPreferredName<T extends { name: string }>(
  members: T[],
  preferredName?: string | null,
): T[] {
  const preferred = preferredName?.trim()
  if (!preferred) return members
  return [...members].sort((a, b) => {
    const tierDiff =
      preferredNameTier(a.name, preferred) - preferredNameTier(b.name, preferred)
    if (tierDiff !== 0) return tierDiff
    return a.name.localeCompare(b.name, 'ko')
  })
}

/** 회원 검색·선택 — 동일 이름 우선 정렬 */
export function filterSortMembersForPicker<T extends { name: string; sport?: string | null }>(
  members: T[],
  query: string,
  options?: { preferredName?: string | null; limit?: number },
): T[] {
  const q = query.trim()
  const limit = options?.limit ?? 15
  const preferred = options?.preferredName?.trim()

  if (!q) {
    return sortMembersByPreferredName(members, preferred).slice(0, limit)
  }

  return members
    .map((item) => {
      let score = scoreMemberSearch(item, q)
      if (preferred) {
        if (item.name === preferred) score -= 10_000
        else if (item.name.startsWith(preferred)) score -= 5_000
      }
      return { item, score }
    })
    .filter(({ score }) => score < Number.POSITIVE_INFINITY)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      return a.item.name.localeCompare(b.item.name, 'ko')
    })
    .slice(0, limit)
    .map(({ item }) => item)
}
