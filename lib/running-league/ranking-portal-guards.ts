/**
 * 성인 러닝 포털 랭킹 UI 가드 (§13 구현 주의사항)
 *
 * - TOP_DISPLAY_COUNT: 기본 상위 N명만 노출, 전체보기로 확장
 * - 성별 필터(전체/남자/여자): 반드시 유지 — 회원 만족도 높음(또래·같은 그룹 비교)
 * - 전체보기(FullRankingDialog): 반드시 유지 — 성별·거리·PB/마일리지 필터와 동기화
 * - 성인 러닝 회원만 랭킹 집계 (adult-running-eligibility + resolve-adult-running-member-ids)
 * - 성인 러닝 회원 랭킹에 실명 표시 (mask-member-name)
 * - PB 등록/수정·러닝 기록 추가는 rankings 컴포넌트 footerAction 으로 유지
 * - 필터: rankingView × gender × pbDistance → buildFilteredPortalRankings
 */

/** 랭킹칸 기본 노출 인원 — 전체보기로 나머지 확인 */
export const RANKING_TOP_DISPLAY_COUNT = 10

/** 포털 랭킹 필수 UX — 제거·비활성화 금지 */
export const RANKING_PORTAL_MUST_KEEP = {
  genderFilter: true,
  fullRankingDialog: true,
} as const
