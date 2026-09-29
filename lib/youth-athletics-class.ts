/** 회원(육상선수반) — 일반 회원 권한 + 육상 선수반 전용 포털 */

export const YOUTH_ATHLETICS_CLASS_SPORT = '회원(육상선수반)' as const
export const YOUTH_ATHLETICS_CLASS_ROLE_LABEL = '회원(육상선수반)' as const
export const YOUTH_ATHLETICS_PORTAL_TITLE = '내 러닝 포털(육상)' as const
export const YOUTH_ATHLETICS_PORTAL_LEAGUE_LABEL = '육상선수반' as const

export function isYouthAthleticsClassSport(
  sport: string | null | undefined,
): boolean {
  const value = (sport ?? '').trim()
  if (!value) return false
  return (
    value === YOUTH_ATHLETICS_CLASS_SPORT ||
    value.includes('육상선수반') ||
    value.includes('선수반')
  )
}
