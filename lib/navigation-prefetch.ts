/** 개발 모드에서는 Turbopack 컴파일과 겹쳐 먹통처럼 느껴질 수 있음 */
export function shouldBackgroundPrefetch() {
  return process.env.NODE_ENV === 'production'
}

/** 목록 행 등 다수 링크 — viewport prefetch 비활성 */
export const LIST_ROW_LINK_PREFETCH = false
