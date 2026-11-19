export const EVENT_MATCH_QUERY = 'eventMatch'

/** 카카오 등 미리보기용 공개 경로 (로그인 없이 OG 메타 제공) */
export function buildEventMatchPublicPath(eventId: string) {
  return `/e/${encodeURIComponent(eventId)}`
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
