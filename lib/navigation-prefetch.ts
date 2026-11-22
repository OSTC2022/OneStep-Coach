/** 백그라운드 idle prefetch — 설치 앱 soft nav 오류를 키울 수 있어 끔 */
export function shouldBackgroundPrefetch() {
  return false
}

/** 사이드바 Link prefetch — 프로덕션에서도 끔 (읽을 수 없음 오류 완화) */
export function shouldLinkPrefetch() {
  return false
}

/** hover·탭 등 사용자 의도 시 청크 preload (dev 포함) */
export function shouldPreloadRouteChunkOnIntent() {
  return true
}

/** 목록 행 등 다수 링크 — viewport prefetch 비활성 */
export const LIST_ROW_LINK_PREFETCH = false
