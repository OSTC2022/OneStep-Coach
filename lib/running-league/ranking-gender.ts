import type { RunningLeagueParticipant } from '@/lib/types'

/** DB `members.gender` — male | female (null = 미등록) */
export type MemberGender = 'male' | 'female'
export type RankingGenderFilter = 'all' | 'male' | 'female'

export const RANKING_GENDER_FILTERS: Array<{ value: RankingGenderFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'male', label: '남자' },
  { value: 'female', label: '여자' },
]

  const MALE_GENDER_VALUES = new Set(['male', 'm', 'man', '남', '남자', '남성'])
  const FEMALE_GENDER_VALUES = new Set(['female', 'f', 'woman', '여', '여자', '여성'])

/**
 * members.gender 등 다양한 입력을 male | female 로 정규화합니다.
 * null/빈값/인식 불가 값은 null (미분류) 입니다.
 */
export function normalizeMemberGender(value: unknown): MemberGender | null {
  if (value == null) return null

  const raw = String(value).trim()
  if (!raw) return null

  const normalized = raw.toLowerCase()

  if (MALE_GENDER_VALUES.has(normalized)) return 'male'
  if (FEMALE_GENDER_VALUES.has(normalized)) return 'female'

  return null
}

export function hasRegisteredMemberGender(value: unknown): boolean {
  return normalizeMemberGender(value) != null
}

export function resolveParticipantGender(
  participant: Pick<RunningLeagueParticipant, 'member'>,
): MemberGender | null {
  return normalizeMemberGender(participant.member?.gender)
}

export function filterParticipantsByGender(
  participants: ReadonlyArray<RunningLeagueParticipant>,
  filter: RankingGenderFilter,
): RunningLeagueParticipant[] {
  if (filter === 'all') return [...participants]
  return participants.filter((row) => resolveParticipantGender(row) === filter)
}

export function countUnclassifiedParticipants(
  participants: ReadonlyArray<RunningLeagueParticipant>,
): number {
  return participants.filter((row) => resolveParticipantGender(row) == null).length
}

export function canApplyClientGenderFilter(
  rankingBundle: { participants: ReadonlyArray<RunningLeagueParticipant> } | null,
  filter: RankingGenderFilter,
): boolean {
  if (filter === 'all') return true
  return rankingBundle != null
}

/** UI에서 남자/여자 칩 비활성 여부 — 현재 선택값과 무관하게 bundle 유무만 본다 */
export function isGenderFilterUnavailable(
  rankingBundle: { participants: ReadonlyArray<RunningLeagueParticipant> } | null,
): boolean {
  return rankingBundle == null
}

export function getGenderFilterDescription(filter: RankingGenderFilter): string {
  if (filter === 'all') {
    return '성인 회원 전체 · 남자/여자로 같은 그룹 안에서 순위를 비교할 수 있어요'
  }
  if (filter === 'male') return '남성 회원만 · 같은 그룹(또래) 안에서의 순위'
  return '여성 회원만 · 같은 그룹(또래) 안에서의 순위'
}

/** 전체보기·모아보기 등 UI에 표시할 성별 범위 라벨 */
export function getGenderFilterScopeLabel(filter: RankingGenderFilter): string {
  if (filter === 'male') return '남자'
  if (filter === 'female') return '여자'
  return '전체'
}

export function formatRankingFullViewButtonLabel(input: {
  genderFilter: RankingGenderFilter
  rankedCount: number
}): string {
  const scope =
    input.genderFilter === 'all' ? '' : ` · ${getGenderFilterScopeLabel(input.genderFilter)}`
  return `전체보기${scope} (${input.rankedCount}명)`
}

export const GENDER_FILTER_UNAVAILABLE_MESSAGE =
  '성별 필터를 사용하려면 랭킹 데이터를 불러와야 합니다. 잠시 후 다시 시도해주세요.'

export const GENDER_UNCLASSIFIED_HINT =
  '성별 미등록 회원은 전체 랭킹에만 포함되며, 남자/여자 필터에서는 제외됩니다.'
