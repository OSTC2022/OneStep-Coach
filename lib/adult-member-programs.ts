/** 성인회원 프로그램 구분 (profiles.role = adult_member + members.sport) */

export const ADULT_SPORT_ATHLETICS = '성인회원(육상)' as const
export const ADULT_SPORT_GENERAL = '성인회원(일반)' as const

/** @deprecated 이전 표기 — 감지용으로 유지 */
export const ADULT_SPORT_RUNNING_LEGACY = '성인회원' as const

export type AdultMemberProgram = 'athletics' | 'general'

/** UI·저장 호환: running = athletics */
export type AdultMemberProgramInput = AdultMemberProgram | 'running'

export const ADULT_MEMBER_SPORT_OPTIONS = [
  ADULT_SPORT_ATHLETICS,
  ADULT_SPORT_GENERAL,
] as const

export function normalizeSportLabel(sport: string | null | undefined): string {
  return (sport ?? '').trim().toLowerCase()
}

function normalizeAdultProgram(
  program: AdultMemberProgramInput | null | undefined,
): AdultMemberProgram {
  if (program === 'general') return 'general'
  return 'athletics'
}

/** 체중관리·일반 성인 포털 대상 */
export function isAdultGeneralSport(sport: string | null | undefined): boolean {
  const value = normalizeSportLabel(sport)
  if (!value) return false
  return (
    value.includes('성인회원(일반)') ||
    value.includes('성인(일반)') ||
    value === '일반성인' ||
    (value.includes('성인') && value.includes('일반'))
  )
}

/**
 * 성인 육상(러닝) 포털·리그 대상 sport
 * - 성인회원(일반)은 제외
 * - 성인회원(육상) / 성인회원 / 러닝 / 마라톤 등
 */
export function isAdultRunningSport(sport: string | null | undefined): boolean {
  const value = normalizeSportLabel(sport)
  if (!value) return false
  if (isAdultGeneralSport(sport)) return false
  return (
    value.includes('성인회원(육상)') ||
    value.includes('러닝') ||
    value.includes('running') ||
    value === '성인회원' ||
    value.includes('성인') ||
    value.includes('마라톤') ||
    value.includes('10k') ||
    value.includes('5k') ||
    value.includes('육상')
  )
}

export function resolveAdultMemberProgram(
  sport: string | null | undefined,
): AdultMemberProgram {
  if (isAdultGeneralSport(sport)) return 'general'
  return 'athletics'
}

export function adultProgramSportLabel(
  program: AdultMemberProgramInput | null | undefined,
): string {
  return normalizeAdultProgram(program) === 'general'
    ? ADULT_SPORT_GENERAL
    : ADULT_SPORT_ATHLETICS
}

export function adultProgramDisplayLabel(
  program: AdultMemberProgramInput | null | undefined,
): string {
  return normalizeAdultProgram(program) === 'general'
    ? '성인회원(일반)'
    : '성인회원(육상)'
}

/** 설정 화면 권한 셀렉트 값 */
export type AdultRoleSelectValue =
  | 'adult_member_athletics'
  | 'adult_member_general'

export function adultProgramFromRoleSelect(
  value: string,
): AdultMemberProgram | null {
  if (value === 'adult_member_general') return 'general'
  if (value === 'adult_member_athletics' || value === 'adult_member') {
    return 'athletics'
  }
  return null
}

export function roleSelectFromAdultProgram(
  program: AdultMemberProgram,
): AdultRoleSelectValue {
  return program === 'general'
    ? 'adult_member_general'
    : 'adult_member_athletics'
}
