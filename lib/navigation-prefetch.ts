/** 백그라운드 idle prefetch — 설치 앱 soft nav 오류를 키울 수 있어 끔 */
export function shouldBackgroundPrefetch() {
  return false
}

/** 사이드바·Link HTML/RSC prefetch — 끔 (읽을 수 없음 오류 완화) */
export function shouldLinkPrefetch() {
  return false
}

/**
 * hover·탭 시 청크 preload.
 * 설치 앱(standalone)에서는 클릭 직전 네트워크 경합을 피하려고 끔.
 */
export function shouldPreloadRouteChunkOnIntent() {
  if (typeof window === 'undefined') return false
  try {
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    ) {
      return false
    }
  } catch {
    /* ignore */
  }
  return true
}

/** 목록 행 등 다수 링크 — viewport prefetch 비활성 */
export const LIST_ROW_LINK_PREFETCH = false
