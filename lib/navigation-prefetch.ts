/** 백그라운드 idle prefetch — dev 컴파일 폭주 방지 */
export function shouldBackgroundPrefetch() {
  return process.env.NODE_ENV === 'production'
}

/** 사이드바 Link prefetch (프로덕션) */
export function shouldLinkPrefetch() {
  return process.env.NODE_ENV === 'production'
}

/** hover·탭 등 사용자 의도 시 청크 preload (dev 포함) */
export function shouldPreloadRouteChunkOnIntent() {
  return true
}

/** 목록 행 등 다수 링크 — viewport prefetch 비활성 */
export const LIST_ROW_LINK_PREFETCH = false
