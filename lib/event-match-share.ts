export const EVENT_MATCH_QUERY = 'eventMatch'

/** 카카오 OG 캐시 무효화용 — 미리보기 문구/이미지 바꿀 때 올리면 됨 */
export const EVENT_SHARE_PREVIEW_VERSION = '3'

/** 카카오 등 미리보기용 공개 경로 (로그인 없이 OG 메타 제공) */
export function buildEventMatchPublicPath(eventId: string) {
  const params = new URLSearchParams()
  params.set('v', EVENT_SHARE_PREVIEW_VERSION)
  return `/e/${encodeURIComponent(eventId)}?${params.toString()}`
}

/** 로그인 후 이벤트 패널을 열 대시보드 경로 */
export function buildEventMatchPortalPath(
  eventId: string,
  portalPath = '/dashboard/running-portal',
) {
  const base = portalPath.startsWith('/') ? portalPath : `/${portalPath}`
  const url = new URL(base, 'https://onesteptc.local')
  url.searchParams.set(EVENT_MATCH_QUERY, eventId)
  return `${url.pathname}?${url.searchParams.toString()}`
}

export function buildEventMatchShareUrl(
  eventId: string,
  _portalPath = '/dashboard/running-portal',
) {
  const path = buildEventMatchPublicPath(eventId)
  if (typeof window === 'undefined') return path
  return new URL(path, window.location.origin).toString()
}
